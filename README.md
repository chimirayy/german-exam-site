# Deutsch B1 Intensivtraining (telc-Format)

Static GitHub-Pages-ready B1 practice site with 3 pages (tabs): Lesen, Hören, Schreiben. Each page has its own localStorage key, timer, submission lock, results, and restart action.

## Pages

- **Lesen** (15 min per task): 50 Aufgaben, gemischt in fester zufälliger Reihenfolge aus 5 Aufgabentypen (je 10 Sets): Überschriften zuordnen, Richtig/Falsch, Anzeigen zuordnen, Sprachbausteine a/b/c-Lückentext, Sprachbausteine Wortkasten. Jede Aufgabe zeigt oben ihren Teiltyp (z. B. "Sprachbausteine · a/b/c") an.
- **Hören** (5 min per task): 30 Aufgaben (10 Ansagen · 10 Berichte · 10 Gespräche, alle auf einer Seite). Jede Aufgabe hat eine begrenzte Anzahl Wiedergaben (aktuell 2× je Aufgabe); in der Auswertung ist das Audio danach unbegrenzt zum Nachhören verfügbar, inklusive Transkript.
- **Schreiben** (30 min per task): 30 prompts.

Evaluation is independent per page. All content is original practice material inspired by the B1 task formats, not copied from an official exam.

## Updating the Hören (listening) content

The listening section is split into three independently replaceable pieces under `data/b1-practice/hoeren/`, plus the audio folder, so you can swap in new material without touching any code:

```
assets/audio/hoeren/                        ← 1) one flat folder of mp3 files
    ansage_01.mp3
    report_01.mp3
    dialogue_01.mp3
    ...

data/b1-practice/hoeren/
  qanda.json                                ← 3) one JSON with all questions, answers & metadata
  transcripts/                              ← 2) one flat folder of transcript files
    ansage_01.txt
    report_01.txt
    dialogue_01.txt
    ...
```

Everything is linked together purely by **id** (e.g. `ansage_01`) — the audio file, transcript file, and JSON entry for a task all share the same id, just with different extensions/locations. To update or add a listening task:

1. **Audio** — drop an mp3 named `<id>.mp3` into `assets/audio/hoeren/` (e.g. `ansage_01.mp3`). Replacing a file is enough to swap the audio for an existing task.
2. **Transcript** — drop a text file named `<id>.txt` into `data/b1-practice/hoeren/transcripts/` (e.g. `ansage_01.txt`), containing just the transcript text. For dialogues, keep each speaker on its own line.
3. **Questions & metadata** — in `qanda.json`, find (or add) the object with that `id` inside `sections[0].parts`. This holds `type`, `category`, `categoryLabel`, `title`, `instructions`, `maxPlays`, and the `questions` array (true/false and multiple-choice, each with the correct `answer`). It does **not** contain audio paths or transcript text — those are joined in automatically at page-load time by `assets/js/app.js`, based on the `id`.

To add a brand-new task: pick a new unique id, add its mp3, add its `<id>.txt` transcript, and add its metadata/questions object to `qanda.json`. To remove a task, delete all three (mp3, txt, qanda entry) — orphaned files are simply ignored.

Lesen and Schreiben are unaffected by this and remain single self-contained JSON files (`data/b1-practice/lesen.json`, `data/b1-practice/schreiben.json`).

## Preview

```bash
python3 -m http.server 8000

```
Open http://localhost:8000/.