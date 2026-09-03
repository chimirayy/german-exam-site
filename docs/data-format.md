# Data format reference

Each level file (`data/a2.json`, `data/b1.json`, `data/b2.json`) has this
top-level shape:

```jsonc
{
  "level": "A2",                 // short code, shown in the exam header
  "levelName": "telc Deutsch A2",// shown on the start screen
  "levelColor": "#4C7A5E",       // not currently used by CSS (colour is set in style.css), kept for reference
  "introduction": "…",           // shown on the start screen
  "sections": [ /* see below */ ]
}
```

## Section

```jsonc
{
  "id": "lesen",                 // unique, used as a key internally
  "title": "Leseverstehen",
  "timeMinutes": 30,             // countdown length for this section
  "instructions": "…",           // shown once at the top of the section
  "parts": [ /* see below */ ]
}
```

## Part

Every part has `id`, `title`, `instructions`, and `type`. The remaining
fields depend on `type`.

### `type: "true_false"`

Reading Teil 2 / Listening Teil 1 style: a text (optional) or audio
(optional), then a list of statements the candidate marks richtig/falsch.

```jsonc
{
  "id": "lesen-teil2",
  "title": "Teil 2 – Richtig oder falsch",
  "type": "true_false",
  "instructions": "…",
  "text": "… (omit for listening parts)",
  "audio": "audio/a2/….mp3",        // optional, listening parts only
  "transcript": "…",                 // optional, listening parts only
  "questions": [
    { "id": "5", "statement": "…", "answer": true }
  ]
}
```

### `type: "multiple_choice"`

Listening Teil 2 style (also usable for reading): each question has 3
options, one correct index (0-based).

```jsonc
{
  "type": "multiple_choice",
  "audio": "…", "transcript": "…",   // optional
  "questions": [
    { "id": "29", "question": "…", "options": ["a…", "b…", "c…"], "answer": 0 }
  ]
}
```

### `type: "matching"`

Reading Teil 1 style: short texts/items matched against a shared pool of
lettered options (headlines). `answer` maps item id → option key.

```jsonc
{
  "type": "matching",
  "items":   [{ "id": "1", "text": "…" }],
  "options": [{ "key": "A", "text": "…" }],
  "answer":  { "1": "A" }
}
```

### `type: "matching_ads"`

Reading Teil 3 style: situations matched against classified-ad style
snippets. Same idea as `matching` but with `scenarios`/`ads` naming.

```jsonc
{
  "type": "matching_ads",
  "scenarios": [{ "id": "10", "text": "…" }],
  "ads":       [{ "key": "A", "text": "…" }],
  "answer":    { "10": "A" }
}
```

### `type: "speaker_matching"`

Listening Teil 3 style: N speakers, each matched to one of several
statements (usually more statements than speakers).

```jsonc
{
  "type": "speaker_matching",
  "audio": "…", "transcript": "…",
  "speakers": ["33", "34", "35", "36", "37"],
  "options": [{ "key": "A", "text": "…" }],
  "answer":  { "33": "B" }
}
```

### `type: "cloze_mc"`

Sprachbausteine Teil 1 style: a running text with inline blanks, each a
3-option multiple choice. The text is assembled from `textBefore`, then
each blank's `before`/`after` text fragments, then `textAfter`.

```jsonc
{
  "type": "cloze_mc",
  "textBefore": "Liebe Frau Klein,\nvielen Dank",
  "blanks": [
    { "id": "14", "before": " für", "options": ["Ihre", "Ihrem", "Ihren"], "answer": 0, "after": " Nachricht." }
  ],
  "textAfter": "Viele Grüße\nAhmet"
}
```

`answer` is the 0-based index into that blank's `options`.

### `type: "cloze_wordbank"`

Sprachbausteine Teil 2 style: same idea, but every blank is filled from
one shared word bank (`wordbank`) instead of its own options, and some
words in the bank are distractors that fit nowhere.

```jsonc
{
  "type": "cloze_wordbank",
  "wordbank": ["mit", "seit", "aber", "gern", "weil", "immer"],
  "textBefore": "Paul wohnt",
  "blanks": [
    { "id": "20", "before": "", "answer": "seit", "after": " drei Jahren in Berlin." }
  ]
}
```

`answer` here is the literal word string (must match one entry in
`wordbank` exactly).

### `type: "writing"`

Schriftlicher Ausdruck: a prompt, bullet points to cover, a minimum word
count, and a model answer shown only on the (unlocked) answer sheet.
Not auto-graded — the candidate's own text is shown next to the model
answer for self-assessment.

```jsonc
{
  "type": "writing",
  "prompt": "…",
  "points": ["…", "…", "…"],
  "minWords": 80,
  "modelAnswer": "…"
}
```

---

## Adding a new question type

If you ever need a genuinely new interaction (not covered by the eight
types above), you'll need to add a small render function and a matching
scoring function in `assets/js/app.js`:

1. Add a `case "your_type":` in `renderPart()` pointing at a new
   `renderYourType(wrap, section, part)` function that builds the DOM and
   writes into `state.answers[part.id][questionId]` on change.
2. Add the same `case` to `questionIdsForPart()` so the progress counter
   knows how many questions the part has.
3. Add the same `case` to `scorePart()` so the answer sheet can compute a
   score, and to `renderPartAnswers()` so it can display the review row.

Everything else (timer, locking, persistence, layout) is generic and
needs no changes.
