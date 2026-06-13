# Quiz question generation prompt

Paste the block below into a Claude chat. Edit the `## What to generate`
section first to set count + category mix.

---

You are generating multilingual quiz questions for **EuropeQuiz** — a
Risk-style game where players capture European countries by answering
trivia. There are two question tables in Postgres. Every conceptual
question exists in **four languages** (English, Russian, Ukrainian,
Polish), tied together by a shared `groupKey`. Each player in a match
sees questions in their own profile language; the server validates
answers in a language-agnostic way (numeric for Question, index-based
for WarQuestion).

## Languages

Generate ALL FOUR for every question, no exceptions:

- `en` — English
- `ru` — Русский
- `uk` — Українська
- `pl` — Polski

## Categories

Use exactly one of (per question, same across all 4 translations):

`geography`, `history`, `math`, `science`, `sports`, `pop_culture`,
`language`, `general`

## Table 1 — `Question` (numeric / Expand phase)

Player types a number. Server scores by closeness, not exact match.

Columns to INSERT:

| Column     | Type             | Notes                                          |
| ---------- | ---------------- | ---------------------------------------------- |
| groupKey   | text             | Shared uuid across the 4 translations          |
| language   | enum (en/ru/uk/pl) | One row per language                         |
| text       | text             | The question in that language                  |
| answer     | double precision | The numeric correct answer — SAME on all 4 rows |
| category   | enum             | From the list above                            |

**Rules:**

- 1 question = 4 rows (en, ru, uk, pl) sharing the same `groupKey` and
  the same `answer`. Translations only differ in `text`.
- Answer must be a clean number a player could plausibly guess —
  population in millions, year, distance in km, height in metres,
  duration in years. Avoid hyper-precise values like 47,812,345.
- Always specify the unit + reference year in the question text.
  Example: "Population of Poland in millions (2024)" — not "Population
  of Poland".
- Numeric values should be one of: integer, one decimal place. Keep it
  guessable.

## Table 2 — `WarQuestion` (multiple-choice / War phase)

Player picks one of 4 options.

Columns to INSERT:

| Column        | Type      | Notes                                       |
| ------------- | --------- | ------------------------------------------- |
| groupKey      | text      | Shared uuid across the 4 translations       |
| language      | enum      | One row per language                        |
| text          | text      | Question in that language                   |
| options       | text[]    | Exactly 4 options, translated, **same logical order across languages** |
| correctIndex  | integer   | 0–3, SAME across all 4 translations         |
| category      | enum      | Same across all 4 translations              |

**Rules (CRITICAL):**

- Options array length is exactly 4.
- Options must be **in the same logical order across every language**.
  If `options[0]` in English is "Paris", then `options[0]` in Russian
  is "Париж", in Ukrainian "Париж", in Polish "Paryż". Index 0 in any
  language is the SAME real-world option, just translated.
- `correctIndex` is identical on all 4 rows of a group.
- Vary `correctIndex` across questions — don't always put the correct
  answer at slot 0. Aim for roughly 25% / 25% / 25% / 25% across a
  batch.
- 3 wrong options must be plausible (same category, similar magnitude
  / type). Don't include "Mars" as a wrong answer to a capital-of-an-
  earth-country question.
- No "all of the above" / "none of the above" tricks.

## Output format

Output one SQL block, ready to paste into Supabase SQL editor or psql.
Use `gen_random_uuid()::text` for each group's key. Wrap everything in
a single transaction. No commentary unless I explicitly ask for it.

Use a `WITH g AS (SELECT gen_random_uuid()::text AS k)` CTE per question
so the 4 INSERT rows share the same generated key.

Example showing ONE numeric question + ONE MC question:

```sql
BEGIN;

-- Numeric: Population of Poland
WITH g AS (SELECT gen_random_uuid()::text AS k)
INSERT INTO "Question" ("groupKey", language, text, answer, category) VALUES
  ((SELECT k FROM g), 'en', 'Population of Poland in millions (2024)?', 38, 'geography'),
  ((SELECT k FROM g), 'ru', 'Население Польши в миллионах (2024)?', 38, 'geography'),
  ((SELECT k FROM g), 'uk', 'Населення Польщі у мільйонах (2024)?', 38, 'geography'),
  ((SELECT k FROM g), 'pl', 'Liczba ludności Polski w milionach (2024)?', 38, 'geography');

-- MC: Capital of France
WITH g AS (SELECT gen_random_uuid()::text AS k)
INSERT INTO "WarQuestion" ("groupKey", language, text, options, "correctIndex", category) VALUES
  ((SELECT k FROM g), 'en', 'Capital of France?', ARRAY['Paris','London','Berlin','Madrid'], 0, 'geography'),
  ((SELECT k FROM g), 'ru', 'Столица Франции?',   ARRAY['Париж','Лондон','Берлин','Мадрид'], 0, 'geography'),
  ((SELECT k FROM g), 'uk', 'Столиця Франції?',   ARRAY['Париж','Лондон','Берлін','Мадрид'], 0, 'geography'),
  ((SELECT k FROM g), 'pl', 'Stolica Francji?',   ARRAY['Paryż','Londyn','Berlin','Madryt'], 0, 'geography');

COMMIT;
```

## Quality bar

- Bias toward Europe-themed topics (countries on the European map,
  capitals, populations, founding dates, monarchs, mountains, rivers,
  languages, leagues, composers, writers). Non-Europe questions are
  fine for `science` / `math` / `general` / `pop_culture` but Europe
  should dominate `geography` and `history`.
- Verify facts against authoritative sources. No urban legends.
- No politics, no current events with disputed framing, no religion-
  comparison questions.
- Mix difficulty: easy (~30%), medium (~50%), hard (~20%).
- No duplicates or near-duplicates within a batch.
- For numeric questions, make sure the unit is unambiguous in every
  language. "in km" → "в км" / "в км" / "w km" etc.
- For translations: prefer natural phrasing in each language, not a
  word-for-word rendering. The same fact, idiomatically expressed.

## What to generate

Generate **THIS BATCH**:

- **Question (numeric)**: 40 questions total
  - 12 geography, 10 history, 4 math, 4 science, 4 sports,
    3 pop_culture, 2 language, 1 general
- **WarQuestion (MC)**: 40 questions total
  - 12 geography, 10 history, 4 math, 4 science, 4 sports,
    3 pop_culture, 2 language, 1 general

Adjust counts above to whatever you actually need before pasting.

Output the SQL block only.
