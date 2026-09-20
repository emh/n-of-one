import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, nextVersion, acceptReview, allEvents } from '../shared/model.js';
import { dailySummary, weekSummary, bodySeries, sleepSessions } from '../shared/analytics.js';
import { blankData, validateEvent, relevantMemories } from '../shared/schema.js';
const event = (type, date, time, data = {}) => ({
  id: crypto.randomUUID(),
  type,
  date,
  time,
  title: 'Test event',
  sourceText: 'source',
  timestamp: new Date(`${date}T${time}:00`).toISOString(),
  data: { ...blankData(), ...data },
});
test('legacy zones and renamed categories share totals and remain editable without losing history', () => {
  const date = '2026-09-18';
  const events = ['zone_1', 'movement', 'zone_2', 'cardio'].map((modality) =>
    event('exercise', date, '12:00', { modality, durationMinutes: 20 }),
  );
  events.forEach((item) => validateEvent(item));
  assert.deepEqual(dailySummary(events, date).activity, { movement: 40, cardio: 40 });
  assert.deepEqual(weekSummary(events, '2026-09-14').activity, { movement: 40, cardio: 40 });
  const accepted = acceptReview({
    id: 'legacy',
    date,
    text: 'Original entry',
    events,
    originalEvents: structuredClone(events),
  });
  assert.deepEqual(
    accepted.data.events.map((item) => item.data.modality),
    ['movement', 'movement', 'cardio', 'cardio'],
  );
  assert.equal(accepted.data.originalEvents[0].data.modality, 'zone_1');
  assert.equal(events[2].data.modality, 'zone_2');
});
test('independent offline additions survive record merging in either direction', () => {
  const a = { id: 'a', version: '0000000000001:00000000:phone' },
    b = { id: 'b', version: '0000000000002:00000000:laptop' };
  assert.deepEqual(
    mergeRecords([a], [b])
      .map((r) => r.id)
      .sort(),
    ['a', 'b'],
  );
  assert.deepEqual(
    mergeRecords([b], [a])
      .map((r) => r.id)
      .sort(),
    ['a', 'b'],
  );
});
test('tombstones prevent an old offline copy resurrecting a deleted entry', () => {
  const old = { id: 'a', version: '1', deleted: false },
    deleted = { id: 'a', version: '2', deleted: true };
  assert.equal(mergeRecords([deleted], [old])[0].deleted, true);
  assert.equal(mergeRecords([old], [deleted])[0].deleted, true);
});
test('logical clock advances past observed remote time even when device clock is behind', () => {
  assert.equal(
    nextVersion('0000000000200:00000004:remote', 'phone', 100),
    '0000000000200:00000005:phone',
  );
});
test('reaccepting an edit replaces canonical events and keeps prior source history', () => {
  const original = event('exercise', '2026-09-18', '11:00', {
    modality: 'strength',
    durationMinutes: 20,
  });
  const review = {
    id: 'journal-1',
    text: '1100 strength 20min',
    date: '2026-09-18',
    events: [original],
    originalEvents: [original],
    parserVersion: 'v1',
  };
  const first = acceptReview(review);
  const changed = acceptReview(
    {
      ...review,
      text: '1100 strength 25min',
      events: [{ ...original, data: { ...original.data, durationMinutes: 25 } }],
    },
    first,
  );
  assert.equal(changed.id, first.id);
  assert.equal(changed.data.events.length, 1);
  assert.equal(changed.data.revisions.length, 1);
  assert.equal(changed.data.revisions[0].text, review.text);
  assert.equal(changed.data.corrections.length, 1);
  assert.equal(dailySummary(allEvents([changed]), '2026-09-18').exercise, 25);
});
test('unlogged food stays unknown and does not lower weekly averages', () => {
  const meal = event('food', '2026-09-14', '10:00', {
    proteinLow: 40,
    proteinHigh: 50,
    caloriesLow: 400,
    caloriesHigh: 500,
  });
  const note = event('subjective', '2026-09-15', '10:00', { note: 'tired' });
  const week = weekSummary([meal, note], '2026-09-14');
  assert.equal(week.protein, 45);
  assert.equal(week.foodDays, 1);
  assert.equal(week.days[1].proteinLow, null);
});
test('sleep crosses midnight and belongs to the wake date', () => {
  const bed = event('sleep', '2026-09-17', '23:00', { sleepAction: 'bed' });
  const wake = event('sleep', '2026-09-18', '07:30', { sleepAction: 'wake', wakeState: 'groggy' });
  assert.equal(sleepSessions([bed, wake])[0].minutes, 510);
  assert.equal(dailySummary([bed, wake], '2026-09-18').sleep, 510);
  assert.equal(dailySummary([bed, wake], '2026-09-17').sleep, null);
  assert.equal(sleepSessions([wake])[0].minutes, null);
});
test('a sleep pairing more than a day apart is unknown', () => {
  const result = sleepSessions([
    event('sleep', '2026-09-15', '23:00', { sleepAction: 'bed' }),
    event('sleep', '2026-09-18', '07:00', { sleepAction: 'wake' }),
  ]);
  assert.equal(result[0].minutes, null);
});
test('moving average uses a seven-calendar-day window and mass needs paired readings', () => {
  const points = bodySeries([
    event('body_composition', '2026-09-01', '08:00', { weightLb: 240 }),
    event('body_composition', '2026-09-17', '08:00', { weightLb: 220, bodyFatPct: 25 }),
    event('body_composition', '2026-09-18', '08:00', { weightLb: 218 }),
  ]);
  assert.equal(points[2].average, 219);
  assert.equal(points[1].fatMass, 55);
  assert.equal(points[2].fatMass, null);
});
test('validation rejects reversed estimate ranges and invalid time', () => {
  assert.throws(
    () =>
      validateEvent(
        event('food', '2026-09-18', '10:00', {
          proteinLow: 50,
          proteinHigh: 40,
          caloriesLow: 400,
          caloriesHigh: 500,
        }),
      ),
    /lower estimate/,
  );
  assert.throws(
    () => validateEvent({ ...event('other', '2026-09-18', '10:00'), time: '25:00' }),
    /valid date and time/,
  );
  assert.throws(() => validateEvent(event('exercise', '2026-09-18', '10:00')), /Complete/);
});
test('memory lookup uses normalized whole phrases and ignores deleted presets', () => {
  const memories = [
    { data: { alias: 'protein shake' } },
    { data: { alias: 'shake' }, deleted: true },
    { data: { alias: 'tea' } },
  ];
  assert.equal(relevantMemories('1300 Protein shake; steak for dinner', memories).length, 1);
});

