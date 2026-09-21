# n of one

A personal diet and exercise journal. Write naturally, review the interpretation, then accept it into your record.

Preact + JavaScript + Vite. IndexedDB on each device. GitHub Pages for the frontend, one Cloudflare Worker for TypeSafe-assisted parsing with an LLM fallback and a SQLite-backed Durable Object for sync. No accounts, separate TypeSafe Worker, ORM, or D1 database.

## Run locally

Requires Node 22.12+ (Node 24 recommended).

```sh
npm ci
cp workers/api/.dev.vars.example workers/api/.dev.vars
# Set OPENAI_API_KEY, and optionally TYPESAFE_API_KEY, in that ignored file.
npm run dev:worker
```

In another terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5178. Vite proxies `/api` to the Worker at port 8787. TypeSafe uses `jev-latest`; the LLM fallback uses the existing `gpt-5.4-nano`. Override `TYPESAFE_MODEL` or `OPENAI_MODEL` in Wrangler if needed. Secrets stay in the Worker. `TYPESAFE_KEY` is also accepted as an alias. Restart Wrangler after changing `.dev.vars` so its bindings reload.

With a TypeSafe key configured, the same `/api/parse` endpoint first selects explicit exercise, hydration, and body-measurement fields from source candidates. A separate TypeSafe check rejects lost details or multiple observations. The LLM receives only unresolved source parts, including food estimates, sleep, fasting, notes, unsupported quantities, uncertainty, and TypeSafe service failures. Results merge back in source order before review. No TypeSafe key means the existing LLM path continues to work; `TYPESAFE_ENABLED="false"` disables the additional stage.

The default TypeSafe selection and verification probability floor is `0.9`, configurable with `TYPESAFE_MIN_PROBABILITY`; choice concentration must also be at least `0.5`. These are experimental routing thresholds, not measured accuracy guarantees. TypeSafe processes at most the first 20 source parts within a five-second total budget; additional parts use the LLM. Generated LLM suggestions never automatically become memories. Only the existing **Remember this** plus entry **Save** commits a preset.

Before calling the Worker, the app reuses simple exercise patterns from accepted journal entries. After saving `20min bike ride` as cardio, `45min bike ride` returns locally with 45 minutes and a **Learned** label, with no TypeSafe or LLM request. Existing accepted entries work immediately; **Remember this** is not required. Matching keeps the wording fixed and substitutes one explicit duration (including equivalent hour/minute units). New wording, extra details, multiple quantities, or an uncertain source-to-event relationship still need interpretation. Only saved entries teach this path; the latest accepted correction applies, and deleted records are excluded. Simple explicit exercise presets can override the learned category; richer or conflicting presets use the model.

## Using the app

- Journal accepts multiline or semicolon-separated entries with optional `HHMM` or `HH:MM` timestamps. Later parts of the same line inherit its most recent explicit time; durations do not advance the clock. Quoted semicolons are preserved. Choose the journal date for retrospective entries.
- Review cards show the proposed events alongside the source. Edit or remove cards, add a manual event, or edit the source and reparse. Only **Save** updates summaries.
- Review cards identify learned patterns, TypeSafe selections and LLM suggestions. Expanded saved events retain the accepted example or provider/model, source grouping, and TypeSafe selection/verification probabilities. Learned results have no invented confidence score. Model scores describe decisions, not overall extraction accuracy.
- Drafts save as you type. Learned exercise patterns work offline. Entries needing fresh interpretation wait for reconnection; capturing, reviewing, accepting, and dashboards work locally.
- Open an accepted entry to edit it. Saving replaces its canonical events and preserves the previous entry in revision history.
- Food and exercise corrections can explicitly **Remember this for next time**. Set the phrase that should trigger the preset. Memory is committed when the entry is accepted and can be deleted in Settings.
- Today shows accepted events chronologically. Week aggregates logged observations; missing food days don't count as zero. Body shows daily readings and a seven-calendar-day moving average.
- Settings includes JSON backup export/import and an isolated sample journal. Sample data is never written to your real records.

## Sync

In Settings, save your Worker URL, then choose **Link another device**. Open the copied link on the other device. The random room identifier acts as the device-link capability; there is no account or login screen. Keep the link to your own devices.

Every journal entry and memory has a stable ID and logical version. The Worker merges records individually, returns changes since the device cursor, and uses WebSockets to notify connected devices. Offline changes retry on reconnect, foregrounding, and a 30-second foreground poll. Deletions are tombstones. Independent entry additions are retained; concurrent edits to the **same entry** use the later logical version. There is no text-level collaborative merge.

The Worker has persistent per-record storage, not one growing snapshot value. Backup exports include entries, parse originals, corrections, revisions, and unfinished drafts. Sync is not a substitute for an exported backup.

## Publish

The repository includes GitHub Actions for Pages and the Worker. No remote deployment is required for local development.

1. Set the deployed frontend origin in `workers/api/wrangler.toml` → `ALLOWED_ORIGINS`.
2. Deploy with `npm run deploy:worker`, and set its secret:
   ```sh
   npx wrangler secret put OPENAI_API_KEY --config workers/api/wrangler.toml
   # Optional TypeSafe stage, on the SAME Worker:
   npx wrangler secret put TYPESAFE_API_KEY --config workers/api/wrangler.toml
   ```
3. Enable GitHub Pages with **GitHub Actions** as the source. Set repository variable `VITE_WORKER_URL` to the deployed Worker URL. `BASE_PATH` is optional; relative assets and hash navigation support a project subpath.
4. For Worker CI, set repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then set repository variable `CLOUDFLARE_CI_ENABLED=true`. Otherwise deploy the Worker locally with `npm run deploy:worker`.

The parsing endpoint follows Commonplace's account-free model. CORS restricts browser origins; it does not authenticate API callers. The frontend contains no LLM API key. Service worker caches cover only the app shell and bundled fonts, not API requests. A new app version prompts before activation so it doesn't unexpectedly interrupt an entry.

## Check

```sh
npm run check
# With the local Worker running:
node tests/worker-integration.mjs
# Explicit opt-in: sends fictional fixtures to TypeSafe/OpenAI through localhost;
# needs both keys, consumes API tokens, and saves no entries or memories.
npm run test:parser:live
```

Domain tests cover acceptance/revisions, offline record merging, deletion conflicts, time handling, uncertainty, missing observations, memory lookup, and parser failure handling. The Worker integration test sends only fictional software-marker records to localhost.

Architecture and scope are recorded in [docs/architecture.md](docs/architecture.md). Product requirements and the aesthetic reference are in `docs/prd.md` and `docs/mock.png`.

## Test deployment

- Frontend: https://emh.io/n1/
- API: https://n-of-one-api.emh.workers.dev
- Frontend deploys automatically from `main`. Worker deployment currently uses local Wrangler authentication.
