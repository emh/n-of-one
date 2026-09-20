export const TYPES = [
  'body_composition',
  'food',
  'hydration',
  'exercise',
  'sleep',
  'fasting',
  'subjective',
  'other',
];
export const MODALITIES = [
  'strength',
  'movement',
  'cardio',
  'running',
  'HIIT',
  'mobility',
  'rope_flow',
  'martial_arts',
  'other',
];
export const LABELS = {
  body_composition: 'Body',
  food: 'Food',
  hydration: 'Hydration',
  exercise: 'Exercise',
  sleep: 'Sleep',
  fasting: 'Fasting',
  subjective: 'Note',
  other: 'Other',
  strength: 'Strength',
  movement: 'Movement',
  cardio: 'Cardio',
  zone_1: 'Movement',
  zone_2: 'Cardio',
  running: 'Running',
  HIIT: 'HIIT',
  mobility: 'Mobility',
  rope_flow: 'Rope flow',
  martial_arts: 'Martial arts',
  water: 'Water fast',
  sardine: 'Sardine fast',
};
// Read older journals and presets without rewriting their history.
export const normalizeModality = (value) =>
  ({ zone_1: 'movement', zone_2: 'cardio' })[value] || value;
const number = { type: ['number', 'null'] };
const string = { type: ['string', 'null'] };
export const DATA_FIELDS = {
  weightLb: number,
  bodyFatPct: number,
  proteinLow: number,
  proteinHigh: number,
  caloriesLow: number,
  caloriesHigh: number,
  volumeMl: number,
  durationMinutes: number,
  modality: { type: ['string', 'null'], enum: [...MODALITIES, null] },
  sleepAction: { type: ['string', 'null'], enum: ['bed', 'wake', 'duration', null] },
  wakeState: string,
  fastType: { type: ['string', 'null'], enum: ['water', 'sardine', 'other', null] },
  note: string,
};
export const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'sourceLine', 'title', 'data'],
        properties: {
          type: { type: 'string', enum: TYPES },
          sourceLine: { type: 'integer' },
          title: { type: 'string' },
          data: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(DATA_FIELDS),
            properties: DATA_FIELDS,
          },
        },
      },
    },
  },
};
export const blankData = () =>
  Object.fromEntries(Object.keys(DATA_FIELDS).map((key) => [key, null]));
export function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateEvent(event, { complete = true } = {}) {
  if (!event || !TYPES.includes(event.type)) throw new Error('Choose a supported event type.');
  if (!validDate(event.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time))
    throw new Error('Enter a valid date and time.');
  if (
    typeof event.title !== 'string' ||
    !event.title.trim() ||
    event.title.length > 300 ||
    typeof event.sourceText !== 'string'
  )
    throw new Error('Each event needs a short title and its source text.');
  const data = event.data;
  if (!data || typeof data !== 'object') throw new Error('The event is missing its details.');
  for (const [key, schema] of Object.entries(DATA_FIELDS)) {
    const value = data[key];
    if (value === null || value === undefined) continue;
    if (schema.type.includes('number') && (!Number.isFinite(value) || value < 0))
      throw new Error(`${key} must be a positive number or zero.`);
    if (schema.type.includes('string') && (typeof value !== 'string' || value.length > 4000))
      throw new Error(`${key} must be text.`);
    if (schema.enum && !schema.enum.includes(key === 'modality' ? normalizeModality(value) : value))
      throw new Error(`Invalid ${key}.`);
  }
  if (data.bodyFatPct > 100) throw new Error('Body fat must be between 0 and 100%.');
  if (data.durationMinutes > 1440) throw new Error('Duration must be 24 hours or less.');
  for (const prefix of ['protein', 'calories']) {
    if (
      data[`${prefix}Low`] != null &&
      data[`${prefix}High`] != null &&
      data[`${prefix}Low`] > data[`${prefix}High`]
    )
      throw new Error('The lower estimate must not exceed the upper estimate.');
  }
  if (!complete) return event;
  const required =
    {
      food: ['proteinLow', 'proteinHigh', 'caloriesLow', 'caloriesHigh'],
      exercise: ['durationMinutes', 'modality'],
      hydration: ['volumeMl'],
      fasting: ['fastType'],
      sleep: ['sleepAction'],
    }[event.type] || [];
  if (required.some((key) => data[key] == null))
    throw new Error(`Complete the ${LABELS[event.type].toLowerCase()} details.`);
  if (event.type === 'body_composition' && data.weightLb == null && data.bodyFatPct == null)
    throw new Error('Enter a weight or body-fat measurement.');
  if (event.type === 'sleep' && data.sleepAction === 'duration' && data.durationMinutes == null)
    throw new Error('Enter a sleep duration.');
  return event;
}
export function validateParse(value) {
  if (!value || !Array.isArray(value.events) || value.events.length > 80)
    throw new Error('The parser returned an invalid event list.');
  value.events.forEach((event) => validateEvent(event, { complete: false }));
  return value;
}
export function normalizePhrase(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function relevantMemories(text, memories) {
  const normalized = ` ${normalizePhrase(text)} `;
  return memories
    .filter(
      (memory) => !memory.deleted && normalized.includes(` ${normalizePhrase(memory.data.alias)} `),
    )
    .slice(0, 40);
}
