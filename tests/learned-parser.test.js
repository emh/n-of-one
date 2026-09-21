import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsingAcceptedEntries } from '../shared/learned-parser.js';
import { acceptReview } from '../shared/model.js';
import { journalLines } from '../shared/parser-context.js';
import { blankData } from '../shared/schema.js';

const input = (text) => ({ text, date: '2026-09-21', time: '14:30' });
const noRemote = () => {
  assert.fail('A learned entry must not make ANY network or model request.');
};
function example(text = '20min bike ride', data = {}, extra = {}) {
  const date = '2026-09-20';
  const events = journalLines(text, date, '12:00').map((line) => ({
    id: `event-${line.sourceLine}`,
    ...line,
    title: line.text,
    origin: 'parsed',
    type: 'exercise',
    data: { ...blankData(), durationMinutes: 20, modality: 'cardio', ...data },
  }));
  return acceptReview(
    { id: 'accepted-ride', text, date, events, originalEvents: structuredClone(events), ...extra },
    null,
    '2026-09-20T12:00:00Z',
  );
}
function fallback(pending) {
  return {
    parserVersion: 'remote-fixture',
    events: journalLines(pending.text, pending.date, pending.time).map((line) => ({
      ...line,
      type: 'other',
      title: 'Remote interpretation',
      data: { ...blankData(), note: line.text },
      interpretation: { provider: 'llm', model: 'fixture' },
    })),
    parseDiagnostics: { typesafe: { lines: [{ sourceLine: 0, reason: 'requires_llm' }] } },
  };
}

test('an accepted 20min bike ride resolves 45min locally with current dates, quantities and provenance', async () => {
  const record = example();
  const result = await parseUsingAcceptedEntries(
    input('1600 45min bike ride'),
    [record],
    [],
    noRemote,
  );
  const event = result.events[0];
  assert.equal(event.data.durationMinutes, 45);
  assert.equal(event.data.modality, 'cardio');
  assert.equal(event.date, '2026-09-21');
  assert.equal(event.time, '16:00');
  assert.equal(event.title, '45min bike ride');
  assert.equal(event.interpretation.provider, 'learned');
  assert.equal(event.interpretation.exampleEntryId, record.id);
  assert.equal(event.interpretation.probability, undefined);
  assert.equal(result.parseDiagnostics.learned.remoteLines, 0);
  assert.equal(record.data.events[0].data.durationMinutes, 20);
});

test('equivalent duration units, case and whitespace reuse the accepted category', async () => {
  const result = await parseUsingAcceptedEntries(
    input('0.75 hours   BIKE RIDE'),
    [example()],
    [],
    noRemote,
  );
  assert.equal(result.events[0].data.durationMinutes, 45);
});

