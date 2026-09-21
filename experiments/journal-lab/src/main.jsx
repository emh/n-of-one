import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Copy,
  FlaskConical,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-preact';
import '@fontsource-variable/dm-sans';
import '@fontsource/ibm-plex-mono/400.css';
import { LIMITS, normalizeText, validateData, validateExamples } from '../shared/journal.js';
import './styles.css';

const STORAGE = 'typesafe-journal-lab:v1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sample =
  '07:30 Slept 7 hours, feeling rested\n08:15 Coffee and a bowl of oats\n12:30 Ran 5 km in 30 minutes';
const pretty = (value) => JSON.stringify(value, null, 2);
const pct = (value) => (typeof value === 'number' ? `${Math.round(value * 100)}%` : '—');

function load() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return {};
    const value = JSON.parse(raw);
    validateExamples(value.examples ?? []);
    if (typeof value.text !== 'string' || typeof value.date !== 'string') throw new Error();
    return value;
  } catch {
    return {
      storageError:
        'Saved browser data could not be read. Export anything still visible before replacing it.',
    };
  }
}
async function request(path, method = 'GET', data) {
  const response = await fetch(`/api/${path}`, {
    method,
    ...(data !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function download(value, name) {
  const url = URL.createObjectURL(new Blob([pretty(value)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Json({ value }) {
  const tokens = pretty(value).split(
    /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?\b)/g,
  );
  return (
    <pre class="json">
      <code>
        {tokens.map((token, i) => (
          <span
            key={i}
            class={
              /^".*:\s*$/.test(token)
                ? 'json-key'
                : token.startsWith('"')
                  ? 'json-string'
                  : /^(true|false|null)$/.test(token)
                    ? 'json-null'
                    : /^-?\d/.test(token)
                      ? 'json-number'
                      : ''
            }
          >
            {token}
          </span>
        ))}
      </code>
    </pre>
  );
}
function Modal({ title, subtitle, close, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const cancel = (event) => {
      event.preventDefault();
      close();
    };
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div class="modal-inner">
        <div class="modal-heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button class="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function App() {
  const [initial] = useState(load);
  const [text, setText] = useState(initial.text ?? '');
  const [date, setDate] = useState(initial.date ?? today());
  const [examples, setExamples] = useState(initial.examples ?? []);
  const [result, setResult] = useState(initial.result ?? null);
  const [threshold, setThreshold] = useState(initial.threshold ?? 0.7);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.storageError ?? '');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [editor, setEditor] = useState('{}');
  const [editorError, setEditorError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [raw, setRaw] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const importRef = useRef();
  const journalRef = useRef();

  useEffect(() => {
    request('status')
      .then(setStatus)
      .catch(() => setError('The local API is unavailable. Start this app with npm run dev.'));
  }, []);
  useEffect(() => {
    if (initial.storageError) return;
    try {
      localStorage.setItem(
        STORAGE,
        pretty({ version: 1, text, date, examples, threshold, result }),
      );
    } catch {
      setError('Browser storage is full or unavailable. Export your examples to keep a copy.');
    }
  }, [text, date, examples, threshold, result]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function parse(event) {
    event?.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const capturedAt = new Date().toISOString();
      const offsetMinutes = new Date(`${date}T12:00:00`).getTimezoneOffset();
      const next = await request('parse', 'POST', {
        text,
        date,
        capturedAt,
        offsetMinutes,
        examples,
        threshold,
      });
      setResult({
        ...next,
        submitted_text: text,
        submitted_date: date,
        example_revision: pretty(examples),
        submitted_threshold: threshold,
      });
    } catch (e) {
      setError(e.message || 'Could not reach the local server. Your draft is still here.');
    } finally {
      setBusy(false);
    }
  }
  function teach(record, index, exampleId) {
    setEditor(pretty(record.data));
    setEditorError('');
    setModal({ kind: 'teach', record, index, exampleId });
  }
  function saveExample(event) {
    event.preventDefault();
    try {
      const data = validateData(JSON.parse(editor));
      if (!Object.keys(data).length)
        throw new Error('Add at least one field to teach a translation.');
      const existing = examples.find(
        (e) =>
          e.id === modal.exampleId ||
          normalizeText(e.content) === normalizeText(modal.record.content),
      );
      if (!existing && examples.length >= LIMITS.examples)
        throw new Error(`This experiment supports ${LIMITS.examples} examples. Remove one first.`);
      const example = {
        id: existing?.id ?? crypto.randomUUID(),
        content: modal.record.content,
        data,
      };
      setExamples(
        existing
          ? examples.map((e) => (e.id === existing.id ? example : e))
          : [...examples, example],
      );
      if (modal.index !== undefined)
        setResult((current) => ({
          ...current,
          records: current.records.map((record, i) =>
            i !== modal.index
              ? record
              : {
                  ...record,
                  data,
                  inference: {
                    method: 'taught',
                    confidence: null,
                    example_id: example.id,
                    reason: 'Translation supplied by you.',
                  },
                },
          ),
        }));
      setModal(null);
      setNotice('Example saved. Future submissions will use this correction.');
    } catch (e) {
      setEditorError(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : e.message);
    }
  }
  async function connect(event) {
    event.preventDefault();
    setConnecting(true);
    setConnectionError('');
    try {
      setStatus(await request('connection', 'PUT', { apiKey }));
      setApiKey('');
      setModal(null);
      setNotice('TypeSafe connected. Try a new entry.');
    } catch (e) {
      setConnectionError(e.message);
    } finally {
      setConnecting(false);
    }
  }
  async function importExamples(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 600000) throw new Error('Choose a JSON export smaller than 600 KB.');
      const imported = JSON.parse(await file.text());
      const values = validateExamples(imported.examples ?? imported);
      const merged = [...examples];
      for (const example of values) {
        const index = merged.findIndex(
          (e) => normalizeText(e.content) === normalizeText(example.content),
        );
        const updated = { ...example, id: index >= 0 ? merged[index].id : crypto.randomUUID() };
        if (index >= 0) merged[index] = updated;
        else merged.push(updated);
      }
      validateExamples(merged);
      setExamples(merged);
      setLibraryError('');
      setNotice(`Imported ${values.length} example${values.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setLibraryError(e.message);
    }
  }
  const records = result?.records ?? [];
  const stale =
    result &&
    (result.submitted_text !== text ||
      result.submitted_date !== date ||
      result.example_revision !== pretty(examples) ||
      result.submitted_threshold !== threshold);
  const structured = records.filter((record) => Object.keys(record.data).length).length;
  const needsReview = records.filter(
    (record) =>
      record.inference.method === 'capture' ||
      Object.values(record.inference.fields ?? {}).some((field) => !field.accepted),
  ).length;
  const close = () => {
    if (!connecting) {
      setModal(null);
      setApiKey('');
      setConnectionError('');
    }
  };

  return (
    <>
      <header class="topbar">
        <a class="brand" href="/" aria-label="Fieldnotes home">
          <span class="brand-mark">
            <Braces size={22} />
          </span>
          fieldnotes
          <span class="brand-divider" />
          <span class="brand-sub">JOURNAL LAB</span>
        </a>
        <div class="top-actions">
          <span class="local-label">
            <span class="dot" /> LOCAL EXPERIMENT
          </span>
          <button
            class={`connection ${status?.configured ? 'connected' : ''}`}
            onClick={() => setModal({ kind: 'connection' })}
          >
            <span class="dot" />
            {status?.configured ? 'TypeSafe connected' : 'Connect TypeSafe'}
            <Link2 size={14} />
          </button>
        </div>
      </header>
      <main>
        <section class="intro">
          <div>
            <div class="eyebrow">
              <FlaskConical size={14} /> EXPERIMENT 001 / LANGUAGE → STRUCTURE
            </div>
            <h1>Your words. Your structure.</h1>
            <p>
              A journal that learns how <em>you</em> see things. Start writing, then teach it one
              example at a time.
            </p>
          </div>
          <button
            class="library-button"
            onClick={() => {
              setConfirmClear(false);
              setModal({ kind: 'library' });
            }}
          >
            <BookOpen size={17} />
            <span>Example library</span>
            <b>{examples.length}</b>
          </button>
        </section>
        <section class="learning-strip" aria-label="Learning progress">
          <div class={`step ${examples.length === 0 ? 'active' : ''}`}>
            <span class="step-number">01</span>
            <div>
              <strong>Start with nothing</strong>
              <span>Words become timestamped records</span>
            </div>
          </div>
          <ArrowRight size={17} class="step-arrow" />
          <div class={`step ${examples.length > 0 ? 'active' : ''}`}>
            <span class="step-number">02</span>
            <div>
              <strong>Teach your meaning</strong>
              <span>Click any result to add your JSON</span>
            </div>
          </div>
          <ArrowRight size={17} class="step-arrow" />
          <div class="step">
            <span class="step-number">03</span>
            <div>
              <strong>Try something similar</strong>
              <span>New entries draw on your examples</span>
            </div>
          </div>
          <span class="memory-count">
            {examples.length === 0
              ? 'A clean slate'
              : `${examples.length} example${examples.length === 1 ? '' : 's'} remembered`}
          </span>
        </section>
        {error && (
          <div class="message error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}
        <div class="workspace">
          <section class="panel input-panel">
            <div class="panel-heading">
              <div>
                <span class="panel-index">01</span>
                <h2>Journal</h2>
              </div>
              <span class="small-label">NATURAL LANGUAGE</span>
            </div>
            <form onSubmit={parse}>
              <div class="journal-toolbar">
                <label class="date-label" for="journal-date">
                  Journal date{' '}
                  <input
                    id="journal-date"
                    type="date"
                    value={date}
                    onInput={(e) => setDate(e.currentTarget.value)}
                    required
                  />
                </label>
                <span>{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}</span>
              </div>
              <label class="sr-only" for="journal">
                Journal entries
              </label>
              <textarea
                ref={journalRef}
                id="journal"
                class="journal-input"
                value={text}
                maxLength={LIMITS.text}
                onInput={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') parse(e);
                }}
                placeholder={
                  'What happened today?\n\n07:30 Slept 7 hours, feeling rested\n08:15 Coffee and a bowl of oats\n12:30 Ran 5 km in 30 minutes'
                }
                spellCheck={true}
              />
              <div class="input-meta">
                <span>Separate entries with new lines or semicolons · times optional</span>
                <span>{text.length.toLocaleString()} / 12,000</span>
              </div>
              <div class="submit-row">
                <button
                  type="button"
                  class="text-button"
                  onClick={() => {
                    setText(sample);
                    journalRef.current?.focus();
                  }}
                >
                  Try sample text <ArrowRight size={14} />
                </button>
                <button class="primary" type="submit" disabled={busy || !text.trim()}>
                  {busy ? <LoaderCircle size={16} class="spin" /> : <Sparkles size={16} />}
                  {busy ? 'Interpreting…' : 'Interpret journal'}
                  {!busy && <span class="keyhint">⌘ ↵</span>}
                </button>
              </div>
            </form>
            <div class="field-note">
              <span class="note-symbol">✳</span>
              <div>
                <strong>
                  {examples.length
                    ? 'A little memory goes a long way.'
                    : 'No categories. No assumptions.'}
                </strong>
                <p>
                  {examples.length
                    ? 'Saved corrections guide future entries. Change the wording or quantity, interpret again, and see what carries over.'
                    : 'Your first entries keep their timestamp and original words. You decide which fields matter by teaching a translation.'}
                </p>
              </div>
            </div>
            <details class="settings">
              <summary>
                Experiment settings <ChevronDown size={15} />
              </summary>
              <div class="settings-content">
                <label for="threshold">
                  Minimum selection probability <strong>{pct(threshold)}</strong>
                </label>
                <input
                  id="threshold"
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={threshold}
                  onInput={(e) => setThreshold(Number(e.currentTarget.value))}
                />
                <p>
                  Selections below this threshold stay unstructured or return <code>null</code>.
                  This experimental threshold is not a measured accuracy guarantee.
                </p>
              </div>
            </details>
          </section>
          <section class="panel output-panel" aria-busy={busy}>
            <div class="panel-heading">
              <div>
                <span class="panel-index">02</span>
                <h2>Structured output</h2>
              </div>
              <div class="view-toggle">
                <button
                  class={!raw ? 'selected' : ''}
                  onClick={() => setRaw(false)}
                  aria-pressed={!raw}
                >
                  Entries
                </button>
                <button
                  class={raw ? 'selected' : ''}
                  onClick={() => setRaw(true)}
                  aria-pressed={raw}
                >
                  <Code2 size={13} />
                  JSON
                </button>
              </div>
            </div>
            {!result ? (
              <div class="empty-state">
                <div class="empty-art">
                  <span class="art-line one" />
                  <span class="art-line two" />
                  <span class="art-line three" />
                  <Braces size={38} strokeWidth={1.3} />
                  <span class="art-dot" />
                </div>
                <h3>Meaning starts here.</h3>
                <p>
                  Write a few lines on the left.
                  <br />
                  Your structured entries will appear here.
                </p>
                <span class="empty-tag">
                  <span class="dot" /> 0 examples needed to begin
                </span>
              </div>
            ) : (
              <>
                <div class="output-toolbar">
                  <span>
                    <b>{records.length}</b> {records.length === 1 ? 'entry' : 'entries'}
                    <i />
                    {structured} structured
                    {needsReview > 0 && (
                      <span class="review-label"> · {needsReview} to teach or review</span>
                    )}
                  </span>
                  <button
                    class="icon-button"
                    title="Copy JSON"
                    aria-label="Copy JSON"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pretty(records));
                        setNotice('JSON copied.');
                      } catch {
                        setError('Clipboard unavailable. Use Export JSON instead.');
                      }
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                {stale && (
                  <div class="stale-banner">
                    <RotateCcw size={13} />
                    Input or examples changed. Interpret again to compare.
                  </div>
                )}
                {result.warnings.map((warning, i) => (
                  <div key={i} class="output-warning">
                    {warning}
                  </div>
                ))}
                {raw ? (
                  <div class="raw-output">
                    <Json value={records} />
                    <p>Switch to Entries to teach a translation.</p>
                  </div>
                ) : (
                  <div class="result-list">
                    {records.map((record, i) => {
                      const method = record.inference.method;
                      const label = {
                        capture: 'Unstructured',
                        taught: 'Taught by you',
                        remembered: 'Remembered',
                        typesafe: 'TypeSafe',
                      }[method];
                      const accepted = Object.values(record.inference.fields ?? {}).filter(
                        (f) => f.accepted,
                      ).length;
                      return (
                        <article class="result-card" key={i}>
                          <button
                            class="record-trigger"
                            onClick={() => teach(record, i)}
                            aria-label={`Teach entry ${i + 1}: ${record.content}`}
                          >
                            <span class="record-header">
                              <span class="record-number">{String(i + 1).padStart(2, '0')}</span>
                              <time>{record.timestamp.slice(11, 16)}</time>
                              {record.source.segments > 1 && (
                                <span
                                  class="compound-label"
                                  title={`From line ${record.source.line}: ${record.source.parent_text}`}
                                >
                                  Part {record.source.segment}/{record.source.segments}
                                  {record.source.timestamp_basis === 'inherited_time'
                                    ? ' · shared time'
                                    : ''}
                                </span>
                              )}
                              <span class={`badge ${method}`}>
                                {method === 'taught' || method === 'remembered' ? (
                                  <Check size={11} />
                                ) : null}
                                {label}
                              </span>
                              <Pencil class="edit-icon" size={14} />
                            </span>
                            <span class="source-quote">{record.content}</span>
                            <Json
                              value={{
                                timestamp: record.timestamp,
                                content: record.content,
                                source: {
                                  line: record.source.line,
                                  text: record.source.text,
                                  ...(record.source.segments > 1
                                    ? {
                                        segment: record.source.segment,
                                        timestamp_basis: record.source.timestamp_basis,
                                      }
                                    : {}),
                                },
                                data: record.data,
                              }}
                            />
                            <span class="teach-hint">
                              <Plus size={13} />
                              {method === 'capture'
                                ? 'Teach a translation'
                                : 'Correct this translation'}
                            </span>
                          </button>
                          {method === 'typesafe' && (
                            <div class="decision-strip">
                              <span>
                                Match <b>{pct(record.inference.match.probability)}</b>
                              </span>
                              <span>
                                Choice confidence <b>{pct(record.inference.match.confidence)}</b>
                              </span>
                              <span>
                                {accepted}/{Object.keys(record.inference.fields).length} fields
                              </span>
                            </div>
                          )}
                          <details class="record-details">
                            <summary>
                              Source & decision details
                              <ChevronDown size={12} />
                            </summary>
                            <p>{record.inference.reason}</p>
                            <Json value={{ source: record.source, inference: record.inference }} />
                          </details>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div class="output-footer">
                  <span>
                    {result.calls
                      ? `${result.calls} calls · ${result.input_tokens + result.output_tokens} tokens · ${(result.duration_ms / 1000).toFixed(1)}s`
                      : 'Local capture · no model call'}
                    {result.model && ` · ${result.model}`}
                  </span>
                  <button
                    class="text-button"
                    onClick={() => download(records, `journal-${date}.json`)}
                  >
                    <ArrowDownToLine size={13} />
                    Export JSON
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
        <footer class="page-footer">
          <span>
            <span class="dot" /> Drafts & examples saved in this browser
          </span>
          <button onClick={() => setModal({ kind: 'about' })}>
            How the learning works <ArrowRight size={13} />
          </button>
          <span>BUILT WITH TYPESAFE / JEV</span>
        </footer>
        {result?.trace?.length > 0 && (
          <details class="trace">
            <summary>
              Inspect API requests & responses <Code2 size={14} />
            </summary>
            <p>
              Actual model inputs and outputs, including your source text and teaching examples. API
              keys are never included.
            </p>
            <Json value={result.trace} />
          </details>
        )}
      </main>
      {notice && (
        <div class="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {modal?.kind === 'teach' && (
        <Modal
          title="Teach a translation"
          subtitle="You choose the structure. The next entry can learn from it."
          close={close}
        >
          <form onSubmit={saveExample}>
            <div class="teaching-source">
              <span class="small-label">ORIGINAL ENTRY</span>
              <p>{modal.record.content}</p>
            </div>
            <label class="editor-label" for="translation">
              Desired JSON{' '}
              <span>
                The fields inside <code>data</code>
              </span>
            </label>
            <textarea
              id="translation"
              class="json-editor"
              value={editor}
              onInput={(e) => {
                setEditor(e.currentTarget.value);
                setEditorError('');
              }}
              spellCheck={false}
              autoFocus
            />
            <p class="editor-help">
              Use any field names, for example <code>{'{"activity":"run","distance_km":5}'}</code>.
              Timestamp and source are preserved separately. Nested objects and fixed-shape arrays
              are supported.
            </p>
            {editorError && (
              <p class="message error" role="alert">
                {editorError}
              </p>
            )}
            <div class="modal-footer">
              <span>
                <BookOpen size={14} /> Saved as a local example
              </span>
              <button class="primary" type="submit">
                <Check size={16} />
                Teach & save
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.kind === 'connection' && (
        <Modal
          title="Connect TypeSafe"
          subtitle="Give your examples a little common sense."
          close={close}
        >
          <p class="modal-copy">
            A TypeSafe key enables Jev to match new wording and select field values. Journal text
            and saved examples are sent to TypeSafe when inference is needed.
          </p>
          <form onSubmit={connect}>
            <label class="editor-label" for="api-key">
              TypeSafe API key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              required
            />
            <p class="editor-help">
              The key stays in the local server’s memory until restart. You can also set{' '}
              <code>TYPESAFE_API_KEY</code> in this app’s <code>.env</code> file.
            </p>
            {connectionError && (
              <p class="message error" role="alert">
                {connectionError}
              </p>
            )}
            <div class="modal-footer">
              <a href="https://console.typesafe.ai" target="_blank" rel="noreferrer">
                TypeSafe console ↗
              </a>
              <button class="primary" disabled={connecting || !apiKey.trim()}>
                {connecting ? <LoaderCircle class="spin" size={16} /> : <Link2 size={16} />}{' '}
                {connecting ? 'Connecting…' : 'Connect & verify'}
              </button>
            </div>
          </form>
          {status?.configured && (
            <div class="connected-note">
              Connected via{' '}
              {status.key_source === 'session' ? 'a session key' : 'the server environment'} ·{' '}
              {status.model}
              {status.key_source === 'session' && (
                <button
                  class="text-button"
                  onClick={async () => {
                    try {
                      setStatus(await request('connection', 'DELETE', {}));
                      setNotice('Session key removed.');
                    } catch (e) {
                      setConnectionError(e.message);
                    }
                  }}
                >
                  Remove session key
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {modal?.kind === 'library' && (
        <Modal
          title="Example library"
          subtitle={`${examples.length} of ${LIMITS.examples} examples · Yours to shape, edit, or forget.`}
          close={close}
          wide
        >
          <div class="library-actions">
            <button
              class="secondary"
              onClick={() => download({ version: 1, examples }, 'fieldnotes-examples.json')}
              disabled={!examples.length}
            >
              <ArrowDownToLine size={14} />
              Export examples
            </button>
            <button class="secondary" onClick={() => importRef.current.click()}>
              <Plus size={14} />
              Import examples
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={importExamples}
            />
          </div>
          {libraryError && (
            <p class="message error" role="alert">
              {libraryError}
            </p>
          )}
          {!examples.length ? (
            <div class="library-empty">
              <BookOpen size={30} strokeWidth={1.3} />
              <h3>A blank page is a good start.</h3>
              <p>
                Interpret a journal entry, click its result, and give it the JSON you want. That
                becomes your first example.
              </p>
            </div>
          ) : (
            <div class="library-list">
              {[...examples].reverse().map((example) => (
                <article key={example.id}>
                  <div>
                    <p>{example.content}</p>
                    <button
                      class="icon-button"
                      aria-label={`Edit example: ${example.content}`}
                      onClick={() => teach(example, undefined, example.id)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      class="icon-button"
                      aria-label={`Delete example: ${example.content}`}
                      onClick={() => {
                        setExamples(examples.filter((e) => e.id !== example.id));
                        setNotice('Example removed from future inference.');
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <Json value={example.data} />
                </article>
              ))}
            </div>
          )}
          {examples.length > 0 && (
            <div class="reset-row">
              {confirmClear ? (
                <>
                  <span>Forget all {examples.length} examples?</span>
                  <button class="text-button" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                  <button
                    class="danger-button"
                    onClick={() => {
                      setExamples([]);
                      setConfirmClear(false);
                      setNotice('Examples cleared. Starting from zero again.');
                    }}
                  >
                    Forget all
                  </button>
                </>
              ) : (
                <button class="text-button danger" onClick={() => setConfirmClear(true)}>
                  <RotateCcw size={13} />
                  Start from zero
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {modal?.kind === 'about' && (
        <Modal
          title="A small experiment in learning"
          subtitle="No predefined journal schema. Just the examples you teach."
          close={close}
        >
          <div class="about-content">
            <p>
              <strong>1. Capture.</strong> New lines and semicolons separate entries. A leading time
              is preserved and shared with later parts on the same line until another time appears.
              Durations never advance the clock automatically. Without a time, we use the capture
              time on your chosen date. Each part keeps its source span and the original compound
              line.
            </p>
            <p>
              <strong>2. Teach.</strong> Your correction becomes an input → JSON example stored in
              this browser. An exact text match reuses it locally, ignoring case and whitespace.
            </p>
            <p>
              <strong>3. Generalize.</strong> Jev selects an appropriate example, then selects each
              field from source candidates or previously taught labels. Unknowns stay null.
              Corrections are provided as context on future calls; model weights are not retrained.
            </p>
            <p>
              <strong>Read uncertainty carefully.</strong> Match probability is the probability of
              the selected example. Choice confidence measures concentration of the whole option
              distribution. Neither is an accuracy guarantee. Per-field values and scores are under
              each entry’s details.
            </p>
            <p>
              <strong>Boundaries.</strong> Split entries using new lines or semicolons. Semicolons
              inside double quotes are preserved; words like “and” do not split entries
              automatically. Up to 20 entries, 60 examples, and 24 fields per example. Arrays keep
              the taught length. Numbers come from digits or simple number words in the new source;
              unit conversion and new schema generation are not supported. Text candidates include
              taught labels and spans of up to six words, capped at 240. Candidate truncation is
              visible in field details.
            </p>
            <p>
              Drafts, results, and examples stay in this browser. When connected, inference sends
              source text and examples to TypeSafe. Export your examples if you want to keep or move
              them.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook"
              target="_blank"
              rel="noreferrer"
            >
              Read the TypeSafe selection pattern ↗
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}

render(<App />, document.getElementById('app'));
