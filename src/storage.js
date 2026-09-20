import { withEventOrigins } from '../shared/event-origin.js';
import { openDB } from 'idb';
import { compareVersions, nextVersion, uid } from '../shared/model.js';
const dbPromise = openDB('n-of-one', 1, {
  upgrade(db) {
    db.createObjectStore('records', { keyPath: 'id' });
    db.createObjectStore('meta');
    db.createObjectStore('drafts', { keyPath: 'id' });
  },
});
export const getRecords = async () =>
  (await (await dbPromise).getAll('records')).map((record) =>
    record.kind === 'entry' ? { ...record, data: withEventOrigins(record.data) } : record,
  );
export const getDrafts = async () =>
  (await (await dbPromise).getAll('drafts'))
    .filter((draft) => !draft.entryId)
    .map(withEventOrigins);
export const saveDraft = async (draft) => {
  if (draft.entryId) return;
  return (await dbPromise).put('drafts', draft);
};
export const deleteDraft = async (id) => (await dbPromise).delete('drafts', id);
export const getMeta = async (key) => (await dbPromise).get('meta', key);
export const setMeta = async (key, value) => (await dbPromise).put('meta', value, key);
export async function saveRecords(records) {
  const db = await dbPromise;
  const tx = db.transaction(['records', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  const deviceId = (await meta.get('deviceId')) || uid();
  await meta.put(deviceId, 'deviceId');
  let clock = (await meta.get('clock')) || '';
  for (const record of records) {
    clock = nextVersion(clock, deviceId);
    await tx.objectStore('records').put({ ...record, version: clock, dirty: true });
  }
  await meta.put(clock, 'clock');
  await tx.done;
}
export async function mergeRemote(remote, submitted, cursor) {
  const db = await dbPromise;
  const tx = db.transaction(['records', 'meta'], 'readwrite');
  const store = tx.objectStore('records');
  const meta = tx.objectStore('meta');
  let clock = (await meta.get('clock')) || '';
  for (const record of remote) {
    const local = await store.get(record.id);
    if (compareVersions(record.version, clock) > 0) clock = record.version;
    if (!local || compareVersions(record.version, local.version) > 0)
      await store.put({ ...record, dirty: false });
  }
  for (const sent of submitted) {
    const current = await store.get(sent.id);
    if (current?.version === sent.version) await store.put({ ...current, dirty: false });
  }
  await meta.put(clock, 'clock');
  await meta.put(cursor, 'cursor');
  await tx.done;
}
export async function resetSyncCursor() {
  const db = await dbPromise;
  const tx = db.transaction(['records', 'meta'], 'readwrite');
  await tx.objectStore('meta').put(0, 'cursor');
  for (const record of await tx.objectStore('records').getAll())
    await tx.objectStore('records').put({ ...record, dirty: true });
  await tx.done;
}
export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('n-of-one.settings')) || {};
  } catch {
    return {};
  }
}
export function saveSettings(settings) {
  localStorage.setItem('n-of-one.settings', JSON.stringify(settings));
}
export function apiBase(settings) {
  return (
    settings.workerUrl ||
    import.meta.env.VITE_WORKER_URL ||
    (import.meta.env.DEV ? location.origin : '')
  ).replace(/\/+$/, '');
}
