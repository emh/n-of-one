import test from 'node:test';
import assert from 'node:assert/strict';
import { manualState, replaceParsedEvents, withEventOrigins } from '../shared/event-origin.js';
import { acceptReview } from '../shared/model.js';
import { blankData } from '../shared/schema.js';
const event = (id, origin) => ({
  id,
  origin,
  type: 'fasting',
  title: 'Water fast',
  sourceText: '',
  date: '2026-09-20',
  time: '10:00',
  data: { ...blankData(), fastType: 'water' },
});
test('reparse replaces parsed events while retaining manual edits, IDs and memories', () => {
  const manual = event('manual', 'manual'),
    parsed = event('old', 'parsed');
  const entry = {
    events: [parsed, manual],
    originalEvents: [parsed],
    remember: { manual: { alias: 'fast' }, old: { alias: 'old' } },
    reviewEdits: [{ before: null, after: manual }],
  };
  const pending = { ...entry, ...manualState(entry), originalEvents: null };
  const next = { ...pending, ...replaceParsedEvents(pending, { events: [event('new')] }) };
  assert.deepEqual(
    next.events.map((e) => e.id),
    ['new', 'manual'],
  );
  assert.deepEqual(next.events[1], manual);
  assert.deepEqual(Object.keys(next.remember), ['manual']);
  assert.deepEqual(
    next.originalEvents.map((e) => e.id),
    ['new'],
  );
  const accepted = acceptReview({ ...next, id: 'entry', text: 'fasting', date: '2026-09-20' });
  assert.ok(accepted.data.events.every((e) => e.journalEntryId === 'entry'));
  assert.equal(accepted.data.events[1].origin, 'manual');
  assert.equal(accepted.data.events[1].data.note, null);
  assert.deepEqual(
    entry.events.map((e) => e.id),
    ['old', 'manual'],
  );
  const again = replaceParsedEvents(next, { events: [event('newer')] });
  assert.deepEqual(
    again.events.map((e) => e.id),
    ['newer', 'manual'],
  );
});
test('legacy manually added events are recognized without relabeling edited parsed events', () => {
  const parsed = event('parsed'),
    manual = event('manual');
  const normalized = withEventOrigins({
    events: [{ ...parsed, title: 'Edited' }, manual],
    originalEvents: [parsed],
  });
  assert.deepEqual(
    normalized.events.map((e) => e.origin),
    ['parsed', 'manual'],
  );
  assert.equal(
    withEventOrigins({ events: [manual], parserVersion: 'manual-v1' }).events[0].origin,
    'manual',
  );
});
