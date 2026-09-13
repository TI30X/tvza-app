# CLAUDE.md

Anleitung für Claude Code in diesem Repository.

## Was das ist

**TVZA ist die persönliche Software für alles; Firn ist eine Software von
TVZA für Gruppen** — Kader, Vereine, Gyms, Unternehmen, Familien: Termine,
Pläne, Training, Videoanalyse, FIS-Punkte. Beides lebt in einer App mit einer
Anmeldung, aber nicht als ein Produkt.

- **Firn** ist, was eine Gruppe braucht: Start, Kalender, Gruppe, Chat, dazu
  die Firn-Bereiche (Training, Ski-Tracker, Wetter). Das sieht jedes Konto.
- **TVZA** sind die persönlichen Bereiche, die Timo für sich und seine
  Freunde gebaut hat (Maturaarbeit, Maturaarbeit-Tracker, Food, Watchlist,
  Projekte). Auf Start ein eigener Teil, in den Seiten das Zeichen TVZA, im
  Tab das TVZA-Symbol und „— TVZA", für neue Konten nicht freigegeben — der
  Admin gibt sie frei, wem er will. Welche Bereiche TVZA sind, entscheidet
  **eine** Liste: `TVZA_BEREICHE` in `assets/js/firebase-config.js`.

  **Eine Seite sagt selbst, wozu sie gehört:** `<body data-marke="TVZA">`,
  dazu `<link rel="icon">` und `<title>`. `dev/tvza-teil.test.mjs` leitet aus
  `TVZA_BEREICHE` ab, welche Seite was tragen muss. Weil der Router die
  Bereiche in einen Rahmen lädt und die Seite oben stehen bleibt, übernimmt
  `tabFolgen()` in `router.js` Symbol und Titel der Seite im Rahmen.

  **Der Wechsel ist sichtbar** (`assets/js/wechsel.js`, v.35.40.0): an der
  Grenze Firn ↔ TVZA wird oben in der Leiste der Berg zum T, „Firn" blendet
  zu „TVZA"; am Handy erscheint das Zeichen kurz oben in der Mitte. Zwischen
  zwei Firn-Seiten passiert nichts. Das Zeichen der Leiste ist darum ein SVG
  im Dokument, kein `<img>`. Die Verwandlung rechnet zwischen den Ecken von
  je drei Vierecken; `dev/wechsel.test.mjs` prüft, dass beide Enden genau
  `firn.svg` und `tvza.svg` sind — wer eines der Symbole ändert, muss
  `FORMEN` mitziehen.

Die Fusszeilen sagen „Firn — ein Projekt von TVZA". Timo ist der Nutzer,
Michel baut und hostet. Timos Name steht je Seite **einmal**, als
„betrieben von Timothy van Zanten" (`fuss.betrieben`) in der Fusszeile —
nie nackt unter dem Zeichen, wo er sich wie ein Teil des Logos las
(`dev/marke.test.mjs`).

Version: **v.35.43.0**. Remote: `TI30X/tvza-app`. Arbeitszweig: `firn`.
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

58 Testdateien, **633 Tests**. Das Flag braucht `html-module-syntax.test.mjs`.
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
Sonst sieht man neues Markup mit altem Stylesheet. Und die Kette: wer eine
geänderte Datei lädt, hat selbst eine neue Zeile — `shell.js` ändern heisst
`gruppe.js` und `gruppe.html` ändern. Das zieht `node dev/versionen.mjs
<datei> …` nach; `dev/versionen.test.mjs` prüft, dass jede Datei überall
dieselbe Zahl trägt.

**2. Die Regeln sind die Wahrheit, nicht die Oberfläche.** Mitgliedschaft,
Gruppenisolation und einmalige Einladungscodes stehen in `firestore.rules`
(1365 Zeilen). `dev/security-model.test.mjs` und `dev/rules-regression.test.mjs`
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

