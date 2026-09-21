import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFor, parseJournal, readChoice } from '../server/engine.js';
import { createClient } from '../server/api.js';
import { splitJournal, validateData, validateExamples } from '../shared/journal.js';

const context = {
  date: '2026-09-20',
  offsetMinutes: 420,
  capturedAt: '2026-09-20T20:45:15Z',
  threshold: 0.7,
};
const examples = [
  {
    id: 'run-example',
    content: 'Ran 5 km in 30 minutes',
    data: { activity: 'run', distance_km: 5, duration_minutes: 30 },
  },
];
const input = (text, memory = examples) => ({ ...context, text, examples: memory });
function choice(criteria, selected, probability = 0.95) {
  const keys = Object.keys(criteria);
  return {
    type: 'choice',
    choice: selected,
    confidence: 0.88,
    probabilities: Object.fromEntries(
      keys.map((key) => [
        key,
        key === selected ? probability : (1 - probability) / (keys.length - 1),
      ]),
    ),
  };
}
function fixtureAsk({
  route = 'example_0',
  routeProbability = 0.95,
  values = { '/activity': 'run', '/distance_km': 8, '/duration_minutes': 45 },
  fieldProbability = 0.95,
} = {}) {
  return async ({ questions }) => ({
    model: 'jev-test-fixture',
    usage: { input_tokens: 100, output_tokens: 20 },
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (id.startsWith('route_'))
          return [id, choice(question.criteria, route, routeProbability)];
        const path = Object.keys(values).find((path) =>
          question.instructions.question.includes(JSON.stringify(path)),
        );
        const candidate = Object.entries(question.criteria).find(
          ([, option]) => option?.value === values[path],
        );
        return [id, choice(question.criteria, candidate?.[0] ?? 'unknown', fieldProbability)];
      }),
    ),
  });
}

test('zero examples preserve exact source spans and use no model call', async () => {
  const text = '  07:30 Coffee\n\nA walk with a friend';
  const result = await parseJournal(input(text, []), {
    ask: () => {
      throw new Error('Should not call the model');
    },
  });
  assert.equal(result.calls, 0);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].timestamp, '2026-09-20T07:30:00-07:00');
  assert.equal(result.records[1].timestamp, '2026-09-20T13:45:15-07:00');
  assert.equal(result.records[1].source.line, 3);
  for (const record of result.records) {
    assert.deepEqual(record.data, {});
    assert.equal(text.slice(record.source.start, record.source.end), record.source.text);
    assert.equal(record.inference.confidence, null);
  }
});

test('timestamps support compact, 12-hour and 24-hour prefixes without changing content', () => {
  const records = splitJournal('0730 Coffee\n12 am Sleep\n1:15 PM Walk\n23:59 Read', context);
  assert.deepEqual(
    records.map((r) => r.timestamp.slice(11, 16)),
    ['07:30', '00:00', '13:15', '23:59'],
  );
  assert.throws(() => splitJournal('25:10 Bad time', context), /Invalid time/);
  assert.throws(() => splitJournal('07:00', context), /Add some content/);
  assert.throws(
    () => splitJournal('Coffee', { ...context, date: '2026-02-30' }),
    /valid journal date/,
  );
});

test('compound entries share explicit time and preserve exact segment and parent source spans', async () => {
  const text = 'Coffee\n1200 20min warmup; 40min weights\nA quiet evening';
  const result = await parseJournal(input(text, []));
  assert.equal(result.records.length, 4);
  assert.equal(result.calls, 0);
  const [, warmup, weights, evening] = result.records;
  assert.equal(warmup.content, '20min warmup');
  assert.equal(weights.content, '40min weights');
  assert.equal(warmup.timestamp, '2026-09-20T12:00:00-07:00');
  assert.equal(weights.timestamp, warmup.timestamp);
  assert.equal(warmup.source.timestamp_basis, 'explicit_time');
  assert.equal(weights.source.timestamp_basis, 'inherited_time');
  assert.deepEqual(weights.source.timestamp_inherited_from, { line: 2, segment: 1 });
  assert.equal(weights.source.segment, 2);
  assert.equal(weights.source.segments, 2);
  assert.equal(evening.source.timestamp_basis, 'capture_time');
  for (const record of [warmup, weights]) {
    assert.equal(text.slice(record.source.start, record.source.end), record.source.text);
    assert.equal(
      text.slice(record.source.parent_start, record.source.parent_end),
      record.source.parent_text,
    );
    assert.equal(record.source.parent_text, '1200 20min warmup; 40min weights');
    assert.equal(record.source.line, 2);
    assert.deepEqual(record.data, {});
  }
});

