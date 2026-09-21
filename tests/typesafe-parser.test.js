import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal } from '../workers/api/src/parser.js';
import { quantityCandidates } from '../workers/api/src/typesafe.js';
import { blankData } from '../shared/schema.js';
import { journalLines } from '../shared/parser-context.js';
import { acceptReview } from '../shared/model.js';

const input = (text, extra = {}) => ({ text, date: '2026-09-20', time: '09:00', ...extra });
const env = { TYPESAFE_API_KEY: 'typesafe-fixture', OPENAI_API_KEY: 'openai-fixture' };
const defaults = { type: 'exercise', modality: 'movement', durationMinutes: 20 };
function choice(criteria, value, probability = 0.97) {
  return {
    type: 'choice',
    choice: value,
    confidence: 0.94,
    probabilities: Object.fromEntries(
      Object.keys(criteria).map((key) => [
        key,
        key === value ? probability : (1 - probability) / (Object.keys(criteria).length - 1),
      ]),
    ),
  };
}
function mockProviders({
  selections = {},
  probability = 0.97,
  verify = 0.98,
  fail = false,
  onLLM,
  onTypeSafe,
} = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.includes('typesafe.ai')) {
      onTypeSafe?.(body);
      if (fail) throw new Error('Fixture provider failure');
      return Response.json({
        model: 'jev-fixture',
        usage: { input_tokens: 100, output_tokens: 10 },
        answers: Object.fromEntries(
          Object.entries(body.questions).map(([id, question]) => {
            if (question.type === 'noul') return [id, { type: 'noul', noul: verify }];
            const [, index, ...parts] = id.split('_');
            const field = parts.join('_');
            const value = (selections[index] ?? defaults)[field];
            const selected = Object.hasOwn(question.criteria, value)
              ? value
              : (Object.entries(question.criteria).find(
                  ([, candidate]) => candidate?.value === value,
                )?.[0] ?? 'unknown');
            return [id, choice(question.criteria, selected, probability)];
          }),
        ),
      });
    }
    const context = JSON.parse(body.messages[1].content);
    const events = onLLM
      ? onLLM(context)
      : context.lines.map((line) => ({
          sourceLine: line.sourceLine,
          type: 'other',
          title: 'LLM fallback',
          data: { ...blankData(), note: line.text },
        }));
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ events }) } }],
      usage: { prompt_tokens: 30, completion_tokens: 10 },
    });
  };
  return { fetcher, calls };
}

test('confident TypeSafe extraction and verification can complete without the LLM key', async () => {
  const fixture = mockProviders();
  const result = await parseJournal(
    input('1200 20min warmup'),
    { TYPESAFE_API_KEY: env.TYPESAFE_API_KEY },
    fixture.fetcher,
  );
  assert.equal(fixture.calls.length, 2);
  assert.ok(fixture.calls.every((call) => call.url.includes('typesafe.ai')));
  assert.equal(result.events[0].data.durationMinutes, 20);
  assert.equal(result.events[0].data.modality, 'movement');
  assert.equal(result.events[0].time, '12:00');
  assert.equal(result.events[0].interpretation.provider, 'typesafe');
  assert.equal(result.events[0].interpretation.verification, 0.98);
  assert.equal(result.parserVersion, 'journal-v3:jev-fixture');
});

test('mixed parses send only unresolved source IDs to the LLM and merge in source order', async () => {
  const fixture = mockProviders({
    selections: { 0: defaults, 2: { type: 'hydration', volumeMl: 500 } },
    onLLM: ({ lines }) => {
      assert.deepEqual(
        lines.map((line) => line.sourceLine),
        [1],
      );
      return [
        {
          sourceLine: 1,
          type: 'food',
          title: 'Eggs',
          data: {
            ...blankData(),
            proteinLow: 12,
            proteinHigh: 14,
            caloriesLow: 150,
            caloriesHigh: 180,
          },
        },
      ];
    },
  });
  const result = await parseJournal(
    input('1200 20min warmup\n1300 ate eggs\n1400 drank 500ml water'),
    env,
    fixture.fetcher,
  );
  assert.deepEqual(
    result.events.map((e) => e.type),
    ['exercise', 'food', 'hydration'],
  );
  assert.deepEqual(
    result.events.map((e) => e.time),
    ['12:00', '13:00', '14:00'],
  );
  assert.deepEqual(
    result.events.map((e) => e.interpretation.provider),
    ['typesafe', 'llm', 'typesafe'],
  );
  assert.equal(result.parseDiagnostics.llm.lines, 1);
});