Und die sechste Frage: **Firn oder TVZA?** Braucht eine Gruppe das, ist es
Firn. Ist es für Timo und seine Freunde, ist es TVZA — dann gehört der
Schlüssel in `TVZA_BEREICHE`, und Start, Einstellungen, Admin und neue Konten
ziehen nach (`dev/tvza-teil.test.mjs`). Neue Konten bekommen `NEUE_KONTEN`:
der Kern an, Firn-Bereiche frei aber aus, TVZA nicht frei. `DEFAULT_MODULES`
bleibt die Rückfallebene für alte Profile, damit bestehende Konten nichts
verlieren.

**4. Seiten-Invariante.** Eine Seitendatei enthält Markup, `<link>`s und
**ein** `<script type="module" src="…">`. Kein `<style>`-Block, kein
Inline-Modul, kein `style="…"`, keine Hex-Farbe ausser `theme-color`, kein
Emoji als Funktionssymbol.

`index.html` hielt das lange nicht — sie trug 2000 Zeilen Code in drei
Inline-Modulen. Seit v.35.11.0 liegen die in `assets/js/feature/start/`.
Die beiden Matura-Seiten folgten mit v.35.34.0 (`feature/matura/`, je ein
`…-ansicht.js` ohne Firebase und ein Einstieg), die Gastseite und die
öffentliche Projektseite mit v.35.36.0 (`feature/gast/`,
`feature/oeffentlich/`). Wer eine Seite umzieht, nimmt sie in `MIGRIERT`
(`kit-conformance.test.mjs`) auf, und die Tests lesen sie über
`leserMitStart` samt Modulen. Zustände schaltet `hidden`, nicht
`style.display` — das Kit hält `[hidden]` mit `!important`. Ein
Stilblock, den man entfernt, wird **gemessen**, nicht abgeschrieben: bei
der Maturaarbeit wirkten von 320 Zeilen noch zehn Regeln — der Rest war
längst überschrieben.

`public.html` ist TVZAs eigene Seite und trägt darum eine eigene, warme
Palette — aber als Token an `.oeffentlich` in `oeffentlich.css`, nicht
als zweites Kit. Skala, Radien und Fusstafel kommen aus `kit.css`. Das
Zeichen ist dort **TVZA**, nicht Firn (seit v.35.37.0; gesetzt wie
`.tvza-marke`, nur gross), und die Versionszeile nimmt ihr Zeichen aus
`<body data-marke="TVZA">` — ohne das Attribut sagt sie „Firn". Im Tab zeigt
sie das TVZA-Symbol (`assets/icons/tvza.svg`: ein T, dessen Balken glüht —
Geschwister des Firn-Bergs). Die PNG fürs iPhone rechnet
`node dev/tvza-symbol-png.mjs` aus dem SVG; wer das SVG ändert, lässt es
laufen, sonst meldet `marke.test.mjs` die Abweichung.

**5. Der Katalog gewinnt, aber erst später.** `t()` gibt bei einem
unbekannten Schlüssel den **Schlüssel** zurück, nie `undefined` — darum
greift `t(k) ?? 'deutsch'` **nie**. Immer `tOr(key, fallback)` benutzen.

