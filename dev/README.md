# dev/

Nothing in here ships as part of the app — no page links to it.

| Datei | Zweck |
| --- | --- |
| `bausatz.html` | Style guide. Every component from §4/§5 of the handoff on one page, in both modes. Open it in a browser to compare against `TVZA Redesign.dc.html`. |
| `calendar-interop.test.mjs` | Prüft ICS-Import und -Export für Termine und Erinnerungen. |
| `calendar-groups.test.mjs` | Prüft Mehrfachgruppen im Kalender und auf dem Dashboard. |
| `calendar-view.test.mjs` | Prüft Tag-, 3-Tage-, Arbeitswochen- und Monatsnavigation. |
| `dashboard.test.mjs` | Prüft den Vierer-Schnellzugriff, dessen Ausschlüsse und die Initialisierungsreihenfolge. |
| `html-module-syntax.test.mjs` | Prüft die eingebetteten JavaScript-Module der geänderten HTML-Seiten. |
| `navigation.test.mjs` | Prüft die gemeinsame Bereiche-/Sidebar-Reihenfolge und die Desktop-Navigation. |
| `itinerary.test.mjs` | Tests for `assets/js/itinerary.js`. |
| `matura-ui.test.mjs` | Prüft beide Maturaarbeit-Ansichten, Kontrast, Phasenlogik und das einheitliche Plus. |

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

Der Kalender-Abgleich läuft ebenfalls ohne Installation:

```bash
node --test calendar-interop.test.mjs calendar-view.test.mjs calendar-groups.test.mjs
```

Die Navigation läuft ebenfalls ohne Installation:

```bash
node --test navigation.test.mjs
```

Die beiden Maturaarbeit-Ansichten und die gemeinsamen Plus-Symbole:

```bash
node --test matura-ui.test.mjs
```

Die eingebetteten Module werden mit Nodes VM-Prüfung getestet:

```bash
node --experimental-vm-modules --test html-module-syntax.test.mjs
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