test('compound warmup and weights extract independently with an inherited timestamp', async () => {
  const fixture = mockProviders({
    selections: { 0: defaults, 1: { type: 'exercise', modality: 'strength', durationMinutes: 40 } },
  });
  const result = await parseJournal(
    input('1200 20min warmup; 40min weights'),
    env,
    fixture.fetcher,
  );
  assert.deepEqual(
    result.events.map((e) => [e.data.modality, e.data.durationMinutes, e.time]),
    [
      ['movement', 20, '12:00'],
      ['strength', 40, '12:00'],
    ],
  );
  assert.equal(result.events[1].sourceText, '40min weights');
  assert.equal(result.events[1].sourceContext.timestampBasis, 'inherited');
  assert.equal(result.events[1].sourceContext.text, '1200 20min warmup; 40min weights');
});

test('compound fallback cannot see already-resolved siblings through original-line provenance', async () => {
  const fixture = mockProviders({
    selections: {
      0: { type: 'llm' },
      1: { type: 'exercise', modality: 'strength', durationMinutes: 40 },
    },
    onLLM: ({ lines }) => {
      assert.deepEqual(lines, [
        { sourceLine: 0, text: '20min warmup', date: '2026-09-20', time: '12:00' },
      ]);
      return [
        {
          sourceLine: 0,
          type: 'exercise',
          title: 'Warmup',
          data: { ...blankData(), modality: 'movement', durationMinutes: 20 },
        },
      ];
    },
  });
  const result = await parseJournal(
    input('1200 20min warmup; 40min weights'),
    env,
    fixture.fetcher,
  );
  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map((event) => event.interpretation.provider),
    ['llm', 'typesafe'],
  );
  assert.ok(
    result.events.every((event) => event.sourceContext.text === '1200 20min warmup; 40min weights'),
  );
});

test('low-probability choices, confident no-match and failed verification all invoke the LLM', async () => {
  for (const config of [
    { probability: 0.6 },
    { selections: { 0: { type: 'llm' } } },
    { verify: 0.6 },
  ]) {
    const fixture = mockProviders(config);
    const result = await parseJournal(input('20min warmup'), env, fixture.fetcher);
    assert.equal(result.events[0].interpretation.provider, 'llm');
    assert.equal(result.parseDiagnostics.llm.lines, 1);
  }
});

test('provider failure, malformed answers and verification timeouts fall back without partial loss', async () => {
  for (const mode of ['failure', 'malformed', 'verification']) {
    const fixture = mockProviders({ fail: mode === 'failure' });
    const fetcher = (url, init) => {
      const body = JSON.parse(init.body);
      if (url.includes('typesafe.ai') && mode === 'malformed')
        return Response.json({ answers: {} });
      if (url.includes('typesafe.ai') && mode === 'verification' && body.state.proposals)
        throw new Error('timeout');
      return fixture.fetcher(url, init);
    };
    const result = await parseJournal(input('20min warmup\nA quiet afternoon'), env, fetcher);
    assert.equal(result.events.length, 2);
    assert.ok(result.events.every((e) => e.interpretation.provider === 'llm'));
  }
});

test('without an LLM key unresolved text fails the entire parse instead of returning a partial journal', async () => {
  const fixture = mockProviders();
  await assert.rejects(
    parseJournal(
      input('20min warmup\nA meal'),
      { TYPESAFE_API_KEY: env.TYPESAFE_API_KEY },
      fixture.fetcher,
    ),
    /LLM fallback/,
  );
});