Und: der Katalog kommt asynchron. Wer einem Element, das der Code selbst
beschriftet, zusätzlich ein `data-i18n` gibt, bekommt einen Wettlauf, den der
Katalog gewinnt — die Ansicht steht dann in einem Zustand und trägt die
Beschriftung des anderen. Auf `pages/gruppe.html` hält ein Test sechs solche
Elemente frei, `dev/alte-seiten-i18n.test.mjs` die älteren Seiten — auf dem
Tracker stand genau dieser Fehler bis v.35.29.0 („Noch keine Aufgaben
erledigt." über dem echten Stand).

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

**Den Kopf färbt das Kit, nicht die Seite.** Navy am Handy, hell am Laptop.
Die Maturaarbeit färbte ihren Kopf bis v.35.34.0 selbst navy — am Laptop war
ihr Titel damit Navy auf Navy und unsichtbar.

**Keine Browserfenster.** `prompt()`, `confirm()` und `alert()` sind
ersetzt durch `frage()`, `eingabe()`, `meldung()` aus `dialog.js`.
`gruppe-erstellen.test.mjs` hält die Gruppenseite frei davon.

**Das n im Wortzeichen hat eine Farbe,** `--firn-n`, auf jedem Grund —
keine Fassung für die Leiste, keine für Dunkel. Bis v.35.29.0 waren es drei
(Blau, Alpenglühen, Weiss), weil Blau gegen Navy und helles Glühen gegen
Weiss nicht trägt. `marke.test.mjs` rechnet die Kontraste nach.

Die Leiste lässt sich auf 72 Pixel einklappen (eine Zahl: `--leiste`). Der Zustand hängt am **Gerät**
(`localStorage['firn.leiste']`), nicht am Konto — wer am grossen Bildschirm
aufgeklappt arbeitet und am kleinen zu, will genau das.

Die Falle steckt im `overflow`. Die Leiste braucht `overflow-y: auto`, sonst
sind bei kurzem Fenster die unteren Einträge unerreichbar. Ein
`overflow: visible` im selben Block — verlockend, wenn etwas aus der Leiste
ragen soll — überschreibt das lautlos: kein Fehler, nur kein Scrollen mehr.
Genau das ist einmal passiert. Deshalb sitzt der Klappknopf **in** der
Leiste. `dev/navigation.test.mjs` hält beide Hälften fest.

**8. Jeder Abstand kommt aus der Skala — im Kit und in den Seiten-Stilen.** padding, margin und gap ab
4 Pixeln nehmen `--s1`…`--s7`; `clamp()` bleibt frei, unter 4 Pixeln ist
Geometrie. Bis v.35.23.0 standen 137 freie Pixelwerte in `kit.css`, bis
v.35.28.0 weitere 273 in `feature/*.css`. `dev/css-token.test.mjs` hält beides
fest. Wer umrechnet, misst vorher und nachher Element für Element — nicht
nach Augenmass.

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

Ein Plan gilt für alle oder für **einen** Athleten (`fuer`) — die Excel des
Kaders ist meist pro Athlet. Die Leitung sieht alle Pläne und öffnet auch
die Einheiten eines Athleten; der Player ist dann eine **Ansicht**: er zeigt
das Protokoll des Athleten und schreibt nichts. Er liest den Plan direkt
(`ladePlan`), die Regel entscheidet. Bis v.35.40.0 holte er ihn über die
Abfrage eines Athleten und fand den Plan der Leitung nie — ein Test verlangte
genau diese Zeile wörtlich.

**Die Woche ist ein Kalender** (v.35.42.0), senkrecht wie bei Spond: oben
`‹ Datum – Datum ›` zum Blättern und „Heute", darunter jeder Tag mit seinen
Terminen und Einheiten; leere Tage sind eine Zeile. Termine und Plan stehen
auf der Gruppenseite nicht mehr in zwei Abschnitten, sondern in einem
(`secWoche`); die Leitung hat an jedem Tag ein „+" für einen Termin an genau
diesem Tag und oben die Wahl, WESSEN Woche („Alle in der Gruppe" oder ein
Athlet mit eigenem Plan — dann auch sein Fortschritt). Pläne liegen über das
Datum ihrer Tage im Kalender (`agendaTage` in `wochenplan.js`); dieselbe
Woche zweimal eingelesen: der neuere gewinnt. Geöffnet wird die Woche, in
der etwas steht (`startWoche`) — eine Excel von KW 31 im September öffnet
in KW 31. Der Kopf nennt die Woche so, wie die Excel sie nennt: die
Kadervorlage zählt nicht nach ISO (3.–9. Aug. 2026 heisst dort KW 31, nach
ISO 32), und eine selbst gerechnete Zahl daneben wäre eine zweite Wahrheit.
Im Bereich Training dieselbe Woche aus allen Gruppen; ein Termin führt mit
`gruppe.html?g=&termin=` in seine Gruppe.

**Mehrere Excel auf einmal** (v.35.43.0): die Leitung wählt die Dateien der
Woche zusammen, Firn liest aus jeder den Namen („Name: Van Zanten Timothy")
und schlägt das Mitglied vor, das so heisst (`assets/js/zuordnung.js`:
Reihenfolge egal, Umlaute als ae/oe/ue, „Timo" passt zu „Timothy"). Passen
zwei gleich gut oder niemand, bleibt die Wahl offen, und veröffentlicht wird
erst, wenn jede Datei jemanden hat — ein Athlet soll nie den Plan eines
anderen bekommen, weil zwei Namen sich ähnelten. Eine einzelne Datei hat
weiter ihre Wochenvorschau; „Für wen" ist dort nur vorgewählt.

**11. Kontaktkarten sehen nur die Leitung und die Person selbst.** Kontakte
von Minderjährigen und ihren Eltern. Die Regel (`get`: Leitung oder man
selbst, `list`: nur Leitung) ist die Sicherung; die Oberfläche fragt gar
nicht erst, wo sie nichts bekommen darf. `gruppe-kontakte.test.mjs` prüft
beides und ist gegengeprüft.

**12. Mehrere Gruppen: ein Merker, ein Ereignis, eine Farbe.** Wer in Kader
und Verein ist, hat EINE aktive Gruppe (`localStorage['firn.gruppe']`, gesetzt
nur über `aktiveGruppeSetzen()`), und die meldet `firn-gruppe` — Leiste und
Gruppenseite schalten darauf um. Gewählt wird über `gruppenwahl.js` (Karten aus
`waehle()` in `dialog.js`): am Laptop „Gruppe wechseln“ unter dem Gruppe-Tab,
am Handy die Karte oben auf der Gruppenseite. Den Tab beschriftet
`gruppeInDerLeiste()` in `shell.js`, nicht mehr `nav.js` — das lief auf der
Gruppenseite gar nicht. Die Farbe einer Gruppe kommt aus `teamFarben()`
(`kalender-teams.js`): im Kalender und im Wechsler dieselbe, und zwei Gruppen
einer Person bekommen nie dieselbe.

Der Kalender zeigt die Termine ALLER Gruppen als eigene Quellen (einzeln
ausschaltbar; gemerkt werden die ausgeschalteten, damit ein neues Team sofort
sichtbar ist). Ein Team-Termin öffnet dort eine Karte mit „Zur Gruppe“;
bearbeitet wird er nur in der Gruppe.

**13. Es gibt EIN Gruppenmodell — die Kalendergruppen sind übernommen.** Bis
v.35.31.0 führte der Kalender eine zweite Verwaltung auf `families`
(Mitglieder, Rollen, Beitrittsanfragen, eigene Links). Jetzt:

- Eine Familie wird zur Gruppe **mit derselben Kennung**
  (`groups/{familyId}`, Art `familie`). Darum gehören die Reisen ohne
  Umschreiben dazu: `trips.familyId` heisst noch so, meint aber **die
  Gruppe** — auch für Gruppen, die nie eine Familie waren.
- Übernommen wird im Browser, beim **Kopf** der Familie, wenn er den Kalender
  öffnet (`uebernahme.js`): Gruppe + Kopf, dann die übrigen Mitglieder
  (Verwaltung → `staff`), dann `families.uebernommen = true`. Nichts wird
  gelöscht, jeder Schritt ist wiederholbar. Bis dahin steht die Familie als
  Quelle mit ihren Reisen im Kalender (`vereinigeGruppen`).
- Die Regeln: `tripGruppe()` = alte Familie **oder** Gruppenmitglied. Und
  eine Gruppe mit der Kennung einer Familie darf **nur deren Kopf** anlegen —
  sonst könnte jemand über eine selbst angelegte Gruppe fremde Reisen lesen.
  `security-model.test.mjs` hält beides.
- Anlegen, Beitreten, Verwalten: nur im Gruppe-Tab. Alte Einladungslinks
  (`?invite=&token=`) führen mit einem Hinweis dorthin.
- **E-Mail-Einladungen** (`memberInvites`, Admin-Bereich) zeigen seit
  v.35.33.0 auf eine Gruppe (`gid`) statt auf eine Familie. Einladen darf,
  wer die Gruppe leitet; „nur Firn“ ohne Gruppe bleibt dem Admin. Beim
  Registrieren entstehen Profil, Mitgliedschaft (`mitglied`, mit dem Code) und
  der Verbrauch der Einladung in EINEM Stapel — die Regel dafür ist
  `einladungsBeitritt()`, weil `isMember()` vor dem Profil noch falsch ist.
  Alte, offene Familien-Einladungen bleiben einlösbar.

## Ausrollen

`main` ist die Live-Seite. Der Arbeitszweig ist `firn`.

```bash
git push origin firn:main
```

**Michel entscheidet, wann.** Nie ungefragt auf `main` pushen.

## Mehrsprachigkeit

Sieben Sprachen: de, en, fr, it, pl, nl, es. **818 Schlüssel** aus elf
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
  Übungsnamen gehören den Nutzern. Ebenso die Vorgaben der Schule in der
  Maturaarbeit (Phasen, Checklisten, Bewertungsraster) — übersetzt ist dort
  nur der Rahmen. Marken (TVZA) und Namen stehen als `data-i18n-vars`, nicht
  im Katalog; `marke.test.mjs` hält den Katalog frei von TVZA.
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
- **Die App ist nie end-zu-end durchgeklickt worden.** 633 Unit-Tests, aber
  kein einziger Lauf gegen echtes Firestore.
- `APP_CHECK_SITE_KEY` ist noch `''` — App Check vorbereitet, nicht scharf.
- Die Anmeldesperre in `assets/js/auth-security.js` ist localStorage-only.
  Bequemlichkeit, **kein** Schutz gegen Brute Force.
- Kein 2FA. SMS braucht Identity Platform (kostenpflichtig).
- **Reste des Familienmodells.** Das Profilfeld `users.familyId` wird nicht
  mehr geschrieben; alte, offene Einladungen in eine Kalendergruppe werden
  noch eingelöst (`invitedAutoJoin`). Die Reisen
  (`trips`, samt Gastzugang) bleiben eine eigene Sammlung neben den
  Gruppenterminen (`groups/{gid}/events`).
- **Regeln ohne Emulator.** Auf dieser Maschine gibt es kein Java; die
  Regeln werden vor dem Ausrollen nur mit `--dry-run` gegen das Projekt
  kompiliert, nicht gegen Testfaelle gefahren. Zuletzt ausgerollt mit
  v.35.32.0 (`tripGruppe()`, Übernahme-Marke an `families`, Schutz der
  Familienkennung beim Anlegen einer Gruppe) — Regeln VOR dem Code.
  v.35.33.0 (Einladungen in Gruppen, `einladungsBeitritt()`), ebenfalls
  Regeln vor dem Code.

## Gewohnheiten

- Deutsch für Kommentare und Commit-Messages. Form:
  `v.35.43.0: <deutsche Zusammenfassung>`, darunter ein Absatz, der das
  **Warum** erklärt — besonders bei Fehlern, die still waren.
- Geheimnisse nie ins Repo: `mailer/.env`, `**/*service-account*.json`,
  `worker/.wrangler/`, `firestore.rules.live`, `*.zip` sind ignoriert.
- **Jede Verhaltensänderung bekommt einen Test in `dev/`.** Ohne
  Typprüfung und ohne Build-Schritt ist die Suite das einzige Netz.
- Findet ein Test einen Fehler, ist meistens der Test im Recht. Wenn nicht,
  gehört in denselben Commit, warum nicht.
