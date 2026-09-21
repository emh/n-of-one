export const LIMITS = { text: 12000, entries: 20, line: 1200, examples: 60, fields: 24 };

export function validateData(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object')
    throw new Error(
      'Translation must be a JSON object, for example {"activity":"run","distance_km":5}.',
    );
  if (JSON.stringify(data).length > 6000)
    throw new Error('Keep a translation under 6,000 characters.');
  let count = 0;
  function visit(value, depth) {
    if (depth > 5) throw new Error('Use at most five nested levels.');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('This property name is reserved.');
        visit(child, depth + 1);
      }
    } else {
      count++;
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Numbers must be finite.');
      if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)
        throw new Error('Use JSON values only.');
    }
  }
  visit(data, 0);
  if (count > LIMITS.fields)
    throw new Error(`Use at most ${LIMITS.fields} fields per translation.`);
  return data;
}

export function leaves(value, path = []) {
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]));
  return [{ path, value }];
}

export function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shapeOf(value[key])]),
    );
  return value === null ? 'null' : typeof value;
}

export function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function clauseSpans(line) {
  const spans = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === '“') {
      quote = char === '“' ? '”' : '"';
    } else if (char === ';') {
      if (line.slice(start, index).trim()) spans.push({ start, end: index });
      start = index + 1;
    }
  }
  if (line.slice(start).trim()) spans.push({ start, end: line.length });
  return spans;
}

export function splitJournal(text, { date, offsetMinutes, capturedAt = new Date().toISOString() }) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Write a journal entry first.');
  if (text.length > LIMITS.text)
    throw new Error(`Use at most ${LIMITS.text.toLocaleString()} characters per submission.`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Choose a valid journal date.');
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 840)
    throw new Error('Invalid timezone offset.');
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('Invalid capture time.');
  const localCapture = new Date(Date.parse(capturedAt) - offsetMinutes * 60000)
    .toISOString()
    .slice(11, 19);
  const offset = `${offsetMinutes <= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMinutes) % 60).padStart(2, '0')}`;
  let cursor = 0;
  const records = text.split('\n').flatMap((raw, index) => {
    const start = cursor;
    cursor += raw.length + 1;
    if (!raw.trim()) return [];
    if (raw.length > LIMITS.line)
      throw new Error(
        `Line ${index + 1} is too long. Keep each entry under ${LIMITS.line} characters.`,
      );
    const spans = clauseSpans(raw);
    let inheritedTime = null;
    let inheritedFrom = null;
    return spans.map((span, segmentIndex) => {
      const segment = raw.slice(span.start, span.end);
      const match = segment.match(
        /^\s*(?:(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)|(\d{2})(\d{2}))(?=\s|$)\s*/i,
      );
      let content = segment.trim();
      let time = inheritedTime ?? localCapture;
      let basis = inheritedTime ? 'inherited_time' : 'capture_time';
      if (match) {
        let hour = Number(match[1] ?? match[4] ?? match[6]);
        const minute = Number(match[2] ?? match[7] ?? 0);
        const meridiem = (match[3] ?? match[5])?.toLowerCase();
        if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23))
          throw new Error(`Invalid time on line ${index + 1}, entry ${segmentIndex + 1}.`);
        if (meridiem) hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
        time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        content = segment.slice(match[0].length).trim();
        if (!content) throw new Error(`Add some content after the time on line ${index + 1}.`);
        basis = 'explicit_time';
        inheritedTime = time;
        inheritedFrom = segmentIndex + 1;
      }
      return {
        timestamp: `${date}T${time}${offset}`,
        content,
        source: {
          text: segment,
          line: index + 1,
          start: start + span.start,
          end: start + span.end,
          captured_at: capturedAt,
          timestamp_basis: basis,
          ...(spans.length > 1
            ? {
                segment: segmentIndex + 1,
                segments: spans.length,
                parent_text: raw,
                parent_start: start,
                parent_end: start + raw.length,
              }
            : {}),
          ...(basis === 'inherited_time'
            ? { timestamp_inherited_from: { line: index + 1, segment: inheritedFrom } }
            : {}),
        },
        data: {},
      };
    });
  });
  if (!records.length) throw new Error('Write a journal entry first.');
  if (records.length > LIMITS.entries)
    throw new Error(
      `Submit up to ${LIMITS.entries} entries at a time, including semicolon-separated entries.`,
    );
  return records;
}

export function validateExamples(examples) {
  if (!Array.isArray(examples) || examples.length > LIMITS.examples)
    throw new Error(`Keep at most ${LIMITS.examples} saved examples.`);
  const ids = new Set();
  return examples.map((example) => {
    if (
      !example ||
      typeof example.id !== 'string' ||
      ids.has(example.id) ||
      typeof example.content !== 'string' ||
      !example.content.trim() ||
      example.content.length > LIMITS.line
    )
      throw new Error('Invalid saved example.');
    ids.add(example.id);
    return { id: example.id, content: example.content, data: validateData(example.data) };
  });
}
