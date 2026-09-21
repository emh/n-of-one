// Opt-in live API smoke check. Sends only fictional fixtures; does not save a journal or memories.
import assert from 'node:assert/strict';
import { validateEvent } from '../shared/schema.js';
const base = process.env.TEST_WORKER_URL || 'http://127.0.0.1:8787';
const health = await fetch(`${base}/api/health`).then((response) => response.json());
assert.ok(
  health.typesafeReady && health.llmReady,
  'Configure both keys in the local Worker first.',
);
const response = await fetch(`${base}/api/parse`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '1200 20min warmup; 40min weights\n1300 Ate two eggs\n1400 Drank 500ml water\n1500 Bodyweight 180lb, body fat 18%\n1600 Did not run for 20 minutes today\n2300 Went to bed',
    date: '2026-09-20',
    time: '12:00',
    timezone: 'America/Vancouver',
    memories: [],
  }),
});
const result = await response.json();
console.log(
  JSON.stringify(
    {
      status: response.status,
      parserVersion: result.parserVersion,
      events: result.events?.map((event) => ({
        sourceLine: event.sourceLine,
        type: event.type,
        time: event.time,
        data: event.data,
        interpretation: event.interpretation,
      })),
      diagnostics: result.parseDiagnostics,
      error: result.error,
    },
    null,
    2,
  ),
);
assert.equal(response.status, 200, JSON.stringify(result));
result.events.forEach((event) => validateEvent(event));
assert.equal(result.events.length, 7);
assert.deepEqual(
  result.events
    .slice(0, 2)
    .map((event) => [event.type, event.data.modality, event.data.durationMinutes, event.time]),
  [
    ['exercise', 'movement', 20, '12:00'],
    ['exercise', 'strength', 40, '12:00'],
  ],
);
assert.equal(result.events[2].type, 'food');
assert.equal(result.events[2].interpretation.provider, 'llm');
assert.equal(result.events[3].data.volumeMl, 500);
assert.equal(result.events[4].data.weightLb, 180);
assert.equal(result.events[4].data.bodyFatPct, 18);
assert.ok(['subjective', 'other'].includes(result.events[5].type));
assert.equal(result.events[6].data.sleepAction, 'bed');
assert.ok(
  result.events.some((event) => event.interpretation.provider === 'typesafe'),
  'The fixture should exercise the TypeSafe path.',
);
console.log(
  'Live hybrid parser passed: compound exercise, food fallback, hydration, body measurements, negation, and sleep.',
);
