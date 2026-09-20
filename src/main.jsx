import { manualState, replaceParsedEvents } from '../shared/event-origin.js';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { Icon, IconButton, DatePicker, SectionTitle, Empty } from './components/ui.jsx';
import { EventCard } from './components/event-card.jsx';
import { EventEditor } from './components/event-editor.jsx';
import { DaySummary, WeekView, BodyView } from './components/dashboards.jsx';
import { SettingsPanel } from './components/settings.jsx';
import {
  uid,
  localDate,
  localTime,
  acceptReview,
  allEvents,
  startOfWeek,
  addDays,
} from '../shared/model.js';
import { blankData, normalizePhrase } from '../shared/schema.js';
import {
  getRecords,
  saveRecords,
  getDrafts,
  saveDraft,
  deleteDraft,
  loadSettings,
  saveSettings,
  resetSyncCursor,
  getMeta,
  setMeta,
} from './storage.js';
import { parseJournalEntry, SyncClient } from './api.js';
import { sampleRecords } from './demo.js';
import { validateBackup } from '../shared/backup.js';
import { useNavigation } from './navigation.js';
import './styles.css';
const tabs = ['journal', 'today', 'week', 'body'];
const names = { journal: 'Journal', today: 'Summary', week: 'Week', body: 'Body' };
const freshDraft = (date) => ({
  id: uid(),
  text: '',
  date,
  events: null,
  originalEvents: null,
  parserVersion: null,
  mode: 'write',
  remember: {},
  queued: false,
  referenceTime: null,
  reviewEdits: [],
  parseAttempts: [],
});
function App() {
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(() => freshDraft(localDate()));
  const draftRef = useRef(draft);
  const { view, viewRef, navigate, back } = useNavigation();
  const [date, setDate] = useState(localDate());
  const [settings, setSettingsState] = useState(loadSettings);
  const settingsRef = useRef(settings);
  const [editEvent, setEditEvent] = useState(null);
  const [selectedId, setSelectedId] = useState(location.hash.split('/')[1] || null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState('local');
  const [syncError, setSyncError] = useState('');
  const [demo, setDemo] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const composer = useRef();
  const sync = useRef();
  const noticeTimer = useRef();
  const queueRunning = useRef(false);
  const {
    needRefresh: [updateAvailable],
    updateServiceWorker,
  } = useRegisterSW();
  const activeRecords = demo || records;
  const events = allEvents(activeRecords);
  const viewedEntry = activeRecords.find((r) => r.id === selectedId && !r.deleted);
  const memories = activeRecords.filter((r) => r.kind === 'memory' && !r.deleted);
  const review = view === 'review' && draft.events;
  const isRoot = tabs.includes(view);
  async function refresh() {
    const [r, d] = await Promise.all([getRecords(), getDrafts()]);
    setRecords(r);
    setDrafts(d.filter((item) => item.text || item.events?.length));
  }
  function notify(message) {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  }
  async function updateDraft(next) {
    draftRef.current = next;
    setDraft(next);
    setError('');
    if (demo || next.entryId) return;
    try {
      await saveDraft(next);
      await setMeta('activeDraft', next.id);
      setDrafts((previous) =>
        [...previous.filter((d) => d.id !== next.id), next].filter(
          (d) => d.text || d.events?.length,
        ),
      );
    } catch {
      setError('Could not save on this device. Export a backup before closing this page.');
    }
  }
  async function newEntry() {
    const next = freshDraft(date);
    await updateDraft(next);
    navigate('compose');
  }
  function discardEditing() {
    const next = freshDraft(date);
    draftRef.current = next;
    setDraft(next);
    setEditEvent(null);
    setParsing(false);
    setError('');
    navigate('entry', { entryId: selectedId, replace: true, direction: 'back' });
  }
  useEffect(() => {
    if (view === 'entry') setSelectedId(location.hash.slice(7));
    const editingId = location.hash.split('/')[1];
    if (
      ready &&
      ['review', 'compose', 'details'].includes(view) &&
      editingId &&
      !draftRef.current.entryId
    ) {
      setSelectedId(editingId);
      navigate('entry', { entryId: editingId, replace: true, direction: 'back' });
    }
    if ((isRoot || view === 'entry') && draftRef.current.entryId) {
      const next = freshDraft(date);
      draftRef.current = next;
      setDraft(next);
      setEditEvent(null);
      setParsing(false);
      setError('');
    }
  }, [view, ready]);
  async function cancelReview() {
    setError('');
    await updateDraft({ ...draftRef.current, mode: 'write', queued: false });
    navigate('compose', { replace: true, direction: 'back' });
    requestAnimationFrame(() => composer.current?.focus());
  }
  function attemptSnapshot(current) {
    return {
      text: current.parsedText || current.text,
      originalEvents: current.originalEvents,
      events: current.events,
      reviewEdits: current.reviewEdits || [],
      parserVersion: current.parserVersion,
    };
  }
  function changeSource(text) {
    const current = draftRef.current;
    const discarded = current.events && current.originalEvents !== null && text !== current.text;
    updateDraft({
      ...current,
      text,
      mode: 'write',
      queued: false,
      ...(discarded
        ? {
            parseAttempts: [...(current.parseAttempts || []), attemptSnapshot(current)],
            ...manualState(current),
            originalEvents: null,
            parserVersion: null,
          }
        : {}),
    });
  }
  function removeReviewEvent(event) {
    updateDraft({
      ...draft,
      events: draft.events.filter((item) => item.id !== event.id),
      reviewEdits: [
        ...(draft.reviewEdits || []),
        { before: event, after: null, at: new Date().toISOString() },
      ],
    });
  }
  async function configure(next) {
    if (next.room !== settingsRef.current.room || next.workerUrl !== settingsRef.current.workerUrl)
      await resetSyncCursor();
    saveSettings(next);
    settingsRef.current = next;
    setSettingsState(next);
  }
  useEffect(() => {
    (async () => {
      try {
        if (location.hash.startsWith('#connect=')) {
          const link = JSON.parse(decodeURIComponent(location.hash.slice(9)));
          const url = new URL(link.workerUrl);
          if (!/^[a-f0-9-]{36}$/.test(link.room) || !['https:', 'http:'].includes(url.protocol))
            throw new Error('Invalid device link.');
          await configure({ ...settingsRef.current, ...link });
          history.replaceState(null, '', location.pathname + location.search + '#journal');
          notify('Device linked. Your entries will sync here.');
        }
        await refresh();
        const existing = await getDrafts(),
          active = await getMeta('activeDraft');
        const restored = existing.find((d) => d.id === active) || existing.find((d) => d.text);
        if (restored) {
          setDraft(restored);
          draftRef.current = restored;
          setDate(restored.date);
        }
        setReady(true);
      } catch (e) {
        setError(e.message);
        setReady(true);
      }
    })();
    return () => clearTimeout(noticeTimer.current);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const client = new SyncClient(
      () => settingsRef.current,
      (status, err) => {
        setSyncStatus(status);
        setSyncError(err || '');
      },
      refresh,
    );
    sync.current = client;
    client.start();
    return () => client.stop();
  }, [ready, settings.room, settings.workerUrl]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        processQueue();
      },
      off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    if (ready && navigator.onLine) processQueue();
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, [ready]);
  async function processQueue() {
    if (queueRunning.current) return;
    queueRunning.current = true;
    try {
      const waiting = (await getDrafts()).filter((d) => d.queued);
      for (const queued of waiting) {
        try {
          const result = await parseJournalEntry({
            text: queued.text,
            date: queued.date,
            referenceTime: queued.referenceTime,
            timezone: queued.timezone,
            memories: (await getRecords()).filter((r) => r.kind === 'memory'),
            settings: settingsRef.current,
          });
          const latest = (await getDrafts()).find((d) => d.id === queued.id);
          if (
            !latest ||
            latest.text !== queued.text ||
            latest.date !== queued.date ||
            !latest.queued
          )
            continue;
          const next = {
            ...latest,
            ...replaceParsedEvents(latest, result),
            parsedText: latest.text,
            mode: 'review',
            queued: false,
          };
          await saveDraft(next);
          if (draftRef.current.id === next.id) {
            draftRef.current = next;
            setDraft(next);
          }
          notify('An offline entry is ready to review.');
        } catch (e) {
          notify('An offline entry is still waiting. Open it to retry parsing.');
        }
      }
      await refresh();
    } catch {
      notify('Could not open saved drafts on this device.');
    } finally {
      queueRunning.current = false;
    }
  }
  async function parse() {
    const current = {
      ...draftRef.current,
      referenceTime: draftRef.current.referenceTime || localTime(),
      timezone: draftRef.current.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (!current.text.trim() || parsing) return;
    if (demo) {
      notify('Exit the sample journal to log your own entry.');
      return;
    }
    if (!navigator.onLine && current.entryId) {
      setError('Reconnect to re-parse. Changes have not been saved.');
      return;
    }
    if (!navigator.onLine) {
      await updateDraft({ ...current, queued: true });
      notify('Saved offline. It will be parsed when you reconnect.');
      return;
    }
    setParsing(true);
    setError('');
    try {
      await updateDraft(current);
      const result = await parseJournalEntry({
        text: current.text,
        date: current.date,
        referenceTime: current.referenceTime,
        timezone: current.timezone,
        memories,
        settings,
      });
      if (
        draftRef.current.id !== current.id ||
        draftRef.current.text !== current.text ||
        draftRef.current.date !== current.date
      )
        return;
      await updateDraft({
        ...current,
        ...replaceParsedEvents(current, result),
        parsedText: current.text,
        parseAttempts: current.events
          ? [...(current.parseAttempts || []), attemptSnapshot(current)]
          : current.parseAttempts || [],
        mode: 'review',
        queued: false,
      });
      if (viewRef.current === 'compose') navigate('review');
    } catch (e) {
      if (draftRef.current.id !== current.id) return;
      setError(
        e.name === 'TimeoutError'
          ? current.entryId
            ? 'Parsing took too long. Changes have not been saved; try again.'
            : 'Parsing took too long. Your draft is saved; try again.'
          : e.message,
      );
    } finally {
      if (draftRef.current.id === current.id) setParsing(false);
    }
  }
  async function accept() {
    if (saving || demo) return;
    setSaving(true);
    setError('');
    try {
      const previous = records.find((r) => r.id === draft.entryId && !r.deleted);
      const entry = acceptReview(draft, previous);
      const newMemories = Object.entries(draft.remember || {})
        .filter(([id]) => draft.events.some((e) => e.id === id))
        .map(([, data]) => {
          const old = memories.find(
            (m) =>
              normalizePhrase(m.data.alias) === normalizePhrase(data.alias) &&
              m.data.type === data.type,
          );
          return { id: old?.id || uid(), kind: 'memory', data, deleted: false };
        });
      await saveRecords([entry, ...newMemories]);
      await deleteDraft(draft.id);
      const next = freshDraft(date);
      await updateDraft(next);
      await refresh();
      sync.current?.sync();
      navigate(previous ? 'entry' : 'journal', {
        entryId: previous?.id,
        replace: true,
        direction: 'back',
      });
      notify(previous ? 'Entry updated.' : 'Entry saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  function openEntry(id) {
    setSelectedId(id);
    navigate('entry', { entryId: id });
  }
  async function editEntry(id) {
    if (demo) return;
    const record = records.find((r) => r.id === id && !r.deleted);
    if (!record) return;
    await updateDraft({
      ...freshDraft(record.data.date),
      entryId: id,
      referenceTime: record.data.referenceTime || record.data.events[0]?.time,
      timezone: record.data.timezone,
      text: record.data.text,
      events: structuredClone(record.data.events),
      originalEvents: structuredClone(record.data.originalEvents || record.data.events),
      parserVersion: record.data.parserVersion,
      mode: 'review',
    });
    setDate(record.data.date);
    navigate('review', { entryId: id });
  }
  async function removeEntry(id) {
    if (!confirm('Delete this journal entry and its accepted events?')) return;
    const record = records.find((r) => r.id === id);
    await saveRecords([{ ...record, deleted: true }]);
    for (const item of drafts.filter((d) => d.entryId === id)) await deleteDraft(item.id);
    draftRef.current = freshDraft(date);
    setDraft(draftRef.current);
    navigate('journal', { replace: true, direction: 'back' });
    await refresh();
    sync.current?.sync();
    notify('Entry deleted.');
  }
  function addManual() {
    const event = {
      id: uid(),
      type: 'subjective',
      title: '',
      origin: 'manual',
      sourceText: '',
      date: draft.date,
      time: localTime(),
      data: blankData(),
    };
    setEditEvent({ event, isNew: true });
    navigate('details');
  }
  async function saveEvent(event, memory) {
    const current = draftRef.current;
    const list = current.events || [];
    const nextEvents = list.some((e) => e.id === event.id)
      ? list.map((e) => (e.id === event.id ? event : e))
      : [...list, event];
    const remembered = { ...current.remember };
    if (memory) remembered[event.id] = memory;
    else delete remembered[event.id];
    await updateDraft({
      ...current,
      text: current.text || event.title,
      events: nextEvents,
      originalEvents: current.originalEvents || [],
      parserVersion: current.parserVersion || 'manual-v1',
      mode: 'review',
      remember: remembered,
      reviewEdits: [
        ...(current.reviewEdits || []),
        {
          before: list.find((item) => item.id === event.id) || null,
          after: event,
          at: new Date().toISOString(),
        },
      ],
    });
    navigate('review', { replace: true, direction: 'back' });
    setEditEvent(null);
  }
  async function exportBackup() {
    const value = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      records: demo || (await getRecords()),
      drafts: demo ? [] : await getDrafts(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `n-of-one-${localDate()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file) {
    if (file.size > 25000000) throw new Error('This backup is too large (maximum 25 MB).');
    const backup = validateBackup(JSON.parse(await file.text()));
    await saveRecords(backup.records);
    for (const item of backup.drafts || [])
      if (item.id && typeof item.text === 'string') await saveDraft(item);
    await refresh();
    sync.current?.sync();
    notify('Backup imported.');
  }
  const dateLabel =
    date === localDate()
      ? 'Today'
      : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
  const dayEntries = activeRecords
    .filter((r) => r.kind === 'entry' && !r.deleted && r.data.date === date)
    .sort((a, b) => (b.data.acceptedAt || '').localeCompare(a.data.acceptedAt || ''));
  const savedDrafts = demo ? [] : drafts.filter((item) => item.text || item.events?.length);
  function openDraft(item) {
    updateDraft(item);
    setDate(item.date);
    navigate(item.mode === 'review' && item.events ? 'review' : 'compose');
  }
  const status = !online
    ? 'Offline'
    : syncStatus === 'synced'
      ? 'Synced'
      : syncStatus === 'syncing'
        ? 'Syncing'
        : syncStatus === 'error'
          ? 'Sync paused'
          : 'Local';
  const dateControl = (
    <DatePicker
      date={date}
      step={view === 'week' ? 7 : 1}
      label={
        view === 'week'
          ? `${new Date(`${startOfWeek(date)}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${addDays(startOfWeek(date), 6)}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : undefined
      }
      onChange={(next) => {
        setDate(next);
        if (view === 'compose') updateDraft({ ...draft, date: next });
      }}
    />
  );
  return (
    <div class={`app-shell ${isRoot ? 'root-screen' : 'task-screen'}`}>
      <main class="screen" key={view}>
        {isRoot ? (
          <>
            <header class="nav-bar">
              <a
                class="brand-word"
                href="#journal"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('journal', { direction: 'tab' });
                }}
              >
                n <i>of</i> one
              </a>
              <div class="nav-tools">
                <span
                  class={`connection ${syncStatus === 'error' ? 'warning' : ''}`}
                  title={syncError || 'Saved on this device'}
                >
                  <span class="status-dot" />
                  {status}
                </span>
                <IconButton icon="settings" label="Settings" onClick={() => navigate('settings')} />
              </div>
            </header>
            <div class="page-heading">
              <h1 tabIndex="-1">{names[view]}</h1>
              {view === 'journal' && (
                <IconButton
                  icon="plus"
                  label="New entry"
                  disabled={Boolean(demo)}
                  onClick={newEntry}
                />
              )}
            </div>
            <div class="date-row">{dateControl}</div>
          </>
        ) : (
          (view === 'compose' || view === 'review') && (
            <header class="nav-bar task-nav">
              <button
                class="text-button"
                disabled={saving}
                onClick={() =>
                  draft.entryId
                    ? discardEditing()
                    : view === 'review'
                      ? cancelReview()
                      : back('journal')
                }
              >
                <Icon name="left" size={20} />
                {draft.entryId || view === 'review' ? 'Cancel' : 'Journal'}
              </button>
              <h1 tabIndex="-1">
                {draft.entryId ? 'Edit entry' : view === 'review' ? 'Review' : 'New entry'}
              </h1>
              <span class="nav-spacer" />
            </header>
          )
        )}
        {demo && isRoot && (
          <div class="demo-banner">
            <span>Sample data</span>
            <button onClick={() => setDemo(null)}>
              Exit <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {updateAvailable && isRoot && (
          <div class="update-banner">
            <span>Update available</span>
            <button onClick={() => updateServiceWorker(true)}>Update</button>
          </div>
        )}
        {!ready ? (
          <div class="loading-state">
            <Icon name="loading" class="spin" />
            Opening journal…
          </div>
        ) : (
          <>
            {error && (
              <div class="error-banner" role="alert">
                <span>{error}</span>
                <IconButton icon="close" label="Dismiss error" onClick={() => setError('')} />
              </div>
            )}
            {view === 'journal' && (
              <div class="journal-list">
                {savedDrafts.length > 0 && (
                  <section class="drafts-section">
                    <SectionTitle aside={savedDrafts.length}>Drafts</SectionTitle>
                    <div class="grouped-list">
                      {savedDrafts.map((item) => (
                        <div class="draft-row" key={item.id}>
                          <button onClick={() => openDraft(item)}>
                            <span class="list-icon">
                              <Icon name="edit" />
                            </span>
                            <span class="row-copy">
                              <strong>{item.text.split('\n')[0] || 'Manual entry'}</strong>
                              <small>
                                {item.queued
                                  ? 'Waiting to parse'
                                  : item.mode === 'review'
                                    ? 'Ready to review'
                                    : 'Draft'}{' '}
                                ·{' '}
                                {new Date(`${item.date}T12:00`).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </small>
                            </span>
                            <Icon name="next" size={16} />
                          </button>
                          <IconButton
                            icon="delete"
                            label="Delete draft"
                            onClick={async () => {
                              if (confirm('Discard this draft?')) {
                                await deleteDraft(item.id);
                                if (item.id === draft.id) {
                                  const next = freshDraft(date);
                                  draftRef.current = next;
                                  setDraft(next);
                                }
                                await refresh();
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <section>
                  <SectionTitle
                    aside={`${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}`}
                  >
                    {dateLabel}
                  </SectionTitle>
                  {dayEntries.length ? (
                    <div class="grouped-list">
                      {dayEntries.map((record) => (
                        <button
                          key={record.id}
                          class="accepted-entry"
                          onClick={() => openEntry(record.id)}
                        >
                          <span class="row-copy">
                            <strong>{record.data.text.split('\n')[0]}</strong>
                            <span class="entry-preview">
                              {record.data.text.split('\n').slice(1).join(' · ')}
                            </span>
                            <small>
                              {record.data.events.length}{' '}
                              {record.data.events.length === 1 ? 'event' : 'events'}
                            </small>
                          </span>
                          <Icon name="next" size={16} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty icon="journal" title="No entries" />
                  )}
                </section>
              </div>
            )}
            {view === 'entry' && (
              <>
                <header class="nav-bar task-nav">
                  <button
                    class="text-button"
                    onClick={() => navigate('journal', { replace: true, direction: 'back' })}
                  >
                    <Icon name="left" size={20} />
                    Journal
                  </button>
                  <h1 tabIndex="-1">Entry</h1>
                  {viewedEntry && (
                    <button
                      class="text-button"
                      disabled={Boolean(demo)}
                      onClick={() => editEntry(viewedEntry.id)}
                    >
                      Edit
                    </button>
                  )}
                </header>
                {viewedEntry ? (
                  <div class="entry-screen">
                    <section class="review-source">
                      <pre>{viewedEntry.data.text}</pre>
                    </section>
                    <SectionTitle aside={viewedEntry.data.events.length}>Events</SectionTitle>
                    <div class="review-cards">
                      {viewedEntry.data.events.map((event) => (
                        <EventCard key={event.id} event={event} expandable />
                      ))}
                    </div>
                    {!demo && (
                      <button
                        class="text-button danger delete-entry"
                        onClick={() => removeEntry(viewedEntry.id)}
                      >
                        Delete entry
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty title="Entry unavailable" />
                )}
              </>
            )}
            {view === 'compose' && (
              <div class="capture-screen">
                <div class="capture-meta">
                  {dateControl}
                  <span class="draft-status" role="status">
                    {parsing
                      ? 'Reading…'
                      : draft.entryId
                        ? ''
                        : draft.queued
                          ? 'Queued'
                          : draft.text
                            ? 'Draft'
                            : ''}
                  </span>
                </div>
                <textarea
                  ref={composer}
                  class="journal-input"
                  aria-label="Journal entry"
                  spellCheck
                  placeholder="Write an entry…"
                  value={draft.text}
                  disabled={parsing || Boolean(demo)}
                  onInput={(e) => changeSource(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      parse();
                    }
                  }}
                />
                <div class="capture-bottom">
                  <button
                    class="text-button muted"
                    onClick={addManual}
                    disabled={parsing || Boolean(demo)}
                  >
                    Manual entry
                  </button>
                  <button
                    class="button primary"
                    disabled={!draft.text.trim() || parsing || Boolean(demo)}
                    onClick={parse}
                  >
                    {parsing && <Icon name="loading" class="spin" size={18} />}
                    {parsing ? 'Reading…' : draft.entryId ? 'Re-parse' : 'Submit'}
                    <Icon name="right" size={18} />
                  </button>
                </div>
              </div>
            )}
            {view === 'review' &&
              (review ? (
                <div class="review-screen">
                  <section class="review-source">
                    <div class="review-source-head">
                      <span class="eyebrow">Source</span>
                      <IconButton
                        icon="edit"
                        label="Edit source text"
                        disabled={saving}
                        onClick={cancelReview}
                      />
                    </div>
                    <pre>{draft.text}</pre>
                  </section>
                  <SectionTitle aside={draft.events.length}>Events</SectionTitle>
                  <div class="review-cards">
                    {draft.events.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        remembered={Boolean(draft.remember?.[event.id])}
                        onEdit={() => {
                          setEditEvent({ event });
                          navigate('details');
                        }}
                        onDelete={() => removeReviewEvent(event)}
                      />
                    ))}
                  </div>
                  <button class="text-button add-event" onClick={addManual}>
                    <Icon name="plus" size={18} />
                    Add event
                  </button>
                  <div class="review-bottom">
                    <button
                      class="button primary"
                      disabled={saving || !draft.events.length || Boolean(demo)}
                      onClick={accept}
                    >
                      {saving ? <Icon name="loading" class="spin" /> : <Icon name="check" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div class="empty">
                  <button class="button secondary" onClick={cancelReview}>
                    Back to entry
                  </button>
                </div>
              ))}
            {view === 'today' && <DaySummary events={events} date={date} />}
            {view === 'week' && <WeekView events={events} date={date} />}
            {view === 'body' && <BodyView events={events} date={date} />}
            {view === 'details' && !editEvent && (
              <div class="empty">
                <button
                  class="button secondary"
                  onClick={() => navigate(draft.events ? 'review' : 'compose', { replace: true })}
                >
                  Back to entry
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {isRoot && (
        <nav class="mobile-nav" aria-label="Main navigation">
          {tabs.map((tab) => (
            <a
              key={tab}
              class={view === tab ? 'active' : ''}
              aria-current={view === tab ? 'page' : undefined}
              href={`#${tab}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(tab, { direction: 'tab' });
              }}
            >
              <Icon name={tab} size={23} />
              <span>{names[tab]}</span>
            </a>
          ))}
        </nav>
      )}
      {notice && (
        <div class="toast" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <IconButton icon="close" label="Dismiss notification" onClick={() => setNotice('')} />
        </div>
      )}
      {view === 'details' && editEvent && (
        <EventEditor
          key={editEvent.event.id}
          event={editEvent.event}
          memory={draft.remember?.[editEvent.event.id]}
          onSave={saveEvent}
          onClose={() => back(draft.events ? 'review' : 'compose')}
        />
      )}
      {view === 'settings' && (
        <SettingsPanel
          settings={settings}
          memories={memories}
          onSettings={configure}
          onClose={() => back('journal')}
          onExport={exportBackup}
          onImport={importBackup}
          isDemo={Boolean(demo)}
          onDeleteMemory={async (memory) => {
            if (demo) return;
            await saveRecords([{ ...memory, deleted: true }]);
            await refresh();
            sync.current?.sync();
          }}
          onDemo={() => {
            setDemo(demo ? null : sampleRecords());
            navigate('journal', { replace: true, direction: 'back' });
          }}
        />
      )}
    </div>
  );
}
render(<App />, document.getElementById('app'));
