# Deutsch B1 Intensivtraining (telc-Format)

Static GitHub-Pages-ready B1 practice site. This rebuild removes A2/B2 and listening, and separates every remaining B1 task format onto its own page.

## Pages
- Lesen · Überschriften zuordnen: 10 sets / 50 items / 15 min each task
- Lesen · Richtig oder falsch: 10 sets / 60 items / 15 min each
- Lesen · Anzeigen zuordnen: 10 sets / 50 items / 15 min each
- Sprachbausteine · a/b/c-Lückentext: 10 sets / 80 gaps / 15 min each
- Sprachbausteine · Wortkasten: 10 sets / 60 gaps / 15 min each
- Schriftlicher Ausdruck: 10 prompts / 30 min each

Each page has its own localStorage key, timer, submission lock, results, and restart action. Evaluation is therefore independent per task format. All content is original practice material inspired by the B1 task formats, not copied from an official exam.

## Preview
```bash
python3 -m http.server 8000
```
Open http://localhost:8000/.
