// Explicitly opt-in: sends only these fictional fixtures to TypeSafe and uses API tokens.
import { loadEnv } from 'vite';
import { createClient } from '../server/api.js';
import { parseJournal } from '../server/engine.js';

const env = { ...loadEnv('development', process.cwd(), 'TYPESAFE_'), ...process.env };
const key = env.TYPESAFE_API_KEY || env.TYPESAFE_KEY;
if (!key) throw new Error('Set TYPESAFE_API_KEY or TYPESAFE_KEY in this app’s .env first.');
const cases = [
  {
    text: 'Went running for 8 km over 45 minutes',
    expected: { activity: 'run', distance_km: 8, duration_minutes: 45 },
  },
  { text: 'Coffee and a bowl of oats', expected: {} },
  {
    text: 'Went for a run',
    expected: { activity: 'run', distance_km: null, duration_minutes: null },
  },
  { text: 'Did not run today', expected: {} },
  {
    text: 'Ran eight km in forty minutes',
    expected: { activity: 'run', distance_km: 8, duration_minutes: null },
  },
  {
    text: 'Ran 3 miles in 25 minutes',
    expected: { activity: 'run', distance_km: null, duration_minutes: 25 },
  },
];
const result = await parseJournal(
  {
    text: cases.map((c) => c.text).join('\n'),
    date: '2026-09-20',
    offsetMinutes: 420,
    examples: [
      {
        id: 'fixture-run',
        content: 'Ran 5 km in 30 minutes',
        data: { activity: 'run', distance_km: 5, duration_minutes: 30 },
      },
    ],
  },
  { ask: createClient(key), model: env.TYPESAFE_MODEL || 'jev-latest' },
);
const evaluated = result.records.map((record, i) => ({
  source: record.content,
  expected: cases[i].expected,
  actual: record.data,
  pass: JSON.stringify(record.data) === JSON.stringify(cases[i].expected),
  match: record.inference.match,
  fields: record.inference.fields,
}));
console.log(
  JSON.stringify(
    {
      model: result.model,
      calls: result.calls,
      tokens: result.input_tokens + result.output_tokens,
      ms: result.duration_ms,
      warnings: result.warnings,
      passed: evaluated.filter((c) => c.pass).length,
      total: cases.length,
      cases: evaluated,
    },
    null,
    2,
  ),
);
if (result.warnings.length || evaluated.some((c) => !c.pass)) process.exitCode = 1;

const compound = await parseJournal(
  {
    text: '1200 20min warmup; 40min weights',
    date: '2026-09-20',
    offsetMinutes: 420,
    examples: [
      {
        id: 'fixture-movement',
        content: '15min warmup',
        data: { exercise_type: 'movement', duration_minutes: 15 },
      },
      {
        id: 'fixture-strength',
        content: '30min weights',
        data: { exercise_type: 'strength', duration_minutes: 30 },
      },
    ],
  },
  { ask: createClient(key), model: env.TYPESAFE_MODEL || 'jev-latest' },
);
const expectedCompound = [
  { exercise_type: 'movement', duration_minutes: 20 },
  { exercise_type: 'strength', duration_minutes: 40 },
];
const compoundPass =
  !compound.warnings.length &&
  JSON.stringify(compound.records.map((r) => r.data)) === JSON.stringify(expectedCompound);
console.log(
  JSON.stringify(
    {
      scenario: 'compound exercise',
      pass: compoundPass,
      model: compound.model,
      calls: compound.calls,
      warnings: compound.warnings,
      records: compound.records,
    },
    null,
    2,
  ),
);
if (!compoundPass) process.exitCode = 1;
