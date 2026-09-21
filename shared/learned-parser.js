import { journalLines } from './parser-context.js';
import {
  blankData,
  MODALITIES,
  normalizeModality,
  relevantMemories,
  validateEvent,
  validateParse,
  validDate,
} from './schema.js';

const normalize = (text) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

// Only the duration varies. Changed wording, extra quantities, intervals and
// qualifiers need a fresh interpretation rather than a fuzzy cache match.
function exercisePattern(text) {
  const matches = [
    ...text.matchAll(
      /(?<![\p{L}\d.\-+])\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|min|m)(?!\p{L})/giu,
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const before = text.slice(0, match.index),
    after = text.slice(match.index + match[0].length);
  if (/\d/.test(before + after) || !/\p{L}/u.test(before + after)) return null;
  const minutes = Number(match[0].match(/^[\d.]+/)[0]) * (/h/i.test(match[0]) ? 60 : 1);
  if (minutes <= 0 || minutes > 1440) return null;
  return { key: JSON.stringify([normalize(before), normalize(after)]), minutes };
}

function learnedPatterns(records) {
  const patterns = new Map();
  const owners = new Map();
  const accepted = records
    .filter((record) => record.kind === 'entry' && !record.deleted && record.data?.acceptedAt)
    .sort((a, b) => b.data.acceptedAt.localeCompare(a.data.acceptedAt) || b.id.localeCompare(a.id));
  for (const record of accepted) {
    const entry = record.data;
    let lines;
    try {
      lines = journalLines(entry.text, entry.date, entry.referenceTime || '00:00');
    } catch {
      continue;
    }
    for (const line of lines) {
      const pattern = exercisePattern(line.text);
      if (!pattern) continue;
      if (patterns.has(pattern.key)) {
        // Repeated, potentially contradictory labels within one accepted
        // submission are not enough to choose a reusable interpretation.
        if (owners.get(pattern.key) === record.id) patterns.set(pattern.key, null);
        continue;
      }
      // The latest accepted interpretation wins, including corrections that
      // make an old pattern unsuitable for automatic reuse.
      patterns.set(pattern.key, null);
      owners.set(pattern.key, record.id);
      const events = (entry.events || []).filter((event) => event.sourceLine === line.sourceLine);
      const originals = (entry.originalEvents || []).filter(
        (event) => event.sourceLine === line.sourceLine,
      );
      if (events.length !== 1 || originals.length > 1) continue;
      const event = events[0];
      if (
        event.origin === 'manual' ||
        event.type !== 'exercise' ||
        normalize(event.sourceText || '') !== normalize(line.sourceText)
      )
        continue;
      try {
        validateEvent(event);
      } catch {
        continue;
      }
      const data = event.data;
      if (data.durationMinutes !== pattern.minutes) continue;
      if (
        Object.entries(data).some(
          ([key, value]) => !['durationMinutes', 'modality', 'note'].includes(key) && value != null,
        )
      )
        continue;
      // Never carry a number or inferred qualifier from the old note forward.
      if (data.note && normalize(data.note) !== normalize(line.text)) continue;
      patterns.set(pattern.key, {
        recordId: record.id,
        eventId: event.id,
        modality: normalizeModality(data.modality),
        sourceText: line.text,
        copySourceNote: Boolean(data.note),
      });
    }
  }
  return patterns;
}

export async function parseUsingAcceptedEntries(input, records, memories, parseRemote) {
  const started = Date.now();
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 16000)
    throw new Error('Enter between 1 and 16,000 characters.');
  if (!validDate(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    throw new Error('A valid journal date and time are required.');
  const lines = journalLines(input.text, input.date, input.time);
  if (!lines.length || lines.length > 80)
    throw new Error('Use between 1 and 80 observations per entry.');
  const patterns = learnedPatterns(records);
  const learned = [],
    unresolved = [];
  for (const line of lines) {
    const pattern = exercisePattern(line.text);
    const example = pattern && patterns.get(pattern.key);
    const preferences = relevantMemories(line.text, memories).map((record) => record.data);
    const presetModalities = new Set(
      preferences.map((preset) => normalizeModality(preset.eventData?.modality)),
    );
    const simplePresets = preferences.every(
      (preset) =>
        preset.type === 'exercise' &&
        MODALITIES.includes(normalizeModality(preset.eventData?.modality)) &&
        Object.entries(preset.eventData).every(
          ([key, value]) =>
            ['durationMinutes', 'modality'].includes(key) || value == null || value === '',
        ),
    );
    // A simple explicit category preference overrides learned history. Rich or
    // conflicting presets require a fresh model interpretation.
    if (!example || (preferences.length && (!simplePresets || presetModalities.size !== 1))) {
      unresolved.push(line);
      continue;
    }
    const event = {
      sourceLine: line.sourceLine,
      type: 'exercise',
      date: line.date,
      time: line.time,
      title: line.text.slice(0, 300),
      sourceText: line.sourceText,
      ...(line.sourceContext ? { sourceContext: line.sourceContext } : {}),
      data: {
        ...blankData(),
        durationMinutes: pattern.minutes,
        modality: preferences.length ? [...presetModalities][0] : example.modality,
        note: example.copySourceNote ? line.text : null,
      },
      interpretation: {
        provider: 'learned',
        method: 'accepted-duration-pattern-v1',
        exampleEntryId: example.recordId,
        exampleEventId: example.eventId,
        exampleSourceText: example.sourceText,
        ...(preferences.length ? { presetAliases: preferences.map((preset) => preset.alias) } : {}),
      },
    };
    validateEvent(event);
    learned.push(event);
  }
  let remote = { events: [] };
  if (unresolved.length) {
    // Send only unresolved text. Original compound lines stay local so the
    // remote parser cannot accidentally regenerate an accepted sibling.
    remote = await parseRemote({
      ...input,
      text: unresolved.map((line) => `${line.date} ${line.time} ${line.text}`).join('\n'),
    });
    validateParse(remote);
    if (unresolved.some((_, index) => !remote.events.some((event) => event.sourceLine === index)))
      throw new Error('The parser omitted part of the entry. Please try again.');
    remote = {
      ...remote,
      events: remote.events.map((event) => {
        const line = unresolved[event.sourceLine];
        if (!Number.isInteger(event.sourceLine) || !line)
          throw new Error('The parser returned an unknown source.');
        const { sourceContext: _context, ...value } = event;
        return {
          ...value,
          sourceLine: line.sourceLine,
          date: line.date,
          time: line.time,
          sourceText: line.sourceText,
          ...(line.sourceContext ? { sourceContext: line.sourceContext } : {}),
        };
      }),
    };
  }
  const events = [...learned, ...remote.events].sort((a, b) => a.sourceLine - b.sourceLine);
  validateParse({ events });
  const diagnostics = remote.parseDiagnostics || {};
  return {
    ...remote,
    events,
    parserVersion: [remote.parserVersion, learned.length ? 'learned-v1' : null]
      .filter(Boolean)
      .join('+'),
    parseDiagnostics: {
      ...diagnostics,
      ...(diagnostics.typesafe
        ? {
            typesafe: {
              ...diagnostics.typesafe,
              lines: diagnostics.typesafe.lines.map((line) => ({
                ...line,
                sourceLine: unresolved[line.sourceLine]?.sourceLine,
              })),
            },
          }
        : {}),
      learned: { lines: learned.length, remoteLines: unresolved.length },
      durationMs: Date.now() - started,
    },
  };
}
