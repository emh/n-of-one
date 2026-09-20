import { validDate } from './schema.js';
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
    let eventTime = time;
    const stamped = content.match(/^(\d{1,2}):(\d{2})(?:\s+|$)|^(\d{2})(\d{2})(?:\s+|$)/);
    if (stamped) {
      const hour = Number(stamped[1] ?? stamped[3]),
        minute = Number(stamped[2] ?? stamped[4]);
      if (hour > 23 || minute > 59)
        throw new Error('Use a valid 24-hour time, such as 0730 or 07:30.');
      eventTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      content = content.slice(stamped[0].length).trim();
    }
    if (content)
      lines.push({
        sourceLine: lines.length,
        text: content,
        sourceText: raw.trim(),
        date: contextDate,
        time: eventTime,
      });
  }
  return lines;
}
