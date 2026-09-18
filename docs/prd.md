# Diet & Exercise Journal — Product Requirements Document

## 1. Product Summary

A personal mobile-first journal and dashboard for tracking diet, exercise, sleep, hydration, fasting, and body composition with minimal data-entry friction.

The primary interaction is free-form, timestamped journal text such as:

```text
0800 woke up feeling groggy
1000 ate 3 eggs and 2 bacon strips; drank 2L water
1100 20min bike ride
1130 gym workout: 20min warmup, 40min weights
1230 20min bike ride
1300 drank a protein shake with buffalo milk and frozen fruit
```

An AI parser converts each journal entry into structured events. The user reviews the proposed interpretation as rich cards, corrects anything necessary, and accepts the result. Accepted events populate daily and weekly dashboards.

The app should feel like a journal first and a tracker second.

---

## 2. Goals

The primary goal is to understand which behaviours correlate with improvements in body composition without requiring detailed manual tracking.

The app should make it easy to track:

- body weight
- estimated body-fat percentage
- optional waist measurement
- protein intake
- rough calorie intake
- fasting
- exercise minutes by modality
- sleep and subjective wake state
- hydration
- simple subjective notes

The product should prioritize trends, consistency, and relationships between behaviours rather than precise calorie accounting.

---

## 3. Non-Goals

The first version is not intended to be:

- a detailed calorie-counting app
- a workout programming app
- a set/rep/weight tracker
- a medical or diagnostic tool
- a wearable-data replacement
- an exhaustive nutrition database
- a social fitness product

Exercise is intentionally summarized as minutes spent in each modality.

---

## 4. Core Product Principles

### Journal-first input

The user should normally enter data as plain language rather than through forms.

### Human-reviewed structured data

AI output is always provisional until accepted by the user.

### Low precision where precision is not useful

Protein is important and should be estimated reasonably well. Calories may be approximate or expressed as a range.

### Trends over individual measurements

Weight and body-fat readings are noisy. The product should emphasize moving averages and longer-term trends rather than individual measurements.

### Learn the user's vocabulary

Corrections should gradually become persistent personal knowledge.

Examples:

```text
walked dog
→ Zone 1
```

```text
protein shake
→ 45g protein
```

### Stable UI, replaceable parser

The journal, review UI, event schema, and dashboards should not depend on a particular AI implementation.

---

## 5. Primary User Flow

### Step 1 — Enter journal text

The main input is a multiline text editor.

Typical entry:

```text
0800 woke up feeling groggy
1000 ate 3 eggs and 2 bacon strips; drank 2L water
1100 20min bike ride
1130 gym workout: 20min warmup, 40min weights
1230 20min bike ride
1300 drank a protein shake with buffalo milk and frozen fruit
```

The timestamp represents the event time rather than the time at which the journal entry was submitted.

Entries may be added retrospectively and do not need to be chronological.

### Step 2 — Parse

The parser converts the text into one or more proposed structured events.

A single line may produce multiple events.

Example:

```text
1000 ate 3 eggs and 2 bacon strips; drank 2L water
```

may produce both:

- food event
- hydration event

### Step 3 — Review cards

The structured interpretation is shown as a set of compact cards.

Example:

```text
EXERCISE

Warmup
20 min

Strength
40 min
```

Food example:

```text
FOOD

3 eggs
~18g protein
~210 kcal

2 bacon strips
~6g protein
~90 kcal
```

The cards should show only the most relevant fields.

### Step 4 — Correct if necessary

The user can correct the parse in either of two ways.

#### Edit structured data

Tap a value to open a purpose-built editor.

Examples:

- change `Zone 2` to `Zone 1`
- change `30g protein` to `45g`
- change `20 min` to `25 min`

#### Edit source

The user may return to the original text, change it, and re-run the parser.

The previous provisional parse is discarded and replaced.

### Step 5 — Accept

Accepted events become canonical data.

The system stores:

- original raw text
- accepted structured events
- parser version
- model confidence if available
- any corrections made during review

---

## 6. Journal Interface

The Journal view is the primary capture surface.

### Requirements

- mobile-first
- fast multiline text entry
- timestamps typed directly into the text
- easy submission
- original text remains visible during review
- support multiple events per submission
- support editing historical entries
- allow current-time entries without an explicit timestamp
- allow insertion of earlier events later in the day

The journal should feel closer to a lightweight terminal/logbook than a traditional health form.

---

## 7. Structured Event Model

The parser should output normalized events behind a stable interface.

### Base event

```js
{
  id,
  journalEntryId,
  timestamp,
  type,
  sourceText,
  confidence
}
```

### Event types

Initial types:

