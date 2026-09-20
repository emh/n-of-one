import { useState, useRef } from 'preact/hooks';
import { Modal, Icon, IconButton } from './ui.jsx';
import { request } from '../api.js';
import { apiBase } from '../storage.js';
import { LABELS } from '../../shared/schema.js';
export function SettingsPanel({
  settings,
  memories,
  onSettings,
  onClose,
  onExport,
  onImport,
  onDeleteMemory,
  onDemo,
  isDemo,
}) {
  const [url, setUrl] = useState(settings.workerUrl || import.meta.env.VITE_WORKER_URL || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef();
  function candidate() {
    if (url) {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' &&
        !(
          parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        )
      )
        throw new Error('Use an HTTPS Worker URL (or localhost during development).');
    }
    return { ...settings, workerUrl: url.replace(/\/+$/, '') };
  }
  async function run(fn) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    const next = candidate();
    const result = await fetch(`${apiBase(next)}/api/health`).then((r) => r.json());
    if (!result.ok) throw new Error('Could not connect to this Worker.');
    await onSettings(next);
    setMessage(
      result.parserReady
        ? 'Connected. Parsing is ready.'
        : 'Connected. The Worker still needs its LLM API key.',
    );
  }
  async function link() {
    const next = candidate();
    if (!next.room) next.room = (await request(next, '/api/rooms', {})).room;
    await onSettings(next);
    const link = new URL(location.href);
    link.hash = `connect=${encodeURIComponent(JSON.stringify({ workerUrl: apiBase(next), room: next.room }))}`;
    try {
      await navigator.clipboard.writeText(link.toString());
      setMessage('Device link copied. Open it on your other device.');
    } catch {
      setMessage(link.toString());
    }
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <section class="settings-section">
        <h3>Connection</h3>
        <label class="field">
          <span>Worker URL</span>
          <input
            type="url"
            placeholder={
              import.meta.env.DEV ? 'Local worker' : 'https://n-of-one-api.your-name.workers.dev'
            }
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
        </label>
        <div class="button-row">
          <button class="button secondary" disabled={busy || isDemo} onClick={() => run(connect)}>
            <Icon name="cloud" size={16} />
            Connect
          </button>
          <button class="button secondary" disabled={busy || isDemo} onClick={() => run(link)}>
            <Icon name="link" size={16} />
            {settings.room ? 'Copy device link' : 'Link another device'}
          </button>
        </div>
        {settings.room && (
          <button
            class="text-button muted"
            onClick={() =>
              run(async () => {
                await onSettings({ ...settings, room: '' });
                setMessage('Sync disconnected. Local entries are still here.');
              })
            }
          >
            Disconnect sync
          </button>
        )}
        {message && (
          <p class="settings-message" role="status">
            {message}
          </p>
        )}
      </section>
      <section class="settings-section">
        <h3>
          Remembered phrases <span class="count">{memories.length}</span>
        </h3>
        {memories.length ? (
          <div class="memory-list">
            {memories.map((memory) => (
              <div key={memory.id}>
                <div>
                  <strong>{memory.data.alias}</strong>
                  <small>
                    {memory.data.type === 'food'
                      ? `${memory.data.eventData.proteinLow}–${memory.data.eventData.proteinHigh}g protein`
                      : `${LABELS[memory.data.eventData.modality] || memory.data.eventData.modality} · ${memory.data.eventData.durationMinutes} min`}
                  </small>
                </div>
                <IconButton
                  icon="delete"
                  label={`Forget ${memory.data.alias}`}
                  onClick={() => onDeleteMemory(memory)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p class="muted small">None</p>
        )}
      </section>
      <section class="settings-section">
        <h3>Backup</h3>
        <div class="button-row">
          <button class="button secondary" onClick={onExport}>
            <Icon name="download" size={16} />
            Export
          </button>
          <button
            class="button secondary"
            title="Merge a JSON backup into this device"
            disabled={isDemo || busy}
            onClick={() => file.current.click()}
          >
            <Icon name="upload" size={16} />
            Import
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files[0];
              if (f)
                run(async () => {
                  await onImport(f);
                  setMessage('Backup imported.');
                });
              e.currentTarget.value = '';
            }}
          />
        </div>
      </section>
      <section class="settings-section sample-setting">
        <div>
          <h3>Sample data</h3>
        </div>
        <button class="text-button" onClick={onDemo}>
          {isDemo ? 'Exit sample' : 'View sample'}
          <Icon name="arrow" size={16} />
        </button>
      </section>
    </Modal>
  );
}
