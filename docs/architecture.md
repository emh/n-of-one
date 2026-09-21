# First implementation

## Agreed choices

- Strictly personal; no accounts or login UI.
- Preact and JavaScript, JSX through Vite, plain CSS.
- Mobile-only PWA with the same phone-width interface on larger screens.
- Static frontend on GitHub Pages. Cloudflare Worker for parsing and sync.
- IndexedDB for entries/drafts; localStorage for device configuration.
- Durable Object for sync, adapting Commonplace's device-link pattern. No D1 needed.
- Commonplace's configured LLM setup: OpenAI Chat Completions, `gpt-5.4-nano`.
- Accepted simple exercise corrections also inform matching future duration patterns. Broader food and exercise preferences use **Remember this**.
- The current visual reference is `docs/japandi.png`: warm paper surfaces, dark serif headings, fine borders, olive graphics, and clay controls. Numerical summaries replace rings; exercise remains minutes by modality.

## Data flow

Journal text → local draft → source segmentation → reuse accepted exercise patterns locally → existing Worker `/api/parse` for unresolved parts → TypeSafe selection and verification → LLM for remaining parts → shared validation → review → accept → IndexedDB → per-record sync.

`shared/learned-parser.js` derives duration templates from current, nondeleted accepted journal records. A template requires a single explicit duration, exactly one source-matched exercise event, the same accepted quantity, and no additional structured values or inferred notes. The wording around the duration must match exactly after case/whitespace normalization. A fresh duration and the current app-owned date/time replace the old values. The latest accepted interpretation wins; ambiguous or non-exercise corrections disable reuse for that pattern. Explicit simple exercise presets take precedence, while richer or conflicting presets force fresh interpretation. No additional database or model training is involved: normal journal sync brings examples to each device, and editing/deleting source records takes effect on the next parse.

Fully learned submissions make zero network requests and work offline. Mixed submissions send only unresolved source text to the Worker, with source IDs and original compound provenance restored locally on return. A failure in any unresolved part prevents a partial successful review. Learned events retain the example entry/event IDs and source text, use a distinct **Learned** badge, and do not claim model confidence. Drafts and unaccepted AI suggestions never teach this path.

TypeSafe lives in `workers/api/src/typesafe.js`, within the existing parsing/sync Worker. There is no new service, Durable Object, storage table, or endpoint. Its key is a server-side secret. Without the key (or with `TYPESAFE_ENABLED=false`), all source parts use the original LLM parser. The LLM model and strict application schema remain unchanged.

The first TypeSafe stage handles explicit exercise duration/modality, drinking-water volume, and body weight/fat. Code enumerates and normalizes source quantities; independent Choice questions choose their roles and categories. A second request verifies proposed events against the source and applicable user presets. Any unsupported type, uncertainty, missing candidate, lost qualifier, compound observation, malformed answer, or provider failure routes the complete affected source part to the LLM. Existing high-confidence events are not regenerated. The Worker rejects LLM responses that omit unresolved source parts or reference an already-resolved source ID.

Routing uses selected-option probability (default 0.9), minimum choice confidence (0.5), and verification probability (default 0.9); these starting thresholds require evaluation on real use. At most 20 source parts enter TypeSafe per parse, within a five-second aggregate time budget. Extra parts go straight to the LLM. The LLM has a 50-second timeout within the client's existing 60-second request window. Diagnostics record provider routes, token counts, models, and elapsed time without credentials. Per-event provenance and original parser output survive review and acceptance.

Semicolons outside double quotes split explicit source parts. A later part inherits the previous explicit time on that same line; a new explicit time overrides it. Dates remain app-owned, durations never imply a subsequent start time, and each compound part retains the original line and its part index. The LLM still handles compound language without explicit delimiters.

All eight event types use a small common envelope with local `date` and `time`, source text, and typed fields in `data`. Local calendar dates are preserved independently of the viewer's timezone. Acceptance adds the event instant (`timestamp`), entry ID, and stable event IDs. Bed/wake events are paired across dates; lone timestamps remain unknown duration.

Each accepted journal record contains raw text, the parser's original events, current accepted events, parser version, corrections, and previous accepted revisions. Editing and reaccepting writes the same record ID, replacing its current event list. Dashboards only read nondeleted accepted records.

Memories are ordinary records containing a phrase, event type, and saved field values. Only matching normalized whole phrases are sent with a parse request. There is no embedding retrieval; reuse of accepted duration patterns is derived locally and separate from explicit memory records.

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

The Japandi visual system uses ivory (#f3eee5), dark ink (#302d26), olive (#656b4e), and clay (#89684c). Serif headings and journal text pair with system sans-serif form controls and supporting labels. Botanical illustrations, category icons, and paper grain are lightweight local SVGs; no external image or font requests are required. Home-screen icons and browser theme colors follow the same palette.