```text
body_composition
food
hydration
exercise
sleep
fasting
subjective
other
```

---

## 8. Body Composition

Body composition is the primary outcome being tracked.

Example input:

```text
0730 weight 220lb @ 24.5% fat
```

Possible event:

```js
{
  type: "body_composition",
  weightLb: 220,
  bodyFatPct: 24.5
}
```

Optional future fields:

```text
waist
lean mass
fat mass
measurement conditions
```

### Dashboard behaviour

Emphasize:

- current weight
- 7-day moving average
- longer-term weight trend
- body-fat trend
- estimated lean-mass trend
- estimated fat-mass trend

Individual readings should remain visible but should not dominate the visualization.

---

## 9. Food and Nutrition

Food logging should remain approximate.

Example:

```text
1000 ate 3 eggs and a can of sardines
```

Possible interpretation:

```text
Protein: ~40g
Calories: ~400–500
```

### Primary metrics

- protein
- estimated calories

Protein should receive greater visual emphasis than calorie estimates.

### Nutrition uncertainty

Estimates should not imply false precision.

Preferred:

```text
~35–45g protein
~400–500 kcal
```

rather than:

```text
413 kcal
```

unless the value comes from a known saved food or recipe.

### Recurring foods

The system should learn recurring foods and meals.

Example correction:

```text
protein shake
30g protein → 45g protein
```

Future entries mentioning the same shake should use the learned value.

---

## 10. Fasting

Fasting should be represented explicitly rather than inferred only from lack of food entries.

Initial fasting types:

```text
water fast
sardine fast
other fast
```

Fasting days should be visually distinguishable in daily and weekly views.

Possible daily indicator:

```text
FAST · SARDINE
```

or:

```text
FAST · WATER
```

The product should make it easy to correlate fasting days with:

- weight changes
- protein intake
- exercise volume
- sleep
- subsequent eating patterns

---

## 11. Exercise

Exercise tracking is intentionally coarse.

The primary metric is:

> minutes per day and per week in each modality

No set, rep, load, pace, or exercise-level tracking is required for the initial product.

### Initial modalities

```text
strength
zone_1
zone_2
running
HIIT
mobility
rope_flow
martial_arts
other
```

The modality system should remain extensible.

### Example

Input:

```text
1130 gym workout: 20min warmup, 40min weights
```

Possible output:

```text
Mobility / warmup    20 min
Strength             40 min
```

Input:

```text
1100 20min bike ride
```

Possible output:

```text
Zone 2               20 min
```

if the user's learned defaults indicate that their normal bike ride should be interpreted that way.

### Weekly summary

Example:

```text
Strength     142m
Zone 2       185m
Zone 1        96m
Mobility      54m
HIIT          18m
Rope flow     32m
```

The dashboard should not attempt to collapse all exercise into calories burned.

---

## 12. Sleep and Subjective State

The journal should support simple sleep events:

```text
2300 went to bed
0730 woke up feeling groggy
```

Possible fields:

```text
bedtime
wake_time
sleep_duration
wake_state
```

Wake-state vocabulary may include:

```text
great
good
normal
tired
groggy
poor
```

Free-text subjective notes should also be preserved.

---

## 13. Hydration

Hydration may be extracted from ordinary journal text.

Example:

```text
drank 2L water
```

Possible event:

```js
{
  type: "hydration",
  volumeMl: 2000
}
```

Hydration should remain secondary in the interface unless later analysis shows it to be useful.

---

## 14. Personal Memory and Learning

The parser should become more accurate as the user corrects it.

Memory should be explicit application data rather than relying solely on conversational LLM memory.

### Example learned activity rule

```text
walked dog
→ Zone 1
```

### Example learned food preset

```text
protein shake
→ 45g protein
→ approximate calorie value
```

### Memory hierarchy

Suggested lookup order:

```text
1. exact alias
2. normalized/fuzzy alias
3. semantic retrieval
4. AI interpretation
```

### Memory record

Possible schema:

```js
{
  id,
  kind,
  canonicalName,
  aliases,
  data,
  embedding,
  confidence,
  createdAt,
  lastUsedAt
}
```

### Correction workflow

When the user changes:

```text
walked dog
Zone 2 → Zone 1
```

the correction should be recorded.

Repeated or high-confidence corrections can become persistent parsing rules.

The user should eventually be able to inspect and delete learned rules.

---

## 15. AI Parsing Architecture

The initial implementation should optimize for simplicity.

### Stage 1

```text
raw journal text
        ↓
personal memory lookup
        ↓
LLM structured output
        ↓
schema validation
        ↓
review cards
```

Use structured model output against a strict application schema.

### Stage 2

