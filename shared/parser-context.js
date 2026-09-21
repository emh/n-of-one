import { validDate } from './schema.js';

// Explicit boundaries only; "coffee and oats" remains a single observation.
function segments(text) {
  const parts = [];
  let start = 0,
    quote = null,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
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
    } else if (char === '"' || char === '“') quote = char === '“' ? '”' : '"';
    else if (char === ';') {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}
// Timestamps belong to the app, not the language model. No inference from ordering.
export function journalLines(text, date, time) {
  let contextDate = date;
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    let content = raw.trim();
    if (!content) continue;
    const dated = content.match(/^(\d{4}-\d{2}-\d{2})(?:\s+|$)/);
    if (dated) {
      if (!validDate(dated[1])) throw new Error('Use a valid YYYY-MM-DD date.');
      contextDate = dated[1];
      content = content.slice(dated[0].length).trim();
      if (!content) continue;
    }
    const parts = segments(content);
    let eventTime = time,
      hasExplicitTime = false;
    for (const [partIndex, part] of parts.entries()) {
      content = part;
      const stamped = content.match(/^(\d{1,2}):(\d{2})(?:\s+|$)|^(\d{2})(\d{2})(?:\s+|$)/);
      if (stamped) {
        const hour = Number(stamped[1] ?? stamped[3]),
          minute = Number(stamped[2] ?? stamped[4]);
        if (hour > 23 || minute > 59)
          throw new Error('Use a valid 24-hour time, such as 0730 or 07:30.');
        eventTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        hasExplicitTime = true;
        content = content.slice(stamped[0].length).trim();
      }
      if (!content) continue;
      lines.push({
        sourceLine: lines.length,
        text: content,
        sourceText: parts.length > 1 ? part : raw.trim(),
        date: contextDate,
        time: eventTime,
        ...(parts.length > 1
          ? {
              sourceContext: {
                text: raw.trim(),
                part: partIndex + 1,
                parts: parts.length,
                timestampBasis: stamped ? 'explicit' : hasExplicitTime ? 'inherited' : 'reference',
              },
            }
          : {}),
      });
    }
  }
  return lines;
}
