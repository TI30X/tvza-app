# CLAUDE.md

Anleitung für Claude Code in diesem Repository.

## Was das ist

**Firn** ist eine Trainingsplattform für Kader, Vereine und Gyms: Pläne,
Termine, Videoanalyse, FIS-Punkte. Sie ist aus TVZA hervorgegangen — einer
privaten Familien-App — und trägt deren Bereiche weiter (Kalender, Food,
Ski, Watchlist, Wetter, Maturaarbeit, Nachrichten, Projekte).

**Firn ist das Produkt, TVZA der Absender.** Die Fusszeilen sagen „Firn — ein
Projekt von TVZA". Timo ist der Nutzer, Michel baut und hostet.

Version: **v.35.27.0**. Remote: `TI30X/tvza-app`. Arbeitszweig: `firn`.
Ausgerollt wird `main` — siehe Deploy weiter unten.

Die Oberfläche gibt es in sieben Sprachen. **Kommentare und
Commit-Messages sind deutsch**, UI-Texte sind Katalogschlüssel.

## Aufbau — vor jedem Werkzeugvorschlag lesen

- **Statische Seite, kein Build-Schritt.** HTML + ES-Module + CSS. Kein
  Bundler, kein Framework, kein `npm run build`. Kein React/Vite/TypeScript
  vorschlagen, solange nicht ausdrücklich danach gefragt wird.
- **GitHub Pages** (`.nojekyll` in der Wurzel).
- **Firebase auf dem Spark-Tarif.** Harte Budgetgrenze, kein Versehen.
  **Keine Cloud Functions, keine Extensions, nichts, was Blaze braucht.**
- **Gemeinsamer Code in `assets/js/`**, Seitenmodule in
  `assets/js/feature/<seite>/`, Seiten in `pages/`, Tests und Werkzeuge in
  `dev/` (nichts aus `dev/` wird ausgeliefert).

Das Firestore-Datenmodell steht ausführlich in `README.md`.

## Befehle

```bash
cd dev
npm install                                        # einmalig (jsdom)
node --experimental-vm-modules --test *.test.mjs
```

49 Testdateien, **501 Tests**. Das Flag braucht `html-module-syntax.test.mjs`.
Alle grün vor jedem Commit.

Katalog bauen (nur nötig, wenn jemand an den Tabellen arbeitet):

```bash
node dev/i18n-src/build.mjs
```

Firestore-Regeln ausrollen:

```bash
firebase deploy --only firestore:rules
```

## Fallen in diesem Repo

**1. Versionsnummern sind zwei Dateien.** `APP_VERSION` in
`assets/js/ui-fx.js` und `const CACHE` in `sw.js` müssen übereinstimmen.
`dev/security-model.test.mjs` erzwingt es. Bei **jeder** Änderung an einer
Hüllendatei bumpen, sonst bekommen zurückkehrende Nutzer einen alten
Service-Worker-Vorrat.

Dasselbe gilt für `?v=` an `kit.css` und den Seitenmodulen: ändert sich das
Stylesheet, muss die Zahl in **allen** Seiten und in `sw.js` mitwandern.
Sonst sieht man neues Markup mit altem Stylesheet.

**2. Die Regeln sind die Wahrheit, nicht die Oberfläche.** Mitgliedschaft,
Gruppenisolation und einmalige Einladungscodes stehen in `firestore.rules`
(1284 Zeilen). `dev/security-model.test.mjs` und `dev/rules-regression.test.mjs`
halten die Invarianten fest — Regeländerungen gehören im selben Commit dorthin.

Historisch drifteten Datei und Live-Stand auseinander, weil die Regeln in die
Konsole gepastet wurden. Seit es `firebase.json` gibt, läuft der Ausrollweg
über die CLI. Vor jedem Audit trotzdem gegen den Live-Stand prüfen.

**3. Was ein Bereich ist.** Ein Bereich qualifiziert sich, wenn alle fünf
zutreffen. Das ist die Schranke, die verhindert, dass die App wieder elf
Module wird.

