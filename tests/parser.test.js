import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal } from '../workers/api/src/parser.js';
import { blankData } from '../shared/schema.js';
const input = { text: '1000 ate eggs', date: '2026-09-18', time: '10:00' };
const food = {
  sourceLine: 0,
  type: 'food',
  date: input.date,
  time: input.time,
  title: 'Eggs',
  sourceText: 'ate eggs',
  data: { ...blankData(), proteinLow: 18, proteinHigh: 21, caloriesLow: 210, caloriesHigh: 240 },
};
test('parser uses the configured Commonplace model and strict application schema', async () => {
  const result = await parseJournal(
    input,
    { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'gpt-5.4-nano' },
    async (url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.model, 'gpt-5.4-nano');
      assert.equal(body.response_format.json_schema.strict, true);
      return Response.json({
        choices: [
          { finish_reason: 'stop', message: { content: JSON.stringify({ events: [food] }) } },
        ],
      });
    },
  );
  assert.equal(result.events[0].data.proteinLow, 18);
  assert.equal(result.parserVersion, 'journal-v3:gpt-5.4-nano');
});
test('activity categories and legacy presets are supplied to the LLM without keyword overrides', async () => {
  const result = await parseJournal(
    {
      text: '1100 20min bike ride',
      date: input.date,
      time: '11:00',
      memories: [
        {
          alias: 'bike ride',
          type: 'exercise',
          eventData: { ...blankData(), modality: 'zone_2', durationMinutes: 20 },
        },
      ],
    },
    { OPENAI_API_KEY: 'test-only' },
    async (url, request) => {
      const body = JSON.parse(request.body);
      const categories =
        body.response_format.json_schema.schema.properties.events.items.properties.data.properties
          .modality.enum;
      assert.ok(categories.includes('movement') && categories.includes('cardio'));
      assert.ok(!categories.includes('zone_1') && !categories.includes('zone_2'));
      assert.match(body.messages[0].content, /bike ride is cardio/i);
      assert.match(body.messages[0].content, /general warmup/);
      assert.match(body.messages[0].content, /zones 2, 3, 4 or 5/);
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.memories[0].eventData.modality, 'cardio');
      // Deliberately return another valid category: the app must preserve the
      // model's decision rather than silently overriding it from source keywords.
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                events: [
                  {
                    sourceLine: 0,
                    type: 'exercise',
                    title: 'Bike ride',
                    data: { ...blankData(), modality: 'movement', durationMinutes: 20 },
                  },
                ],
              }),
            },
          },
        ],
      });
    },
  );
  assert.equal(result.events[0].data.modality, 'movement');
});
test('refusals and truncated output never reach review as successful parses', async () => {
  await assert.rejects(
    parseJournal(input, { OPENAI_API_KEY: 'test' }, async () =>
      Response.json({ choices: [{ finish_reason: 'stop', message: { refusal: 'No' } }] }),
    ),
    /could not interpret/,
  );
  await assert.rejects(
    parseJournal(input, { OPENAI_API_KEY: 'test' }, async () =>
      Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    ),
    /incomplete/,
  );
});
test('malformed event data and absent keys produce actionable errors', async () => {
  await assert.rejects(
    parseJournal(input, {}, async () => {}),
    /not connected/,
  );
  await assert.rejects(
    parseJournal(input, { OPENAI_API_KEY: 'test' }, async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({ events: [{ ...food, data: { proteinLow: -2 } }] }),
            },
          },
        ],
      }),
    ),
    /invalid details/,
  );
});
