import { validateEvent, normalizeModality } from './schema.js';
export const uid = () => crypto.randomUUID();
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}
export function startOfWeek(value) {
  const day = new Date(`${value}T12:00:00`).getDay();
  return addDays(value, -(day === 0 ? 6 : day - 1));
}
export function compareVersions(a = '', b = '') {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function nextVersion(previous = '', deviceId, now = Date.now()) {
  const [wall = '0', counter = '0'] = previous.split(':');
  const nextWall = Math.max(now, Number(wall));
  const nextCounter = nextWall === Number(wall) ? Number(counter) + 1 : 0;
  return `${String(nextWall).padStart(13, '0')}:${String(nextCounter).padStart(8, '0')}:${deviceId}`;
}
export function mergeRecords(local, incoming) {
  const records = new Map(local.map((record) => [record.id, record]));
  for (const record of incoming)
    if (
      !records.has(record.id) ||
      compareVersions(record.version, records.get(record.id).version) > 0
    )
      records.set(record.id, record);
  return [...records.values()];
}
export function acceptReview(review, previous = null, now = new Date().toISOString()) {
  if (!review.events.length) throw new Error('Add at least one event before accepting.');
  review.events.forEach(validateEvent);
  const id = previous?.id || review.id || uid();
  const events = review.events.map((event) => ({
    ...event,
    data: { ...event.data, modality: normalizeModality(event.data.modality) },
    id: event.id || uid(),
    journalEntryId: id,
    timestamp: new Date(`${event.date}T${event.time}:00`).toISOString(),
  }));
  const original = review.originalEvents || [];
  const corrections = original.flatMap((event) => {
    const edited = events.find((item) => item.id === event.id);
    return JSON.stringify({ ...edited, timestamp: undefined, journalEntryId: undefined }) ===
      JSON.stringify({ ...event, timestamp: undefined, journalEntryId: undefined })
      ? []
      : [{ before: event, after: edited || null, at: now }];
  });
  events
    .filter((event) => !original.some((item) => item.id === event.id))
    .forEach((event) => corrections.push({ before: null, after: event, at: now }));
  const old = previous?.data;
  return {
    id,
    kind: 'entry',
    deleted: false,
    data: {
      text: review.text,
      date: review.date,
      referenceTime: review.referenceTime || null,
      timezone: review.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      events,
      originalEvents: original,
      parserVersion: review.parserVersion,
      parseDiagnostics: review.parseDiagnostics ?? old?.parseDiagnostics ?? null,
      corrections,
      reviewEdits: review.reviewEdits || [],
      parseAttempts: review.parseAttempts || [],
      createdAt: old?.createdAt || now,
      acceptedAt: now,
      revisions: old ? [...(old.revisions || []), { ...old, revisions: undefined }] : [],
    },
  };
}
export function allEvents(records) {
  return records
    .filter((r) => r.kind === 'entry' && !r.deleted)
    .flatMap((r) => r.data.events)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
export function midpoint(low, high) {
  return low == null ? null : (low + (high ?? low)) / 2;
}
export function rangeLabel(low, high, suffix = '') {
  if (low == null) return '—';
  const format = (n) => Math.round(n).toLocaleString();
  return low === high || high == null
    ? `~${format(low)}${suffix}`
    : `~${format(low)}–${format(high)}${suffix}`;
}
export function durationLabel(minutes) {
  return minutes == null
    ? '—'
    : minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${Math.round(minutes % 60)}m` : ''}`
      : `${Math.round(minutes)}m`;
}