import { journalLines } from '../shared/parser-context.js';
test('timestamps and retrospective dates are resolved independently of the LLM', () => {
  const lines = journalLines(
    '2026-09-17\n2300 went to bed\n2026-09-18\n0730 woke up\n11:00 test marker\nnote without time',
    '2026-09-18',
    '17:00',
  );
  assert.equal(lines[0].date, '2026-09-17');
  assert.equal(lines[0].time, '23:00');
  assert.equal(lines[1].time, '07:30');
  assert.equal(lines[2].time, '11:00');
  assert.equal(lines[3].time, '17:00');
  assert.throws(() => journalLines('2500 invalid', '2026-09-18', '17:00'), /valid 24-hour/);
});
import { validateBackup } from '../shared/backup.js';
test('backup validation checks all records before any import can write', () => {
  const entry = acceptReview({
    id: 'backup-test',
    text: 'a note',
    date: '2026-09-18',
    events: [event('subjective', '2026-09-18', '12:00', { note: 'a note' })],
    parserVersion: 'manual-v1',
  });
  assert.equal(
    validateBackup({ schemaVersion: 1, records: [entry], drafts: [] }).records.length,
    1,
  );
  const broken = structuredClone(entry);
  broken.data.events[0].timestamp = 'broken';
  assert.throws(() => validateBackup({ schemaVersion: 1, records: [entry, broken] }), /timestamp/);
  assert.throws(() => validateBackup({ schemaVersion: 1, records: [entry, entry] }), /duplicate/);
});
