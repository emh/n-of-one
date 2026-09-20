import { addDays, allEvents, midpoint } from './model.js';
import { normalizeModality } from './schema.js';
export function sleepSessions(events) {
  const result = [];
  let bed = null;
  for (const event of events
    .filter((e) => e.type === 'sleep')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (event.data.sleepAction === 'bed') bed = event;
    else if (event.data.sleepAction === 'duration') {
      result.push({
        date: event.date,
        minutes: event.data.durationMinutes,
        wakeState: event.data.wakeState,
      });
      bed = null;
    } else if (event.data.sleepAction === 'wake') {
      const minutes = bed
        ? Math.round((Date.parse(event.timestamp) - Date.parse(bed.timestamp)) / 60000)
        : null;
      result.push({
        date: event.date,
        minutes: minutes > 0 && minutes <= 1440 ? minutes : null,
        wakeState: event.data.wakeState,
      });
      bed = null;
    }
  }
  return result;
}
export function dailySummary(events, date) {
  const day = events.filter((event) => event.date === date);
  const foods = day.filter((e) => e.type === 'food');
  const hydration = day.filter((e) => e.type === 'hydration');
  const sum = (key) => (foods.length ? foods.reduce((n, e) => n + (e.data[key] || 0), 0) : null);
  const activity = {};
  day
    .filter((e) => e.type === 'exercise')
    .forEach((e) => {
      const key = normalizeModality(e.data.modality) || 'other';
      activity[key] = (activity[key] || 0) + (e.data.durationMinutes || 0);
    });
  const measurements = day.filter((e) => e.type === 'body_composition');
  const lastValue = (key) =>
    [...measurements].reverse().find((e) => e.data[key] != null)?.data[key] ?? null;
  const sleeps = sleepSessions(events).filter((s) => s.date === date);
  const knownSleeps = sleeps.filter((s) => s.minutes != null);
  return {
    date,
    events: day,
    logged: day.length > 0,
    foodLogged: foods.length > 0,
    proteinLow: sum('proteinLow'),
    proteinHigh: sum('proteinHigh'),
    caloriesLow: sum('caloriesLow'),
    caloriesHigh: sum('caloriesHigh'),
    water: hydration.length ? hydration.reduce((n, e) => n + e.data.volumeMl, 0) : null,
    weight: lastValue('weightLb'),
    bodyFat: lastValue('bodyFatPct'),
    activity,
    exercise: Object.values(activity).reduce((a, b) => a + b, 0),
    sleep: knownSleeps.length ? knownSleeps.reduce((n, s) => n + s.minutes, 0) : null,
    wakeState: sleeps.at(-1)?.wakeState,
    fasting: day.filter((e) => e.type === 'fasting').map((e) => e.data.fastType),
  };
}
export function weekSummary(events, start) {
  const days = Array.from({ length: 7 }, (_, i) => dailySummary(events, addDays(start, i)));
  const avg = (key) => {
    const known = days.filter((d) => d[key] != null);
    return known.length ? known.reduce((n, d) => n + d[key], 0) / known.length : null;
  };
  const activity = {};
  days.forEach((day) =>
    Object.entries(day.activity).forEach(([key, value]) => {
      activity[key] = (activity[key] || 0) + value;
    }),
  );
  return {
    days,
    activity,
    foodDays: days.filter((d) => d.foodLogged).length,
    loggedDays: days.filter((d) => d.logged).length,
    protein: avg('proteinLow') == null ? null : midpoint(avg('proteinLow'), avg('proteinHigh')),
    caloriesLow: avg('caloriesLow'),
    caloriesHigh: avg('caloriesHigh'),
    sleep: avg('sleep'),
    fastDays: days.filter((d) => d.fasting.length).length,
  };
}
export function bodySeries(events) {
  const dates = [
    ...new Set(events.filter((e) => e.type === 'body_composition').map((e) => e.date)),
  ].sort();
  const points = dates
    .map((date) => dailySummary(events, date))
    .map((d) => ({
      date: d.date,
      weight: d.weight,
      bodyFat: d.bodyFat,
      fatMass: d.weight != null && d.bodyFat != null ? (d.weight * d.bodyFat) / 100 : null,
      leanMass: d.weight != null && d.bodyFat != null ? d.weight * (1 - d.bodyFat / 100) : null,
    }));
  return points.map((point) => {
    const window = points.filter(
      (p) => p.date >= addDays(point.date, -6) && p.date <= point.date && p.weight != null,
    );
    return {
      ...point,
      average: window.length ? window.reduce((n, p) => n + p.weight, 0) / window.length : null,
    };
  });
}
export { allEvents };