A semantic classification layer such as TypeSafe/Jev may be inserted without changing the user interface.

Possible pipeline:

```text
raw journal text
        ↓
deterministic parsing
        ↓
personal memory lookup
        ↓
semantic classification
        ↓
LLM fallback / extraction
        ↓
validation
        ↓
review cards
```

TypeSafe may eventually handle:

- event classification
- activity modality classification
- candidate association
- confidence scoring
- semantic memory reranking
- verification of LLM output

The LLM can remain responsible for open-ended extraction and estimation where necessary.

---

## 16. Parser Contract

The parsing system should expose a stable interface.

Conceptually:

```js
parseJournalEntry({
  text,
  date,
  memories
})
```

returns:

```js
{
  events: [],
  confidence,
  parserVersion
}
```

This contract allows the parsing architecture to evolve independently of the application.

---

## 17. Correction Data as Evaluation Data

Every user correction should be stored.

This creates a naturally generated evaluation dataset:

```text
raw input
original parse
user-corrected parse
accepted result
parser version
```

This dataset can later be used to compare:

```text
LLM parser v1
TypeSafe + LLM parser v2
future local/specialized models
```

Useful evaluation metrics include:

- event classification accuracy
- field accuracy
- correction rate
- percentage of entries accepted unchanged
- percentage requiring LLM fallback
- memory-hit rate

---

## 18. Today View

The Today view should provide a concise overview.

Example:

```text
TODAY

BODY
219.8 lb
24.1% fat

NUTRITION
Protein       ~148g
Calories      ~1,850–2,050

ACTIVITY
Strength       40m
Zone 2         40m
Zone 1         35m
Mobility       20m

SLEEP
7h 32m
Wake: groggy

HYDRATION
2.8 L
```

Below the summary, show the accepted chronological journal timeline.

Fasting status should be prominent when applicable.

---

## 19. Daily Review

The Daily Review should answer:

> What happened today?

Focus on:

- body measurement
- protein
- estimated calories
- fasting status
- activity by modality
- sleep
- subjective state
- raw journal timeline

Avoid excessive scoring or gamification.

---

## 20. Weekly Review

The Weekly Review should answer:

> What patterns are developing?

Primary elements:

### Body composition

- weight trend
- body-fat trend
- fat-mass trend
- lean-mass trend

### Nutrition

- average daily protein
- approximate calorie range
- fasting days
- protein consistency

### Activity

Minutes per modality across the week.

Example:

```text
Strength     142m
Zone 2       185m
Zone 1        96m
Mobility      54m
```

### Sleep

- average duration
- wake-state distribution

### Journal observations

Future AI-generated observations may surface correlations such as:

```text
Weight trend was lowest following days with:
- >150g protein
- strength training
- >40min Zone 2
```

These should be framed as observations rather than causal conclusions.

---

## 21. Visual Design

The application should use a tight, minimal aesthetic with a technical/engineering edge.

### Characteristics

- mobile-first
- strong typography
- restrained palette
- high information density without clutter
- compact cards
- thin dividers
- simple charts
- minimal decorative illustration
- no gamified rings, badges, streak celebrations, or motivational copy
- technical/logbook feel

The interface should resemble an instrument panel or personal telemetry system more than a consumer wellness app.

---

## 22. Navigation

Initial mobile navigation:

```text
Journal
Today
Week
Body
```

`Journal` is the primary capture surface.

`Today` summarizes the current day.

`Week` provides behavioural and trend analysis.

`Body` focuses on longer-term composition trends.

Settings and learned memories can live behind a secondary menu.

---

## 23. MVP

The first useful version should include:

- timestamped free-text journal entry
- LLM structured parsing
- review cards
- structured card editing
- source-text editing and re-parsing
- explicit accept step
- body-weight/body-fat tracking
- protein and approximate calorie estimates
- exercise minutes by modality
- basic sleep events
- hydration
- fasting flags
- Today dashboard
- Weekly dashboard
- raw + parsed + corrected data persistence
- simple personal memory for corrected recurring phrases

Stage 2 can add:

- TypeSafe/Jev
- semantic memory retrieval
- parser confidence
- automatic rule promotion
- richer trend analysis
- correlation discovery
- parser evaluation tooling

---

## 24. Success Criteria

The product is successful if:

1. Logging a normal day takes only a few short text entries.
2. Most parsed entries can be accepted without editing.
3. Corrections make future parsing measurably better.
4. The user can understand weekly protein, exercise, fasting, sleep, and body-composition trends at a glance.
5. The journal remains useful even if the AI layer is replaced.
6. The app helps answer the practical question:

> Which behaviours consistently coincide with improvements in my body composition?
