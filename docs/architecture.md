# First implementation

## Agreed choices

- Strictly personal; no accounts or login UI.
- Preact and JavaScript, JSX through Vite, plain CSS.
- Mobile-only PWA with the same phone-width interface on larger screens.
- Static frontend on GitHub Pages. Cloudflare Worker for parsing and sync.
- IndexedDB for entries/drafts; localStorage for device configuration.
- Durable Object for sync, adapting Commonplace's device-link pattern. No D1 needed.
- Commonplace's configured LLM setup: OpenAI Chat Completions, `gpt-5.4-nano`.
- Corrections apply only to the entry unless the user explicitly chooses “remember this”.
- The mock is an aesthetic reference: charcoal surfaces, thin borders, quiet charts, restrained mint accents. Numerical summaries replace rings; exercise remains minutes by modality.

## Data flow

Journal text → local draft → Worker structured output → shared validation → review → accept → IndexedDB → per-record sync.

All eight event types use a small common envelope with local `date` and `time`, source text, and typed fields in `data`. Local calendar dates are preserved independently of the viewer's timezone. Acceptance adds the event instant (`timestamp`), entry ID, and stable event IDs. Bed/wake events are paired across dates; lone timestamps remain unknown duration.

Each accepted journal record contains raw text, the parser's original events, current accepted events, parser version, corrections, and previous accepted revisions. Editing and reaccepting writes the same record ID, replacing its current event list. Dashboards only read nondeleted accepted records.

Memories are ordinary records containing a phrase, event type, and saved field values. Only matching normalized whole phrases are sent with a parse request. There is no embedding retrieval or automatic rule promotion.

## Persistence and sync

Records: `id`, `kind`, `version`, `deleted`, `data`. Client-only `dirty` tracks pending writes. Drafts stay on the device and are included in backups; accepted entries and memories sync.

Logical versions contain observed wall time, a counter, and the device ID. Each local write advances past observed remote versions. A Durable Object serializes merge transactions into SQLite and assigns a cursor. On sync, the client sends dirty records and its cursor; the server returns newer records and the winning versions of any stale submissions. The client acknowledges only the versions actually sent, retaining edits made while a request was in flight.

Two independent additions merge. Simultaneous edits of one record resolve by logical version. Tombstones prevent stale devices from recreating deleted records. WebSockets only announce changes; the same HTTP sync path handles reconnects and polling.

## Deliberate first-pass boundaries

- Source text, daily/weekly totals, simple trends, and explicit personal presets are implemented.
- Estimates are represented as ranges. Dashboard averages use recorded food days. No causal claims, gamification, or exercise-calorie estimates.
- Fasting is a daily explicit flag, not a duration or inferred absence of meals.
- Sleep duration is inferred only from a plausible bed/wake pair (at most 24 hours), or entered explicitly. Durations and pairing still need human review for unusual schedules.
- No photos, voice upload, wearable integration, semantic retrieval, correlation generation, automatic learning, or shared accounts.
- No server deployment has occurred as part of the local implementation.

## Mobile interface

The app uses a single phone-width layout, including on desktop. Journal, Summary, Week, and Body are the four persistent navigation destinations. Writing, reviewing, editing an event, and settings are separate screens; the tab bar stays out of these focused flows. Weekly trends and body measurements show one selected subject at a time.

Navigation uses browser history, restores scroll on return, and animates with the View Transition API when available. Reduced Motion disables animation. Native date, time, and select controls remain in place. Controls have 44px minimum targets, text inputs are at least 16px, and the layout accommodates device safe areas and dynamic viewport height. Drafts remain local and survive leaving the writing screen; accepting a review is still the only operation that updates journal totals.

Opening an accepted entry shows a read-only source and event list. Edit creates an in-memory working copy; only the entry-level Save commits it. Cancel, leaving the edit flow, or reloading discards unsaved changes. Existing-entry edits never enter draft storage or the offline parse queue. Legacy edit drafts are excluded from draft reads and backups. New entries retain their existing local draft and offline queue behavior.
