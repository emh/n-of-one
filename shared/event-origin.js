// Older entries identify additions by their absence from the original parser output.
export function withEventOrigins(entry) {
  if (!entry.events) return entry;
  const original = entry.originalEvents;
  return {
    ...entry,
    events: entry.events.map((event) => ({
      ...event,
      origin:
        event.origin ||
        (entry.parserVersion === 'manual-v1' ||
        (Array.isArray(original) && !original.some((item) => item.id === event.id))
          ? 'manual'
          : 'parsed'),
    })),
  };
}
export function manualState(entry) {
  const events = (withEventOrigins(entry).events || []).filter(
    (event) => event.origin === 'manual',
  );
  const ids = new Set(events.map((event) => event.id));
  return {
    events,
    remember: Object.fromEntries(
      Object.entries(entry.remember || {}).filter(([id]) => ids.has(id)),
    ),
    reviewEdits: (entry.reviewEdits || []).filter((edit) =>
      ids.has(edit.after?.id || edit.before?.id),
    ),
  };
}
export function replaceParsedEvents(entry, result) {
  const manual = manualState(entry);
  const parsed = result.events.map((event) => ({ ...event, origin: 'parsed' }));
  return {
    ...result,
    ...manual,
    events: [...parsed, ...manual.events],
    originalEvents: structuredClone(parsed),
  };
}
