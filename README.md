# n of one

A personal diet and exercise journal. Write naturally, review the interpretation, then accept it into your record.

Preact + JavaScript + Vite. IndexedDB on each device. GitHub Pages for the frontend, one Cloudflare Worker for LLM parsing and a SQLite-backed Durable Object for sync. No accounts, application server, ORM, or D1 database.

## Run locally

Requires Node 22.12+ (Node 24 recommended).

```sh
npm ci
cp workers/api/.dev.vars.example workers/api/.dev.vars
# Set OPENAI_API_KEY in that ignored file.
npm run dev:worker
```

In another terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5178. Vite proxies `/api` to the Worker at port 8787. The configured model is `gpt-5.4-nano`, matching Commonplace's Worker configuration. Override `OPENAI_MODEL` in Wrangler if needed. Secrets stay in the Worker.

## Using the app

- Journal accepts multiline entries with optional `HHMM` or `HH:MM` timestamps. Choose the journal date for retrospective entries.
- Review cards show the proposed events alongside the source. Edit or remove cards, add a manual event, or edit the source and reparse. Only **Accept & save** updates summaries.
- Drafts save as you type. Offline parsing requests wait for reconnection. Parsing requires the Worker and an internet connection; capturing, reviewing, accepting, and dashboards work locally.
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
   ```
3. Enable GitHub Pages with **GitHub Actions** as the source. Set repository variable `VITE_WORKER_URL` to the deployed Worker URL. `BASE_PATH` is optional; relative assets and hash navigation support a project subpath.
4. For Worker CI, set repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

The parsing endpoint follows Commonplace's account-free model. CORS restricts browser origins; it does not authenticate API callers. The frontend contains no LLM API key. Service worker caches cover only the app shell and bundled fonts, not API requests. A new app version prompts before activation so it doesn't unexpectedly interrupt an entry.

## Check

```sh
npm run check
# With the local Worker running:
node tests/worker-integration.mjs
```

Domain tests cover acceptance/revisions, offline record merging, deletion conflicts, time handling, uncertainty, missing observations, memory lookup, and parser failure handling. The Worker integration test sends only fictional software-marker records to localhost.

Architecture and scope are recorded in [docs/architecture.md](docs/architecture.md). Product requirements and the aesthetic reference are in `docs/prd.md` and `docs/mock.png`.