test('a later explicit time overrides the inherited time within a compound line', () => {
  const records = splitJournal('1200 20min warmup; 1220 40min weights; stretching', context);
  assert.deepEqual(
    records.map((r) => r.timestamp.slice(11, 16)),
    ['12:00', '12:20', '12:20'],
  );
  assert.deepEqual(records[2].source.timestamp_inherited_from, { line: 1, segment: 2 });
  const noTime = splitJournal('warmup; weights', context);
  assert.ok(noTime.every((r) => r.source.timestamp_basis === 'capture_time'));
  assert.throws(() => splitJournal('1200 warmup; 25:00 weights', context), /Invalid time/);
});

test('splitting preserves quoted semicolons, conjunctions, and non-empty content only', () => {
  const records = splitJournal(
    '1200 "warmup; weights"; coffee and oats;; “read; relax”; ',
    context,
  );
  assert.deepEqual(
    records.map((r) => r.content),
    ['"warmup; weights"', 'coffee and oats', '“read; relax”'],
  );
  assert.throws(() => splitJournal('; ;', context), /Write a journal entry/);
  assert.throws(() => splitJournal(Array(21).fill('exercise').join('; '), context), /20 entries/);
});

test('each compound part independently selects taught exercise type and its own duration', async () => {
  const memory = [
    {
      id: 'movement',
      content: '15min warmup',
      data: { exercise_type: 'movement', duration_minutes: 15 },
    },
    {
      id: 'strength',
      content: '30min weights',
      data: { exercise_type: 'strength', duration_minutes: 30 },
    },
  ];
  const ask = async ({ questions }) => ({
    model: 'jev-test-fixture',
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        const recordIndex = Number(id.split('_')[1]);
        if (id.startsWith('route_'))
          return [id, choice(question.criteria, `example_${recordIndex}`)];
        const duration = recordIndex === 0 ? 20 : 40;
        const type = recordIndex === 0 ? 'movement' : 'strength';
        const fieldIsDuration = question.instructions.expected_type === 'number';
        const value = fieldIsDuration ? duration : type;
        const options = Object.entries(question.criteria);
        if (fieldIsDuration)
          assert.deepEqual(
            options
              .filter(([, option]) => typeof option?.value === 'number')
              .map(([, option]) => option.value),
            [duration],
          );
        return [
          id,
          choice(question.criteria, options.find(([, option]) => option?.value === value)[0]),
        ];
      }),
    ),
  });
  const result = await parseJournal(input('1200 20min warmup; 40min weights', memory), { ask });
  assert.equal(result.calls, 2);
  assert.deepEqual(
    result.records.map((r) => r.data),
    [
      { exercise_type: 'movement', duration_minutes: 20 },
      { exercise_type: 'strength', duration_minutes: 40 },
    ],
  );
});

test('exact correction reuse works without a key and preserves the NEW timestamp', async () => {
  const result = await parseJournal(input('18:40 RAN  5 km in 30 minutes'));
  assert.deepEqual(result.records[0].data, examples[0].data);
  assert.equal(result.records[0].timestamp, '2026-09-20T18:40:00-07:00');
  assert.equal(result.records[0].inference.method, 'remembered');
  assert.equal(result.records[0].inference.confidence, null);
  assert.equal(result.calls, 0);
});

test('new wording uses taught shape and NEW source quantities in two batched API calls', async () => {
  const before = structuredClone(examples);
  const result = await parseJournal(input('18:00 Went running for 8 km over 45 minutes'), {
    ask: fixtureAsk(),
  });
  assert.equal(result.calls, 2);
  assert.deepEqual(result.records[0].data, {
    activity: 'run',
    distance_km: 8,
    duration_minutes: 45,
  });
  assert.equal(result.records[0].inference.match.probability, 0.95);
  assert.equal(result.records[0].inference.match.confidence, 0.88);
  assert.equal(result.records[0].inference.fields['/distance_km'].accepted, true);
  assert.equal(result.input_tokens, 200);
  assert.equal(result.trace.length, 2);
  assert.deepEqual(examples, before);
});

test('all independent entry routing questions share one request', async () => {
  const result = await parseJournal(
    input('Ran 8 km in 45 minutes\nA run of 8 km took 45 minutes'),
    { ask: fixtureAsk() },
  );
  assert.equal(result.calls, 2);
  assert.equal(Object.keys(result.trace[0].request.questions).length, 2);
  assert.equal(Object.keys(result.trace[1].request.questions).length, 6);
});

test('unrelated or low-probability matches remain raw and avoid field calls', async () => {
  for (const config of [{ route: 'none' }, { routeProbability: 0.6 }]) {
    const result = await parseJournal(input('A quiet afternoon'), { ask: fixtureAsk(config) });
    assert.deepEqual(result.records[0].data, {});
    assert.equal(result.calls, 1);
    assert.equal(result.records[0].inference.method, 'capture');
  }
});

