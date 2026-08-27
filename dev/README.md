# dev/

Nothing in here ships as part of the app — no page links to it.

| Datei | Zweck |
| --- | --- |
| `bausatz.html` | Style guide. Every component from §4/§5 of the handoff on one page, in both modes. Open it in a browser to compare against `TVZA Redesign.dc.html`. |
| `kit-conformance.test.mjs` | Opt-in gate for pages migrated onto the Bausatz (Phase C): 0 `<style>`, 0 inline modules, 0 `style="…"`, 0 hex colours, 0 emoji-as-symbol per `MIGRIERT` entry; radius scale / no stray `box-shadow` / no `:hover` transform for `assets/css/feature/*.css`. |
| `legacy-shrink.test.mjs` | Counts old class names (`item-card`, `link-row`, `spinner`, …) across every page. Every Phase-C commit lowers `MAX_REFERENZEN`; it may never rise. |
| `calendar-interop.test.mjs` | Prüft ICS-Import und -Export für Termine und Erinnerungen. |
| `calendar-groups.test.mjs` | Prüft Mehrfachgruppen im Kalender und auf dem Dashboard. |
| `calendar-view.test.mjs` | Prüft Tag-, 3-Tage-, Arbeitswochen- und Monatsnavigation. |
| `dashboard.test.mjs` | Prüft den Vierer-Schnellzugriff, dessen Ausschlüsse und die Initialisierungsreihenfolge. |
| `html-module-syntax.test.mjs` | Prüft die eingebetteten JavaScript-Module der geänderten HTML-Seiten. |
| `navigation.test.mjs` | Prüft die gemeinsame Bereiche-/Sidebar-Reihenfolge und die Desktop-Navigation. |
| `itinerary.test.mjs` | Tests for `assets/js/itinerary.js`. |
| `matura-ui.test.mjs` | Prüft beide Maturaarbeit-Ansichten, Kontrast, Phasenlogik und das einheitliche Plus. |
| `training-parser.test.mjs` | Prüft den Trainings-Excel-Parser gegen `fixtures/kw31-grid.json`. |
| `training-ui.test.mjs` | Klickt sich mit jsdom durch `pages/training.html` — Wochenplan, Einheit, Fokusmodus, Import, Cloud-Änderungen. |
| `training-integration.test.mjs` | Hält die neun Registrierungsstellen des Trainingsmoduls zusammen (Modulliste, Bereichsfarben, Router, Service Worker, Dashboard, Sync). |
| `fixtures/kw31-grid.json` | Zell-Raster der echten Wochendatei „Van Zanten Timothy KW 31.xlsx". |

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

Der Trainings-Parser läuft ebenfalls ohne Installation:

```bash
node --test training-parser.test.mjs
```

32 Tests gegen die echte Wochendatei. Sie halten die Eigenheiten der Vorlage
fest, an denen der Parser schon einmal gescheitert ist: das Sprungprogramm hat
eine Spalte „Wiederholungen", ist aber keine Kraftübung; im Rumpfblatt steht
die Trainingswoche unter der Überschrift „Datum"; „Vorher immer aufwärmen!!"
ist ein Hinweis und kein Aufwärmprogramm; verbundene Zellen wiederholen ihren
Inhalt.

Die Trainingsseite selbst braucht jsdom, weil sie ein einziges Inline-Modul
ist:

```bash
node --test training-ui.test.mjs
```

13 Tests. Der Test hängt `firebase-config.js` und `training-sync.js` an Stubs,
legt die echten Programmdaten unter `fetch` und klickt dann durch alle
Ansichten — inklusive Abhaken, Gewichtseingabe, Fokusmodus und einer Änderung,
die von einem anderen Gerät hereinkommt. Er prüft damit genau das, was der
Syntaxtest nicht sieht.

Dass der Bereich überall registriert ist, prüft ein eigener Test ohne jsdom:

```bash
node --test training-integration.test.mjs
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
