# Deutsch B1 Intensivtraining (telc-Format)

Static GitHub-Pages-ready B1 practice site with 3 pages (tabs): Lesen, Hören, Schreiben. Each page has its own localStorage key, timer, submission lock, results, and restart action.

## Pages

- **Lesen** (15 min per task): 50 Aufgaben, gemischt in fester zufälliger Reihenfolge aus 5 Aufgabentypen (je 10 Sets): Überschriften zuordnen, Richtig/Falsch, Anzeigen zuordnen, Sprachbausteine a/b/c-Lückentext, Sprachbausteine Wortkasten. Jede Aufgabe zeigt oben ihren Teiltyp (z. B. "Sprachbausteine · a/b/c") an.
- **Hören** (5 min per task): 30 Aufgaben (10 Ansagen · 10 Berichte · 10 Gespräche, alle auf einer Seite). Jede Aufgabe hat eine begrenzte Anzahl Wiedergaben (aktuell 2× je Aufgabe); in der Auswertung ist das Audio danach unbegrenzt zum Nachhören verfügbar, inklusive Transkript.
- **Schreiben** (30 min per task): 10 prompts.

Evaluation is independent per page. All content is original practice material inspired by the B1 task formats, not copied from an official exam.

## Preview

```bash
python3 -m http.server 8000

```
Open http://localhost:8000/.