test('missing quantities and uncertain fields become null instead of copying old numbers', async () => {
  const result = await parseJournal(input('Went for a run'), { ask: fixtureAsk() });
  assert.deepEqual(result.records[0].data, {
    activity: 'run',
    distance_km: null,
    duration_minutes: null,
  });
  const uncertain = await parseJournal(input('Ran 8 km in 45 minutes'), {
    ask: fixtureAsk({ fieldProbability: 0.6 }),
  });
  assert.deepEqual(uncertain.records[0].data, {
    activity: null,
    distance_km: null,
    duration_minutes: null,
  });
});

test('nested shapes and fixed arrays retain structure while replacing numeric leaves', async () => {
  const memory = [
    {
      id: 'nested',
      content: 'Walked five miles',
      data: { activity: { name: 'walk' }, measures: [{ value: 5, unit: 'miles' }] },
    },
  ];
  const result = await parseJournal(input('Walked eight miles', memory), {
    ask: fixtureAsk({
      values: { '/activity/name': 'walk', '/measures/0/value': 8, '/measures/0/unit': 'miles' },
    }),
  });
  assert.deepEqual(result.records[0].data, {
    activity: { name: 'walk' },
    measures: [{ value: 8, unit: 'miles' }],
  });
});

test('API failure preserves raw entries and already remembered corrections', async () => {
  const result = await parseJournal(input('Ran 5 km in 30 minutes\nRan 8 km in 45 minutes'), {
    ask: async () => {
      throw new Error('Offline');
    },
  });
  assert.deepEqual(result.records[0].data, examples[0].data);
  assert.deepEqual(result.records[1].data, {});
  assert.deepEqual(result.warnings, ['Offline']);
});

test('field-stage failure leaves nulls and never leaks the template values', async () => {
  const good = fixtureAsk();
  const result = await parseJournal(input('Ran 8 km in 45 minutes'), {
    ask: (payload) =>
      Object.keys(payload.questions)[0].startsWith('field_')
        ? Promise.reject(new Error('Timeout'))
        : good(payload),
  });
  assert.deepEqual(result.records[0].data, {
    activity: null,
    distance_km: null,
    duration_minutes: null,
  });
  assert.ok(Object.values(result.records[0].inference.fields).every((f) => !f.accepted));
});

test('candidate numbers come only from source; string coverage is bounded and reported', () => {
  assert.deepEqual(
    candidatesFor('walked eight miles in 90 minutes', 5, [5, 100]).options.map((o) => o.value),
    [90, 8],
  );
  assert.equal(
    candidatesFor(Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '), 'run', ['run'])
      .truncated,
    true,
  );
  assert.equal(
    candidatesFor(Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '), 'run', ['run'])
      .options.length,
    240,
  );
});

test('malformed model responses fail closed', async () => {
  assert.throws(
    () =>
      readChoice({ answers: { q: { type: 'choice', choice: 'invented' } } }, 'q', { known: null }),
    /invalid selection/,
  );
  const result = await parseJournal(input('Ran 8 km'), {
    ask: async () => ({
      answers: {
        route_0: {
          type: 'choice',
          choice: 'example_0',
          confidence: 0.8,
          probabilities: { example_0: 12, none: -11 },
        },
      },
    }),
  });
  assert.deepEqual(result.records[0].data, {});
  assert.match(result.warnings[0], /invalid probabilities/);
});

test('translations reject unsafe shapes and preserve explicit falsy values', () => {
  assert.deepEqual(validateData({ count: 0, did_it: false, note: '', other: null }), {
    count: 0,
    did_it: false,
    note: '',
    other: null,
  });
  assert.throws(() => validateData([]), /JSON object/);
  assert.throws(() => validateData(JSON.parse('{"__proto__":{"polluted":true}}')), /reserved/);
  assert.throws(
    () => validateData(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`f${i}`, i]))),
    /24 fields/,
  );
  assert.throws(() => validateExamples([...examples, ...examples]), /Invalid saved example/);
});

test('HTTP client uses documented endpoint and keeps provider errors free of secrets', async () => {
  let sent;
  const ask = createClient('fixture-secret', {
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return new Response(JSON.stringify({ answers: {} }), { status: 200 });
    },
  });
  await ask({ model: 'jev-latest', state: 'test', questions: {} });
  assert.equal(sent.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(sent.init.headers.Authorization, 'Bearer fixture-secret');
  assert.equal(JSON.parse(sent.init.body).model, 'jev-latest');
  const failing = createClient('fixture-secret', {
    fetchImpl: async () => new Response('fixture-secret', { status: 401 }),
  });
  await assert.rejects(failing({}), { message: 'Invalid TypeSafe key.' });
});