test('LLM responses cannot drop unresolved lines or overwrite accepted TypeSafe source IDs', async () => {
  for (const onLLM of [
    () => [],
    () => [{ sourceLine: 0, type: 'other', title: 'Wrong source', data: blankData() }],
  ]) {
    const fixture = mockProviders({ onLLM });
    await assert.rejects(
      parseJournal(input('20min warmup\nA meal'), env, fixture.fetcher),
      /invalid details/,
    );
  }
});

test('approved presets inform TypeSafe while current source quantities remain authoritative', async () => {
  const fixture = mockProviders({
    onTypeSafe: (body) => {
      if (!body.state.saved_preferences) return;
      assert.equal(body.state.saved_preferences[0].eventData.modality, 'cardio');
      const values = Object.values(body.questions.line_0_durationMinutes.criteria).filter(
        (value) => typeof value === 'object',
      );
      assert.deepEqual(
        values.map((value) => value.value),
        [20],
      );
    },
    selections: { 0: { ...defaults, modality: 'cardio' } },
  });
  const result = await parseJournal(
    input('20min my ride', {
      memories: [
        {
          alias: 'my ride',
          type: 'exercise',
          eventData: { ...blankData(), modality: 'zone_2', durationMinutes: 90 },
        },
      ],
    }),
    env,
    fixture.fetcher,
  );
  assert.equal(result.events[0].data.durationMinutes, 20);
});

test('explicit quantities are normalized in code and unsupported or negative values are not invented', () => {
  const candidates = quantityCandidates('1h 20min bike; 0.5L water; 80kg bodyweight; 18% body fat');
  assert.ok(candidates.durationMinutes.some((c) => c.value === 80));
  assert.equal(candidates.volumeMl[0].value, 500);
  assert.ok(Math.abs(candidates.weightLb[0].value - 176.3698) < 0.001);
  assert.equal(candidates.bodyFatPct[0].value, 18);
  assert.equal(quantityCandidates('-20min workout').durationMinutes.length, 0);
  assert.equal(quantityCandidates('twenty minutes').durationMinutes.length, 0);
});

test('unsupported candidates and disabled TypeSafe skip its calls entirely', async () => {
  for (const [text, config] of [
    ['A meal', env],
    ['20min warmup', { ...env, TYPESAFE_ENABLED: 'false' }],
  ]) {
    const fixture = mockProviders();
    const result = await parseJournal(input(text), config, fixture.fetcher);
    assert.equal(result.events[0].interpretation.provider, 'llm');
    assert.equal(fixture.calls.length, 1);
    assert.ok(fixture.calls[0].url.includes('openai.com'));
  }
});

test('semicolon splitting preserves date context, quoted delimiters and independent-line times', () => {
  const lines = journalLines(
    '2026-09-19\n1200 warmup; 1220 weights; stretching\n"coffee; oats" and tea\n2026-09-20\n0800 bodyweight',
    '2026-09-20',
    '17:00',
  );
  assert.deepEqual(
    lines.map((line) => line.time),
    ['12:00', '12:20', '12:20', '17:00', '08:00'],
  );
  assert.deepEqual(
    lines.map((line) => line.date),
    ['2026-09-19', '2026-09-19', '2026-09-19', '2026-09-19', '2026-09-20'],
  );
  assert.equal(lines[3].text, '"coffee; oats" and tea');
});

test('review acceptance preserves provider evidence and parser diagnostics', async () => {
  const fixture = mockProviders();
  const parsed = await parseJournal(input('20min warmup'), env, fixture.fetcher);
  const accepted = acceptReview({
    ...input('20min warmup'),
    ...parsed,
    originalEvents: parsed.events,
  });
  assert.equal(accepted.data.events[0].interpretation.provider, 'typesafe');
  assert.equal(accepted.data.parseDiagnostics.typesafe.calls, 2);
});
