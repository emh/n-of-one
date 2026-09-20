import { addDays, localDate, uid } from '../shared/model.js';
import { blankData } from '../shared/schema.js';
export function sampleRecords(today = localDate()) {
  const records = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i),
      id = `sample-${date}`;
    const event = (type, time, title, data) => ({
      id: uid(),
      journalEntryId: id,
      date,
      time,
      type,
      title,
      sourceText: title,
      timestamp: new Date(`${date}T${time}:00`).toISOString(),
      data: { ...blankData(), ...data },
    });
    const events = [
      event('body_composition', '07:15', 'Morning weigh-in', {
        weightLb: Math.round((219.4 + i * 0.12 + Math.sin(i) * 0.35) * 10) / 10,
        bodyFatPct: Math.round((24.1 + i * 0.025) * 10) / 10,
      }),
      event('sleep', '07:30', 'A slow start', {
        sleepAction: 'duration',
        durationMinutes: 435 + (i % 4) * 15,
        wakeState: i % 3 ? 'good' : 'groggy',
      }),
      event('food', '10:00', 'Eggs & sardines', {
        proteinLow: 38,
        proteinHigh: 44,
        caloriesLow: 420,
        caloriesHigh: 480,
      }),
      event('hydration', '10:00', 'Morning water', { volumeMl: 1000 }),
      event('exercise', '11:00', 'Bike ride', {
        modality: 'cardio',
        durationMinutes: 20 + (i % 3) * 10,
      }),
      event('food', '13:00', 'Protein shake', {
        proteinLow: 45,
        proteinHigh: 45,
        caloriesLow: 350,
        caloriesHigh: 400,
      }),
    ];
    if (i % 2 === 0)
      events.push(
        event('exercise', '11:30', 'Strength session', {
          modality: 'strength',
          durationMinutes: 40,
        }),
      );
    if (i > 0)
      events.push(
        event('food', '18:30', 'Chicken, rice & greens', {
          proteinLow: 55,
          proteinHigh: 65,
          caloriesLow: 700,
          caloriesHigh: 850,
        }),
        event('hydration', '19:00', 'Water through the afternoon', { volumeMl: 1500 }),
      );
    records.push({
      id,
      kind: 'entry',
      version: '',
      deleted: false,
      data: {
        text: events.map((e) => `${e.time.replace(':', '')} ${e.title.toLowerCase()}`).join('\n'),
        date,
        events: events.sort((a, b) => a.time.localeCompare(b.time)),
        originalEvents: events,
        parserVersion: 'sample',
        corrections: [],
        revisions: [],
        createdAt: new Date(`${date}T13:00:00`).toISOString(),
      },
    });
  }
  return records;
}
