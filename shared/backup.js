import { validDate, validateEvent } from './schema.js';
function recordData(record) {
  if (
    !record ||
    typeof record.id !== 'string' ||
    !record.id ||
    record.id.length > 100 ||
    !['entry', 'memory'].includes(record.kind) ||
    typeof record.deleted !== 'boolean'
  )
    throw new Error('Invalid backup record.');
  if (record.deleted) return;
  if (record.kind === 'entry') {
    if (
      !validDate(record.data?.date) ||
      typeof record.data.text !== 'string' ||
      !Array.isArray(record.data.events)
    )
      throw new Error('Invalid journal entry in backup.');
    record.data.events.forEach((event) => {
      validateEvent(event);
      if (
        typeof event.id !== 'string' ||
        event.journalEntryId !== record.id ||
        !Number.isFinite(Date.parse(event.timestamp))
      )
        throw new Error('Invalid event identity or timestamp in backup.');
    });
  } else {
    if (
      typeof record.data?.alias !== 'string' ||
      !record.data.alias.trim() ||
      !['food', 'exercise'].includes(record.data.type)
    )
      throw new Error('Invalid remembered phrase in backup.');
    validateEvent({
      type: record.data.type,
      date: '2000-01-01',
      time: '00:00',
      title: 'Memory',
      sourceText: 'Memory',
      data: record.data.eventData,
    });
  }
}
export function validateBackup(backup) {
  if (
    backup?.schemaVersion !== 1 ||
    !Array.isArray(backup.records) ||
    (backup.drafts !== undefined && !Array.isArray(backup.drafts))
  )
    throw new Error('Choose an n-of-one JSON backup.');
  backup.records.forEach(recordData);
  if (new Set(backup.records.map((r) => r.id)).size !== backup.records.length)
    throw new Error('This backup contains duplicate record IDs.');
  for (const draft of backup.drafts || []) {
    if (
      typeof draft.id !== 'string' ||
      !draft.id ||
      typeof draft.text !== 'string' ||
      !validDate(draft.date) ||
      !['write', 'review'].includes(draft.mode)
    )
      throw new Error('Invalid draft in backup.');
    if (draft.events !== null && draft.events !== undefined) {
      if (!Array.isArray(draft.events)) throw new Error('Invalid draft events.');
      draft.events.forEach((event) => validateEvent(event, { complete: false }));
    }
  }
  return backup;
}
