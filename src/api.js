import { relevantMemories, validateParse } from '../shared/schema.js';
import { uid, localTime } from '../shared/model.js';
import { parseUsingAcceptedEntries } from '../shared/learned-parser.js';
import { apiBase, getRecords, getMeta, mergeRemote } from './storage.js';
export async function request(settings, path, body, timeout = 60000) {
  const base = apiBase(settings);
  if (!base)
    throw new Error(
      'Connect your Worker in Settings to parse entries. Your text is saved on this device.',
    );
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(value.error || `Request failed (${response.status}). Your entry is saved.`);
  return value;
}
export async function parseJournalEntry({
  text,
  date,
  referenceTime,
  timezone,
  memories,
  settings,
}) {
  const input = {
    text,
    date,
    time: referenceTime || localTime(),
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    memories: relevantMemories(text, memories).map((m) => m.data),
  };
  const result = await parseUsingAcceptedEntries(input, await getRecords(), memories, (pending) => {
    if (!navigator.onLine)
      throw Object.assign(new Error('This entry needs an online interpretation.'), {
        code: 'offline_parse_needed',
      });
    return request(settings, '/api/parse', pending);
  });
  validateParse(result);
  if (!result.events.length)
    throw new Error('No events found. Add a little detail, or save a note manually.');
  return { ...result, events: result.events.map((event) => ({ ...event, id: uid() })) };
}
export class SyncClient {
  constructor(getSettings, onStatus, onChange) {
    this.getSettings = getSettings;
    this.onStatus = onStatus;
    this.onChange = onChange;
    this.stopped = true;
    this.running = false;
    this.again = false;
    this.socket = null;
  }
  start() {
    this.stopped = false;
    this.listener = () => {
      if (!document.hidden) this.sync();
    };
    window.addEventListener('online', this.listener);
    document.addEventListener('visibilitychange', this.listener);
    this.timer = setInterval(() => {
      if (!document.hidden) this.sync();
    }, 30000);
    this.connect();
    this.sync();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.reconnect);
    window.removeEventListener('online', this.listener);
    document.removeEventListener('visibilitychange', this.listener);
    this.socket?.close();
  }
  connect() {
    if (
      this.stopped ||
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;
    const settings = this.getSettings();
    if (!settings.room || !apiBase(settings) || !navigator.onLine) return;
    const url = new URL(`${apiBase(settings)}/api/rooms/${settings.room}/socket`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(url);
    this.socket.onmessage = () => this.sync();
    this.socket.onclose = () => {
      this.socket = null;
      if (!this.stopped) this.reconnect = setTimeout(() => this.connect(), 5000);
    };
    this.socket.onerror = () => this.socket?.close();
  }
  async sync() {
    if (this.stopped) return;
    const settings = this.getSettings();
    if (!settings.room || !apiBase(settings)) {
      this.onStatus('local');
      return;
    }
    if (!navigator.onLine) {
      this.onStatus('offline');
      return;
    }
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.onStatus('syncing');
    try {
      const records = (await getRecords()).filter((r) => r.dirty).map(({ dirty, ...r }) => r);
      const cursor = (await getMeta('cursor')) || 0;
      const result = await request(settings, `/api/rooms/${settings.room}/sync`, {
        records,
        cursor,
      });
      if (this.stopped) return;
      await mergeRemote(result.records, records, result.cursor);
      await this.onChange();
      this.onStatus('synced');
      this.connect();
    } catch (error) {
      this.onStatus(navigator.onLine ? 'error' : 'offline', error.message);
    } finally {
      this.running = false;
      if (this.again && !this.stopped) {
        this.again = false;
        this.sync();
      }
    }
  }
}