1. **Für sich allein lauffähig.** Keine Abhängigkeit von anderen Modulen.
2. **Für neue Konten aus.** Nur der Kern ist an.
3. **Ein Ort.** Was einen Tab hat, steht nicht zusätzlich in der Heute-Liste.
4. **Tag-eins-Test.** Ein frisches, leeres Konto öffnet ihn und sieht in
   einem Tipp eine offensichtliche erste Handlung. Ist die Antwort „ein
   leerer Bildschirm", ist er nicht öffentlich, sondern persönlich.
5. **Eine Plättchenfarbe**, ein Eintrag in der Bereichsliste. Nichts bekommt
   eine zweite Oberfläche.

**4. Seiten-Invariante.** Eine Seitendatei enthält Markup, `<link>`s und
**ein** `<script type="module" src="…">`. Kein `<style>`-Block, kein
Inline-Modul, kein `style="…"`, keine Hex-Farbe ausser `theme-color`, kein
Emoji als Funktionssymbol.

`index.html` hielt das lange nicht — sie trug 2000 Zeilen Code in drei
Inline-Modulen. Seit v.35.11.0 liegen die in `assets/js/feature/start/`.

**5. Der Katalog gewinnt, aber erst später.** `t()` gibt bei einem
unbekannten Schlüssel den **Schlüssel** zurück, nie `undefined` — darum
greift `t(k) ?? 'deutsch'` **nie**. Immer `tOr(key, fallback)` benutzen.

Und: der Katalog kommt asynchron. Wer einem Element, das der Code selbst
beschriftet, zusätzlich ein `data-i18n` gibt, bekommt einen Wettlauf, den der
Katalog gewinnt — die Ansicht steht dann in einem Zustand und trägt die
Beschriftung des anderen. Auf `pages/gruppe.html` hält ein Test sechs solche
Elemente frei.

**6. Gast gegen Mitglied.** Eine Firebase-Anmeldung allein ist keine
Mitgliedschaft. `isMember()` verlangt ein `users/{uid}`-Profil, kein
`guestProfiles/{uid}`, und — nur wenn `config/tvza.requireEmailVerification`
gesetzt ist — eine bestätigte Adresse. Bewusst **fail-open**: ohne
`config/tvza` wird nicht verlangt. Das ist die Beta-Vorgabe.

**7. Die Hülle ist zwei Spalten, nicht ein Balken — und EIN Baustein.**
Am Laptop trägt die Leiste das Navy (Zeichen, Wortmarke, Tabs, am Fuss das
Konto und der Klappknopf), der helle Kopf steht nur über dem Inhalt und
beginnt an derselben Kante (`--kopf-breite`, `--kopf-rand`; Kalender und
Matura setzen sie selbst).

Die Leiste baut **nur** `mountRail()` in `shell.js`. Bis v.35.23.0 baute
`nav.js` für alle Seiten ausser Gruppe/Einheit/Video eine zweite, magere —
Start sah anders aus als Gruppe. `nav.js` ruft jetzt `mountRail()`.

**Ein Weg zu den Einstellungen:** `kontoKnopf()` — am Handy im Kopf, am
Laptop am Fuss der Leiste, nie beide sichtbar. Kein Zahnrad, kein zweites
Menü. Tabs haben keinen Zurück-Pfeil; Unterseiten (Einheit, Video) schon.
Alle Importe von `shell.js` und `router.js` müssen dieselbe `?v=` tragen —
zwei Nummern sind für den Browser zwei Module mit getrenntem Zustand.

**Keine Browserfenster.** `prompt()`, `confirm()` und `alert()` sind
ersetzt durch `frage()`, `eingabe()`, `meldung()` aus `dialog.js`.
`gruppe-erstellen.test.mjs` hält die Gruppenseite frei davon.

Die Leiste lässt sich auf 72 Pixel einklappen (eine Zahl: `--leiste`). Der Zustand hängt am **Gerät**
(`localStorage['firn.leiste']`), nicht am Konto — wer am grossen Bildschirm
aufgeklappt arbeitet und am kleinen zu, will genau das.

