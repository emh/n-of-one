# Fieldnotes — TypeSafe journal lab

A standalone, local-only experiment. Write natural-language journal entries on the left, inspect their JSON on the right, and click an entry to teach your desired translation. This folder does not import or modify the main n-of-one app.

## Run

Node 22.12+ (Node 24 recommended):

```sh
cd experiments/journal-lab
npm install
npm run dev
```

Open **http://127.0.0.1:5191**. A single Vite process serves the interface and the local API. No deployment is needed or configured. `npm run preview` also includes the local API after a build; opening the generated HTML directly does not.

Zero-example capture and exact correction reuse work without credentials. For semantic generalization, click **Connect TypeSafe** and enter a key (kept in server memory until restart), or copy `.env.example` to `.env`, set `TYPESAFE_API_KEY` (or `TYPESAFE_KEY`), and restart. The default model is `jev-latest`; `TYPESAFE_MODEL` can override it. Secrets stay server-side.

## Try the experiment

1. Enter `12:30 Ran 5 km in 30 minutes` and click **Interpret journal**. With zero examples, it becomes a timestamped source record with `data: {}`. No inference call is made.
2. Click the result and teach this JSON:

   ```json
   { "activity": "run", "distance_km": 5, "duration_minutes": 30 }
   ```

3. With TypeSafe connected, change the input to `18:00 Went running for 8 km over 45 minutes` and interpret again. Jev selects the taught structure, then chooses each field from candidate values. Check the result against the expected `8` km and `45` minutes; model behavior is experimental, not guaranteed.
4. Try an unrelated entry, a missing quantity, a negated activity, or a different unit. Inspect match probability, confidence, individual fields, and the actual API requests/responses.
5. Add more corrections, edit or remove examples in **Example library**, or **Start from zero** to reset learning. Export/import examples to move them between browsers. Example imports merge by source text; imported corrections replace the same source's translation.

New lines and semicolons separate records. A leading `07:30`, `0730`, `7 am`, or `7:30 pm` is recognized. Later parts on the same line inherit the most recent explicit time, with `timestamp_basis: "inherited_time"` and a reference to the part supplying that time. Durations do not advance timestamps. Otherwise the record uses the capture clock time on the selected journal date. Source text, line number, offsets, capture time, and timestamp basis are retained. Compound entries also retain the complete original line, its offsets, and each part's position. The selected date's midday browser timezone offset is used for all entries that day; entries around a daylight-saving transition may need manual interpretation. Relative dates embedded in prose are not resolved.

For example, `1200 20min warmup; 40min weights` becomes two independently teachable records at `12:00`. Teach the first `{ "exercise_type": "movement", "duration_minutes": 20 }` and the second `{ "exercise_type": "strength", "duration_minutes": 40 }`. New quantities and wording can then use those examples. These labels are user-taught, not seeded defaults. Use `1200 20min warmup; 1220 40min weights` when you want explicit sequential start times. Semicolons inside straight or curly double quotes are preserved. Conjunctions like “and” are left intact to avoid splitting a single meal or description; semantic boundary selection is a possible future extension.

## What “learning” means

This is **example-conditioned inference**, not model training. The browser starts with zero examples, categories, or domain fields. Corrections supply the structures, types, and labels that future calls can select. The original text always survives.

- An exact source match (case/whitespace insensitive) reuses your correction locally, with no model score.
- For other entries, a batched TypeSafe **Choice** request selects a taught example or `none` for each entry.
- A second stage batches field-selection questions. Code finds numbers, simple number words, and text spans in the new source; learned string labels are also available. Jev selects candidates; code assembles the JSON.
- Low-probability matches stay unstructured. Unknown or low-probability fields become `null`. No old numeric values are silently copied from the example.
- The default 70% selection-probability threshold is an experiment setting, not an empirically calibrated guarantee. Choice confidence is distribution concentration, not the probability that the whole translation is correct.
- Provider failures preserve source text, known corrections, and explicit error details. No mock inference is presented as live AI.

The implementation follows TypeSafe's [HTTP API](https://docs.typesafe.ai/api), [Choice](https://docs.typesafe.ai/primitives/choice), [state](https://docs.typesafe.ai/concepts/state), [confidence](https://docs.typesafe.ai/confidence), and [candidate-selection extraction cookbook](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook).

## Deliberate limits

- Up to 20 entries per submission (including semicolon-separated parts), 1,200 characters per line, 12,000 total characters, 60 examples, and 24 scalar fields per example.
- Arbitrary JSON objects and nested objects are supported. Arrays retain the taught shape and length; new fields and variable-length arrays require another correction. An example with a `null` leaf does not establish that field's type.
- Numeric candidates are source digits and simple number words (zero through twelve and half). No unit conversion, arithmetic, nutrition estimates, or inferred quantities.
- Text candidates include learned labels, quoted phrases, the whole content, and contiguous spans of up to six words. Choices are capped at 240 candidates plus `unknown`; truncation appears in field metadata. Candidate coverage limits recall.
- Many examples or fields increase API input and call costs. Field questions are batched in groups of 32. The UI exposes actual call count, token usage, elapsed time, and requests/responses.
- Persistence is browser-local (`typesafe-journal-lab:v1`), with the current draft, latest result, and examples. No sync or separate journal history. Use the same host/port to retain the same browser storage.
- When connected, the new entries and teaching examples are sent to TypeSafe. A connection check makes one small API call. There is no telemetry or remote database in this app.

## Verify

```sh
npm run check
```

Tests cover timestamp/source preservation, zero-example behavior, correction reuse, changed source quantities, nested schemas, batching, no-match/low-probability fallback, API failures, unsafe JSON, bounded candidates, malformed responses, and the HTTP contract. Model responses in automated tests are deterministic fixtures; they validate the application workflow, **not Jev's semantic accuracy**. A real API key is required to evaluate that accuracy on your own examples.

For an explicit live evaluation using six fictional fixtures plus a compound exercise scenario and your configured key:

```sh
npm run test:live
```

This command sends the fixtures to TypeSafe, uses API tokens, and prints the expected/actual values and real probabilities. It never adds examples to your browser. A live run on September 20, 2026 with `jev-1.13.0` passed all six cases: changed quantities/wording, unrelated text, missing quantities, a negated run, bounded number-word extraction, and a miles-versus-kilometres mismatch. The compound case also passed: examples for a 15-minute warmup and 30-minute weights session generalized to `1200 20min warmup; 40min weights` as movement/20 and strength/40. A browser test verified separate correction cards, inherited timestamps, and teaching both translations. These are smoke checks of a small fixture set, not a general accuracy estimate.
