import assert from 'node:assert/strict';
import { blankData } from '../shared/schema.js';
import { nextVersion } from '../shared/model.js';
const base = process.env.TEST_WORKER_URL || 'http://127.0.0.1:8787';
const post = async (path, body) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
};
const { room } = await post('/api/rooms', {});
const make = (id, device) => ({
  id,
  kind: 'entry',
  deleted: false,
  version: nextVersion('', device),
  data: {
    text: 'Software test marker',
    date: '2026-01-01',
    events: [
      {
        id: `event-${id}`,
        journalEntryId: id,
        type: 'subjective',
        date: '2026-01-01',
        time: '12:00',
        timestamp: '2026-01-01T12:00:00Z',
        title: 'Software test marker',
        sourceText: 'Software test marker',
        data: { ...blankData(), note: 'Fictional local test' },
      },
    ],
  },
});
const a = make('a', 'phone'),
  b = make('b', 'desktop');
const first = await post(`/api/rooms/${room}/sync`, { records: [a], cursor: 0 });
assert.equal(first.records.length, 1);
const second = await post(`/api/rooms/${room}/sync`, { records: [b], cursor: 0 });
assert.deepEqual(second.records.map((r) => r.id).sort(), ['a', 'b']);
const poll = await post(`/api/rooms/${room}/sync`, { records: [], cursor: first.cursor });
assert.deepEqual(
  poll.records.map((r) => r.id),
  ['b'],
);
const deleted = { ...a, deleted: true, version: nextVersion(a.version, 'phone') };
const deletion = await post(`/api/rooms/${room}/sync`, {
  records: [deleted],
  cursor: second.cursor,
});
assert.equal(deletion.records[0].deleted, true);
const stale = await post(`/api/rooms/${room}/sync`, { records: [a], cursor: deletion.cursor });
assert.equal(stale.records[0].deleted, true);
assert.equal(stale.cursor, deletion.cursor);
console.log(
  'Worker integration passed: independent offline records, incremental cursor, deletion, stale rejection.',
);