test('unaccepted drafts and deleted entries cannot teach the parser', async () => {
  for (const record of [
    null,
    { ...example(), deleted: true },
    { ...example(), data: { ...example().data, acceptedAt: null } },
  ]) {
    let calls = 0;
    const result = await parseUsingAcceptedEntries(
      input('45min bike ride'),
      record ? [record] : [],
      [],
      (pending) => {
        calls++;
        return fallback(pending);
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.events[0].interpretation.provider, 'llm');
  }
});

test('changed wording, qualifiers, negation, multiple quantities and invalid durations use the model', async () => {
  for (const text of [
    '45min cycling',
    '45min bike ride with knee pain',
    'did not do 45min bike ride',
    '45min bike ride zone 2',
    '20min bike ride and 25min weights',
    '-45min bike ride',
    '0min bike ride',
    '2000min bike ride',
    'bike ride',
  ]) {
    let calls = 0;
    await parseUsingAcceptedEntries(input(text), [example()], [], (pending) => {
      calls++;
      return fallback(pending);
    });
    assert.equal(calls, 1, text);
  }
});

test('the latest accepted correction updates a pattern; reclassification prevents an older example winning', async () => {
  const old = example();
  const corrected = example('20min bike ride', { modality: 'movement' });
  corrected.id = 'corrected';
  corrected.data.acceptedAt = '2026-09-20T13:00:00Z';
  const result = await parseUsingAcceptedEntries(
    input('45min bike ride'),
    [old, corrected],
    [],
    noRemote,
  );
  assert.equal(result.events[0].data.modality, 'movement');
  corrected.data.events[0].type = 'subjective';
  const changed = await parseUsingAcceptedEntries(
    input('45min bike ride'),
    [old, corrected],
    [],
    fallback,
  );
  assert.equal(changed.events[0].interpretation.provider, 'llm');
});

test('corrected quantities, extra notes, manual and split observations do not become duration templates', async () => {
  const split = example();
  split.data.originalEvents.push({ ...split.data.originalEvents[0], id: 'split' });
  const manual = example();
  manual.data.events[0].origin = 'manual';
  for (const record of [
    example(undefined, { durationMinutes: 30 }),
    example(undefined, { note: 'Estimated, includes intervals' }),
    manual,
    split,
  ]) {
    const result = await parseUsingAcceptedEntries(
      input('45min bike ride'),
      [record],
      [],
      fallback,
    );
    assert.equal(result.events[0].interpretation.provider, 'llm');
  }
});

test('a note that copies the source is refreshed instead of carrying the old duration', async () => {
  const result = await parseUsingAcceptedEntries(
    input('45min bike ride'),
    [example(undefined, { note: '20min bike ride' })],
    [],
    noRemote,
  );
  assert.equal(result.events[0].data.note, '45min bike ride');
});

test('compound inputs merge learned and remote events without sending resolved siblings', async () => {
  const result = await parseUsingAcceptedEntries(
    input('1200 45min bike ride; ate eggs; 30min bike ride'),
    [example()],
    [],
    (pending) => {
      assert.equal(pending.text, '2026-09-21 12:00 ate eggs');
      return fallback(pending);
    },
  );
  assert.deepEqual(
    result.events.map((event) => event.sourceLine),
    [0, 1, 2],
  );
  assert.deepEqual(
    result.events.map((event) => event.interpretation.provider),
    ['learned', 'llm', 'learned'],
  );
  assert.ok(result.events.every((event) => event.time === '12:00'));
  assert.equal(result.events[1].sourceContext.part, 2);
  assert.equal(result.events[1].sourceText, 'ate eggs');
  assert.equal(result.parseDiagnostics.typesafe.lines[0].sourceLine, 1);
});

test('the entire compound entry stays unresolved when a required remote portion fails or is omitted', async () => {
  for (const remote of [
    () => {
      throw new Error('offline');
    },
    () => ({ events: [] }),
    (pending) => ({
      ...fallback(pending),
      events: [{ ...fallback(pending).events[0], sourceLine: 2 }],
    }),
  ]) {
    await assert.rejects(
      parseUsingAcceptedEntries(input('45min bike ride; ate eggs'), [example()], [], remote),
    );
  }
});

test('simple saved category preferences override history without copying their old duration', async () => {
  const preset = {
    kind: 'memory',
    data: {
      alias: 'bike ride',
      type: 'exercise',
      eventData: { ...blankData(), durationMinutes: 90, modality: 'movement' },
    },
  };
  const result = await parseUsingAcceptedEntries(
    input('45min bike ride'),
    [example()],
    [preset],
    noRemote,
  );
  assert.equal(result.events[0].data.modality, 'movement');
  assert.equal(result.events[0].data.durationMinutes, 45);
  preset.data.eventData.note = 'Includes stretching';
  const complex = await parseUsingAcceptedEntries(
    input('45min bike ride'),
    [example()],
    [preset],
    fallback,
  );
  assert.equal(complex.events[0].interpretation.provider, 'llm');
});

test('learned examples need no new storage and persist through normal accepted entry serialization', async () => {
  const record = JSON.parse(JSON.stringify(example()));
  const result = await parseUsingAcceptedEntries(input('45min bike ride'), [record], [], noRemote);
  const saved = acceptReview({
    id: 'second',
    ...input('45min bike ride'),
    events: result.events,
    originalEvents: result.events,
    ...result,
  });
  assert.equal(saved.data.events[0].interpretation.exampleEntryId, record.id);
  assert.equal(saved.data.parseDiagnostics.learned.lines, 1);
});