Die Falle steckt im `overflow`. Die Leiste braucht `overflow-y: auto`, sonst
sind bei kurzem Fenster die unteren Einträge unerreichbar. Ein
`overflow: visible` im selben Block — verlockend, wenn etwas aus der Leiste
ragen soll — überschreibt das lautlos: kein Fehler, nur kein Scrollen mehr.
Genau das ist einmal passiert. Deshalb sitzt der Klappknopf **in** der
Leiste. `dev/navigation.test.mjs` hält beide Hälften fest.

**8. Jeder Abstand im Kit kommt aus der Skala.** padding, margin und gap ab
4 Pixeln nehmen `--s1`…`--s7`; `clamp()` bleibt frei, unter 4 Pixeln ist
Geometrie. Bis v.35.23.0 standen 137 freie Pixelwerte in `kit.css`.
`dev/css-token.test.mjs` hält es fest. Die Seiten-Stile in `feature/` sind
der nächste Schritt.

**9. Ein Aufruf ins Leere ist gültiges JavaScript.** Dreimal durchgerutscht:
`refreshAreaNavigation` (ein Test *verlangte* den Aufruf), `syncPublicFeed`
(jedes Umschalten eines Bereichs meldete „Nicht gespeichert"), `TABS` aus
einem Import gefallen. `dev/aufrufe.test.mjs` sucht die ganze Klasse.
Ein Test, der einen Aufruf wörtlich verlangt, schützt keinen Code — er
friert ihn ein.

**10. Training lebt in der Gruppe.** Eingelesen wird die Excel in der Gruppe
(„Plan veröffentlichen"), gezeichnet wird die Woche von `feature/woche/woche.js`
auf der Gruppenseite und im Bereich Training, geübt wird in `einheit.html`.
Der Bereich Training hat keinen eigenen Import und keinen eigenen Speicher
mehr; die alten Daten unter `users/{uid}/trainingLogs` bleiben in Firestore.

**11. Kontaktkarten sehen nur die Leitung und die Person selbst.** Kontakte
von Minderjährigen und ihren Eltern. Die Regel (`get`: Leitung oder man
selbst, `list`: nur Leitung) ist die Sicherung; die Oberfläche fragt gar
nicht erst, wo sie nichts bekommen darf. `gruppe-kontakte.test.mjs` prüft
beides und ist gegengeprüft.

## Ausrollen

`main` ist die Live-Seite. Der Arbeitszweig ist `firn`.

```bash
git push origin firn:main
```

**Michel entscheidet, wann.** Nie ungefragt auf `main` pushen.

## Mehrsprachigkeit

Sieben Sprachen: de, en, fr, it, pl, nl, es. **657 Schlüssel** aus zehn
Tabellen in `dev/i18n-src/`.

- **Quelle sind die `catalog*.py`-Tabellen.** Schlüssel auf ein Tupel
  `(de, en, fr, it, pl, nl, es)`. `node dev/i18n-src/build.mjs` erzeugt
  `assets/i18n/<lang>.json`; die JSON-Dateien werden mitversioniert, damit
  die App ohne Build-Schritt auskommt. Doppelte Schlüssel über zwei Tabellen
  brechen den Bau.
- **Der Bau läuft in Node, nicht in Python.** Auf dieser Maschine ist kein
  Python installiert. `apply_keys.py` ist deshalb **nicht** benutzbar —
  Schlüssel werden von Hand oder per Skript gesetzt, und danach wird
  gegengeprüft, dass nur Attribute dazugekommen sind (Tag-Folge und
  sichtbarer Text identisch).
- **Verträge:** `data-i18n` für Text, `data-i18n-html` nur wo Markup im
  String steckt, `data-i18n-attr="aria-label:key;title:key2"`,
  `data-i18n-vars='{"n":3}'`.
- **Additiv.** Übersetzt wird nur, was ein `data-i18n` trägt. Eine halb
  umgestellte Seite kann nichts kaputt machen — was fehlt, bleibt deutsch.
- **Inhalte werden nicht übersetzt.** Termine, Nachrichten, Projektnamen und
  Übungsnamen gehören den Nutzern.
- **Formate über `Intl`,** nie über Strings: `TVZAI18n.format.date/time/
  number/relative/plural`. Polnisch hat drei Pluralformen.
- **`dev/i18n.test.mjs`** findet die Seiten selbst, statt sie aufzuzählen.
  Eine neue Seite ist damit automatisch abgedeckt.

## Trainingspläne

Die Vorlage ist die Excel des Kaders (BSV Perspektivkader): ein
**Wochenplan** als Raster 7 Tage × Vormittag/Nachmittag, dessen Zellen die
Einheiten beim Namen nennen — und je ein Blatt pro Einheit.

`assets/js/training-parser.js` (840 Zeilen) liest sie und vergibt sechs Modi:
`sets`, `rounds`, `timed`, `block`, `note`, `video`. Nur `sets` hat Sätze zum
Eintragen; Mobi ist eine Liste von Videolinks, Ausdauer eine Zonentabelle.

Zwei Dinge, die leicht übersehen werden:

- **Der Videolink** steht in der Vorlage eine Zeile unter dem Übungsnamen und
  liegt als `item.video` vor. Er wandert in ein `href` — `videoUrl()` prüft
  darum das Protokoll.
- **Ein Plan läuft zwei Wochen.** TW17 und TW18 stehen untereinander in
  derselben Übung; das ist der Vergleich, der Fortschritt zeigt. `item.history`
  trägt die andere Woche, `vorwochen()` räumt leere Zeilen weg.

## Offene Punkte

- **Kein Server.** Das blockiert vier Dinge auf einmal: Einladungsmails
  (`mailer/` schreibt in die `mail`-Sammlung, niemand leert sie), das
  Kalender-Abo (`worker/` ist fertig, nirgends ausgerollt), das Abo/Bezahlen
  (ohne Server nicht absicherbar — darum nennt `willkommen.html` keinen
  Preis) und fremde Quellen in der Tageszusammenfassung. Michel hat
  entschieden, dass ein Server später dazukommt.
- **Die App ist nie end-zu-end durchgeklickt worden.** 501 Unit-Tests, aber
  kein einziger Lauf gegen echtes Firestore.
- `APP_CHECK_SITE_KEY` ist noch `''` — App Check vorbereitet, nicht scharf.
- Die Anmeldesperre in `assets/js/auth-security.js` ist localStorage-only.
  Bequemlichkeit, **kein** Schutz gegen Brute Force.
- Kein 2FA. SMS braucht Identity Platform (kostenpflichtig).
- Ältere Seiten sind noch überwiegend deutsch: `maturaarbeit.html`,
  `guest.html`, `admin.html`.
- **Regeln ohne Emulator.** Auf dieser Maschine gibt es kein Java; die
  Regeln werden vor dem Ausrollen nur mit `--dry-run` gegen das Projekt
  kompiliert, nicht gegen Testfaelle gefahren. Zuletzt ausgerollt mit
  v.35.27.0 (`bezeichnung` an Terminen, `groups/{gid}/kontakte`).

## Gewohnheiten

- Deutsch für Kommentare und Commit-Messages. Form:
  `v.35.27.0: <deutsche Zusammenfassung>`, darunter ein Absatz, der das
  **Warum** erklärt — besonders bei Fehlern, die still waren.
- Geheimnisse nie ins Repo: `mailer/.env`, `**/*service-account*.json`,
  `worker/.wrangler/`, `firestore.rules.live`, `*.zip` sind ignoriert.
- **Jede Verhaltensänderung bekommt einen Test in `dev/`.** Ohne
  Typprüfung und ohne Build-Schritt ist die Suite das einzige Netz.
- Findet ein Test einen Fehler, ist meistens der Test im Recht. Wenn nicht,
  gehört in denselben Commit, warum nicht.
