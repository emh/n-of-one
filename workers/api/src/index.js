import { parseJournal } from './parser.js';
import { compareVersions } from '../../../shared/model.js';
import { validateEvent, validDate } from '../../../shared/schema.js';
const ROOM_PATTERN = /^\/api\/rooms\/([a-f0-9-]{36})\/(sync|socket)$/;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers });
export function validateRecord(record) {
  if (
    !record ||
    typeof record.id !== 'string' ||
    record.id.length > 100 ||
    !['entry', 'memory'].includes(record.kind) ||
    !/^\d{13}:\d{8}:[a-zA-Z0-9-]{1,60}$/.test(record.version) ||
    typeof record.deleted !== 'boolean'
  )
    throw new Error('Invalid sync record.');
  if (JSON.stringify(record).length > 1000000)
    throw new Error('An entry is too large to sync. Export a backup and shorten its edit history.');
  if (record.deleted) return;
  if (record.kind === 'entry') {
    if (
      !record.data ||
      typeof record.data.text !== 'string' ||
      !validDate(record.data.date) ||
      !Array.isArray(record.data.events) ||
      record.data.events.length > 80
    )
      throw new Error('Invalid journal entry.');
    record.data.events.forEach((event) => {
      validateEvent(event);
      if (!Number.isFinite(Date.parse(event.timestamp)))
        throw new Error('Invalid event timestamp.');
    });
  } else if (
    typeof record.data?.alias !== 'string' ||
    record.data.alias.length > 200 ||
    !record.data.eventData
  )
    throw new Error('Invalid memory.');
}
export class JournalRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL, seq INTEGER NOT NULL)',
    );
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
    );
    this.sql.exec("INSERT OR IGNORE INTO metadata VALUES ('cursor', 0)");
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const body = await request.json();
    if (
      !Array.isArray(body.records) ||
      body.records.length > 5000 ||
      !Number.isSafeInteger(body.cursor) ||
      body.cursor < 0
    )
      return json({ error: 'Invalid sync request.' }, 400);
    try {
      body.records.forEach(validateRecord);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    let result;
    let changed = false;
    this.ctx.storage.transactionSync(() => {
      let cursor = this.sql.exec("SELECT value FROM metadata WHERE key = 'cursor'").one().value;
      for (const { dirty, ...record } of body.records) {
        const old = [...this.sql.exec('SELECT version FROM records WHERE id = ?', record.id)][0];
        if (!old || compareVersions(record.version, old.version) > 0) {
          this.sql.exec(
            'INSERT INTO records VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload=excluded.payload, seq=excluded.seq',
            record.id,
            record.version,
            JSON.stringify(record),
            ++cursor,
          );
          changed = true;
        }
      }
      this.sql.exec("UPDATE metadata SET value = ? WHERE key = 'cursor'", cursor);
      const since = body.cursor > cursor ? 0 : body.cursor;
      const records = new Map(
        [...this.sql.exec('SELECT id, payload FROM records WHERE seq > ?', since)].map((row) => [
          row.id,
          JSON.parse(row.payload),
        ]),
      );
      // Also return the winner for rejected stale submissions, even before the cursor.
      for (const record of body.records) {
        const row = this.sql.exec('SELECT payload FROM records WHERE id = ?', record.id).one();
        records.set(record.id, JSON.parse(row.payload));
      }
      result = { cursor, records: [...records.values()] };
    });
    if (changed)
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send('changed');
        } catch {
          /* reconnecting device will pull */
        }
      }
    return json(result);
  }
  webSocketMessage() {}
  webSocketClose(socket, code, reason) {
    socket.close(code, reason);
  }
  webSocketError() {}
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const headers = {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    if (origin && !allowed.includes(origin))
      return json({ error: 'Origin not allowed.' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    try {
      if (Number(request.headers.get('Content-Length')) > 12000000)
        return json({ error: 'Request too large.' }, 413, headers);
      if (url.pathname === '/api/health')
        return json(
          {
            ok: true,
            parserReady: Boolean(env.OPENAI_API_KEY),
            typesafeReady:
              Boolean(env.TYPESAFE_API_KEY || env.TYPESAFE_KEY) && env.TYPESAFE_ENABLED !== 'false',
            llmReady: Boolean(env.OPENAI_API_KEY),
          },
          200,
          headers,
        );
      if (url.pathname === '/api/parse' && request.method === 'POST')
        return json(await parseJournal(await request.json(), env), 200, headers);
      if (url.pathname === '/api/rooms' && request.method === 'POST')
        return json({ room: crypto.randomUUID() }, 200, headers);
      const route = url.pathname.match(ROOM_PATTERN);
      if (
        route &&
        ((route[2] === 'sync' && request.method === 'POST') ||
          (route[2] === 'socket' && request.method === 'GET'))
      ) {
        const response = await env.JOURNAL.get(env.JOURNAL.idFromName(route[1])).fetch(request);
        if (response.status === 101) return response;
        return new Response(response.body, {
          status: response.status,
          headers: { ...Object.fromEntries(response.headers), ...headers },
        });
      }
      return json({ error: 'Not found.' }, 404, headers);
    } catch (error) {
      return json({ error: error.message || 'Request failed.' }, error.status || 400, headers);
    }
  },
};
