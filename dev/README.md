# dev/

Nothing in here ships as part of the app — no page links to it.

| Datei | Zweck |
| --- | --- |
| `bausatz.html` | Style guide. Every component from §4/§5 of the handoff on one page, in both modes. Open it in a browser to compare against `TVZA Redesign.dc.html`. |
| `dashboard.test.mjs` | Prüft den Vierer-Schnellzugriff, dessen Ausschlüsse und die Initialisierungsreihenfolge. |
| `itinerary.test.mjs` | Tests for `assets/js/itinerary.js`. |

## Tests laufen lassen

```bash
cd dev
npm install jsdom     # nur beim ersten Mal; jsdom liefert DOMParser ausserhalb des Browsers
node itinerary.test.mjs
```

`hints.test.mjs` läuft ohne Installation:

```bash
node hints.test.mjs
```

Die statischen Sicherheits-Invarianten laufen ebenfalls ohne Installation:

```bash
node --test security-model.test.mjs
```

Der Dashboard-Regressionstest läuft ebenfalls ohne Installation:

```bash
node --test dashboard.test.mjs
```

Sie verhindern versehentliches Wiederöffnen der Registrierung, globale
Mitglieder-Schreibrechte, öffentliche Projektpasswörter und rohe Backend-Fehlercodes.

33 Tests. Der interessante Teil eines Hinweises ist der Fall, in dem er
**nicht** erscheint — die meisten Tests prüfen deshalb auf `null`: keine
Historie, kein Regen, frisch gewachste Ski, zwei Geburtstage
gleichzeitig, schon einmal weggewischt.

## itinerary.test.mjs

39 Tests. Sie decken die deutschen und englischen Datumsformen ab, die
Zeitformen (`14:00`, `14.30 Uhr`, `9:00 – 11:00`, `2:30 pm`), Pläne mit und
ohne `.stop`-Klassen, den Fall „Stop-Titel enthält einen Monatsnamen" und
Pläne ganz ohne Datum.
