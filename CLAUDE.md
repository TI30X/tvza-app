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

  **Die Marke hängt an der Person, nicht an der Seite** (v.35.53.0).
  Michel: „es sollte für Familie TVZA sein, aber für alle anderen Firn —
  TVZA ist wirklich nur für Familie und Freunde". Wer im TVZA-Kreis ist,
  sieht ÜBERALL TVZA (Zeichen oben links, Tab-Symbol, „— TVZA" im Titel,
  Versionszeile), alle anderen überall Firn. `markeSetzen(imKreis(profile))`
  in `mountRail()` und `setzeKonto()`, gemerkt in
  `localStorage['firn.marke']`, damit die Leiste vor dem Profil schon
  richtig steht; `seiteMarkieren()` in `wechsel.js` schreibt Symbol,
  Titel (samt Entfernen von `data-i18n`, sonst setzt der Katalog „Firn"
  zurück) und Versionszeile; `tabFolgen()` tut dasselbe für die Seite im
  Rahmen. **Warum jemand TVZA sieht, steht nirgends** (Michel: „muss aber
  nirgends stehen") — kein Wort über Preise oder Freigaben in der
  Oberfläche. Zwischendurch, in v.35.52.0, stand überall Firn; davor
  wechselte die Marke mit der Seite.

  **Der Wechsel war sichtbar** (`assets/js/wechsel.js`, v.35.40.0–v.35.51.0): an der
  Grenze Firn ↔ TVZA wird oben in der Leiste der Berg zum T, „Firn" blendet
  zu „TVZA". Seit v.35.51.0 (Michel: „viel deutlicher", dann „less
  intrusive") gleitet dazu oben in der Mitte eine Karte herein — am Handy
  und am Laptop, ohne die Seite abzudunkeln —, das Zeichen verwandelt sich
  darin (700 ms), die Karte wechselt die Farbe mit, und das Zeichen der
  Leiste pulsiert. Zwischen
  zwei Firn-Seiten passiert nichts. Das Zeichen der Leiste ist darum ein SVG
  im Dokument, kein `<img>`. Die Verwandlung rechnet zwischen den Ecken von
  je drei Vierecken; `dev/wechsel.test.mjs` prüft, dass beide Enden genau
  `firn.svg` und `tvza.svg` sind — wer eines der Symbole ändert, muss
  `FORMEN` mitziehen. Die Verwandlung bleibt im Code (`softwareZeigen`)
  und läuft heute nur, wenn sich die Marke einer Person ändert (jemand
  kommt in den Kreis).

- **Der TVZA-Kreis** (v.35.48.0): TVZA ist für Freunde und Familie, nicht
  für jeden, der einem Verein beitritt. Im Kreis ist, wen der Admin
  hineinnimmt (Admin → „Im TVZA-Kreis", Profilfeld `kreis`, das nur der
  Admin schreiben darf, dazu die Liste `kreis/{uid}`). `imKreis()` in
  `firebase-config.js` entscheidet; wer nie entschieden wurde, ist drin,
  wenn er schon einen TVZA-Bereich frei hatte — niemand verliert etwas.
  **Draussen gibt es TVZA nicht**: `allowedModules()` nimmt die
  TVZA-Bereiche weg, Firn ist das Zuhause.

  **Mit einem Link in den Kreis** (v.35.56.0, `kreis-einladung.js`). Michel:
  „Kann ich jemand einfach in TVZA einladen?" Admin → „TVZA-Einladung":
  ein Link für EINE Person, sieben Tage (`kreisEinladungen/{code}`,
  dieselbe kurze Form `?k=<code>` wie für Gruppen). Wer ihn öffnet — neu
  oder schon mit Konto —, kommt in den Kreis: `kreis = true`, alle
  TVZA-Bereiche frei, Food/Watchlist/Projekte gleich eingeschaltet
  (`KREIS_SICHTBAR`, die Maturaarbeit nicht), `kreis/{uid}`. Profil,
  Kreisliste und Verbrauch des Links in EINEM Stapel; die Regel lässt das
  nur mit einem Link zu, der vorher da war, noch gilt und danach weg ist
  (`kreisEinladungVerbraucht`, `tvzaFrei`). `einloesen()` in
  `einladung.js` schaut zuerst, ob ein Code in den Kreis führt, sonst in
  eine Gruppe. Der Hinweis beim Registrieren sagt neutral „Du bist
  eingeladen". `dev/kreis-einladung.test.mjs`.

  **Das „Zuhause" ist weg** (v.35.52.0). Von v.35.48.0 bis v.35.51.0 waren
  Start, Kalender und Chat für den Kreis TVZA (`data-zuhause`,
  `zuhauseMarkieren()`), die Gruppe Firn. Seit v.35.53.0 entscheidet die
  Person (siehe oben), keine Seite. Der Kreis entscheidet weiter, wer die
  TVZA-Bereiche bekommt; auf Start steht für den Kreis zuerst das Eigene
  (mit der Marke „TVZA"), darunter die Firn-Bereiche mit dem Zeichen
  „Firn". `dev/kreis.test.mjs`.

**Nutzungsbedingungen, Datenschutz, Betreiber** (v.35.53.0, neu gefasst in
v.35.70.0): drei Seiten — `nutzung.html`, `datenschutz.html`,
`betreiber.html` —, deutsch und verbindlich, im Fuss jeder Seite und im Fuss
der Startseite verlinkt. Kein Preis (Michel: „muss nirgends stehen"); dass
Kosten eine ausdrückliche Vereinbarung voraussetzen, steht dagegen sehr wohl
da. Es gilt schweizerisches Recht. Offen und bei Michel: Anschrift und
Kontaktadresse auf `betreiber.html` (siehe 32). `dev/nutzung.test.mjs`,
`dev/rechtstexte.test.mjs`.

Die Fusszeilen sagen „Firn — ein Projekt von TVZA". **Betreiber und
technischer Betrieb sind Timothy van Zanten** — nach aussen steht nur
dieser eine Name (korrigiert in v.35.70.1; nutzung.html nannte für den
technischen Betrieb fälschlich einen zweiten). Timos Name steht je Seite **einmal**, als
„betrieben von Timothy van Zanten" (`fuss.betrieben`) in der Fusszeile —
nie nackt unter dem Zeichen, wo er sich wie ein Teil des Logos las
(`dev/marke.test.mjs`).

Version: **v.35.70.2**. Remote: `TI30X/tvza-app`. Arbeitszweig: `firn`.
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

87 Testdateien, **860 Tests**. Das Flag braucht `html-module-syntax.test.mjs`.
Alle grün vor jedem Commit.

**Die App durchklicken, ohne Firebase** (Attrappen-Modus, v.35.45.0):

```bash
node dev/server.mjs --attrappe
```

`http://localhost:4174` — die ganze App mit einem Testkader (Michel leitet,
Timothy und Lea, Termine um heute herum, Timothys KW 31 als Plan). Michel,
Timothy und Anna (Familie, in keiner Gruppe) sind im TVZA-Kreis, Lea nicht
— sie ist dem Kader beigetreten wie jedes neue Konto. Jede
Seite bekommt eine Import-Map, die das Firebase-SDK auf `dev/attrappe/`
umlenkt; alles andere ist der echte Code, auch in den Rahmen von Router und
Einstellungen. Konto wechseln mit `?attrappe-als=timo`, Daten zurücksetzen
mit `attrappeZuruecksetzen()` in der Konsole, Fehler jedes Dokuments stehen
in `window.__attrappeFehler`. Vor dem Sagen „es geht" gehört ein Rundgang
am Handy dazu.

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
(1505 Zeilen). `dev/security-model.test.mjs` und `dev/rules-regression.test.mjs`
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
`feature/oeffentlich/`), der Kalender mit v.35.49.0 (`feature/kalender/`,
von 2500 Zeilen auf 290 — siehe Falle 16). Wer eine Seite umzieht, nimmt sie in `MIGRIERT`
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

**Den Kopf färbt das Kit, nicht die Seite.** Navy am Handy und seit
v.35.52.0 auch am Laptop (Michel: „oben, wieso ist sie weiss?" — neben der
dunklen Leiste las sich der weisse Kopf wie ein Fehler); bis dahin hell am
Laptop.
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

Ersetzt ein neuer Plan einen älteren (dieselbe Person, ein gemeinsamer Tag —
`ersetztePlaene`), fragt Firn NACH dem Veröffentlichen, ob der ältere weg soll
(v.35.44.0). Gelöscht wird nur nach „Löschen"; das Protokoll hängt am Tag,
nicht am Plan, und bleibt.

**Geprüft mit den echten Dateien** (v.35.51.0, Michel: „vor allem, dass das
Übernehmen aus dem Excel einwandfrei funktioniert"): KW 31 und KW 36 in Node
mit derselben SheetJS-Fassung und im Browser über den Upload im Gruppe-Tab —
beide vollständig. Drei Stellen waren es nicht:
eine Zelle, die nur eine Uhrzeit ist („9-11 Uhr" unter „Skiteppich Glarus"),
hängt jetzt am Eintrag darüber (`istUhrzeit`, `item.time` → `zeit` in der
Woche); „??" als Gewicht heisst „bestimmt der Athlet" und ist kein Wert
(`gewichtOffen`); „5_5" steht als „5/5". Die Dateien liegen nicht im Repo
(Name, Bilder, 6 MB); `einheit-timer.test.mjs` hält die Fälle nach.

**Im Player** (v.35.51.0): ein Tipp auf einen Satz bestätigt das Gewicht —
das des Plans, sonst das aus dem Satz davor („12 kg wie davor"), sonst das
vom letzten Mal (`letzteGewichte`, erkannt am Übungsnamen, weil die Nummer
davor jede Woche wechselt). Sagt der Plan „??" und gibt es nichts, öffnet
der Tipp das Feld. Danach läuft die Pause des Plans an („120-180 Sec" →
2:00, +15 s, Überspringen); Übungen auf Zeit („30 Sec pro Seite", 2 Sätze)
haben ihre Uhr, Runde für Runde. Gerechnet wird mit der Endzeit, weil ein
iPhone Intervalle im Hintergrund anhält. Die Leitung sieht im Profil eines
Athleten „Trainiert mit": je Übung die letzten Tage mit Gewicht und
Wiederholungen (`gewichtsVerlauf`) — keine Nachricht, sondern jederzeit
einsehbar. Bis v.35.50.0 lehnte die Regel das Lesen des eigenen Protokolls
an einem Tag ohne Protokoll ab, und der Player lud den ganzen Plan nicht.

**11. Kontaktkarten sehen nur die Leitung und die Person selbst.** Kontakte
von Minderjährigen und ihren Eltern. Die Regel (`get`: Leitung oder man
selbst, `list`: nur Leitung) ist die Sicherung; die Oberfläche fragt gar
nicht erst, wo sie nichts bekommen darf. `gruppe-kontakte.test.mjs` prüft
beides und ist gegengeprüft.

**12. Mehrere Gruppen: ein Merker, ein Ereignis, eine Farbe.** Wer in Kader
und Verein ist, hat EINE aktive Gruppe (`localStorage['firn.gruppe']`, gesetzt
nur über `aktiveGruppeSetzen()`), und die meldet `firn-gruppe` — Leiste und
Gruppenseite schalten darauf um. Gewählt wird über `gruppenwahl.js` (Karten aus
`waehle()` in `dialog.js`). Seit v.35.49.0: am Laptop stehen die Gruppen als
Liste unter dem Tab (der dann „Gruppen“ heisst), ein Klick wechselt, zugeklappt
bleibt „Gruppe wechseln“; am Handy ist der Name der Gruppe im Kopf der Wechsel
(`setShellTitleWahl()` in `shell.js`). Die grosse Karte oben auf der
Gruppenseite ist weg — Michel: zu umständlich für einen Wechsel. Eine weitere
Gruppe anlegen oder mit Code beitreten: leise, als Zeile am Ende der
Gruppenseite und als „+ Neue Gruppe“ in der Liste der Leiste (`?anlegen=1`) —
Athleten brauchen das selten. Bis dahin ging beides nur ohne Gruppe. Den Tab beschriftet
`gruppeInDerLeiste()` in `shell.js`, nicht mehr `nav.js` — das lief auf der
Gruppenseite gar nicht. Die Farbe einer Gruppe kommt aus `teamFarben()`
(`kalender-teams.js`): im Kalender und im Wechsler dieselbe, und zwei Gruppen
einer Person bekommen nie dieselbe.

Der Kalender zeigt die Termine ALLER Gruppen als eigene Quellen (einzeln
ausschaltbar; gemerkt werden die ausgeschalteten, damit ein neues Team sofort
sichtbar ist). Ein Team-Termin öffnet dort eine Karte mit „Zur Gruppe“;
bearbeitet wird er nur in der Gruppe.

**In eine Gruppe trägt nur ihre Leitung ein** (Kopf und Trainer,
v.35.49.0). Für Termine galt das in den Regeln schon (`leadsGroup`); für die
Reisen (`trips`) nicht — jedes Mitglied konnte in jede seiner Gruppen eine
anlegen, ändern, verschieben, löschen. Jetzt `tripLeitung()`; Mitglieder
haken nur Programmpunkte ab (`itineraryDone`). Im Kalender sieht
„Gruppentermin“ und „Reise mit Programm“ nur, wer etwas leitet; wer mehreres
leitet, wählt die Gruppe. Ein Gruppentermin entsteht im Gruppe-Tab
(`gruppe.html?g=…&neu=<tag>` öffnet dort das Formular), nicht mehr als Reise,
die im Gruppe-Tab nie auftauchte.

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

**14. Ein Fehler oben im Modul beendet das ganze Modul — lautlos.** Bis
v.35.44.0 hängte `start.js` einen Zuhörer an `#openSettingsLink`, ein
Element des alten Startmenüs, das v.35.12.0 abgeschafft hatte. Die Zeile
warf, und alles darunter lief über dreissig Versionen nie: der Schliessknopf
der Einstellungen, das Speichern der Modul-Schalter, Teilen, Einladungen,
„Meine Projekte", der Service Worker. Sichtbar war nur, dass „manchmal das
Kreuzchen nicht geht". `dev/seiten-ids.test.mjs` prüft seitdem für jede
Seite, dass jedes Element, das ihre Module ohne `?.` anfassen, im Markup
steht oder vom Modul selbst gezeichnet wird. Wer ein Element aus einer
Seite nimmt, sucht vorher nach seiner ID.

Dieselbe Klasse zur Laufzeit: `mountShell()` löscht jede vorhandene
`.appbar` und baut sie neu. Der Einheiten-Player schrieb bis v.35.45.0 in
`#kopfTitel` aus dem eigenen Kopf der Seite — die Zeile warf, und der
`catch` meldete „Der Plan liess sich nicht laden" (Michels Screenshot; die
Korrektur in v.35.41.0 traf einen anderen, echten Fehler, diesen nicht).
Die Videoanalyse zeigte aus demselben Grund nach der Dateiwahl nie ihren
Player. Titel und zweite Kopfzeile gehen darum über `setShellTitle()` und
`setShellMeta()`. Der Test zählt den Kopf einer Seite, die die Hülle baut,
nicht mit, und die Hülle in `gruppe-harness.mjs` tut jetzt, was die echte
tut — vorher tat sie nichts und verbarg genau diesen Fehler.

**15. Profile sind privat; Namen stehen auf der Karte.** Bis v.35.46.0
durfte jedes Mitglied jedes Profil lesen und alle auflisten — der Chat
zeigte jedem Konto Namen und E-Mail aller Konten, auch Minderjährige aus
fremden Kadern. Seit v.35.47.0:

- `users/{uid}` lesen nur die Person selbst und der Admin, auflisten nur
  der Admin.
- `personen/{uid}` ist die Namenskarte `{ name, aktualisiert }`: jedes
  Mitglied darf eine lesen, deren uid es kennt, **auflisten darf nur der
  Admin** — sonst wäre es wieder die Liste aller Konten. Den Namen liest
  man über `nameVon()` (`personen.js`), nie über das Profil.
- Jede Person schreibt ihre Karte selbst (`eigeneKarte`, aus `nav.js` und
  auf der Gruppenseite, die nav.js nicht lädt); der Admin trägt einmal am
  Tag die fehlenden nach (`kartenNachtragen`).
- Zur Wahl im Chat und beim Teilen stehen die Leute aus den eigenen
  Gruppen (`kontakte()` in `groups.js`), im TVZA-Kreis dazu der Kreis
  (`kreis/{uid}` darf listen, wer darauf steht), im Chat dazu die, mit
  denen man schon schreibt — nur Namen, darunter die Gruppe. Eine
  Freigabe trägt keine `targetEmail` mehr.

`dev/datenschutz.test.mjs` hält Regeln und Oberfläche fest, auch die drei
begründeten Stellen, die ein fremdes Profil anfassen dürfen.

**16. Der Kalender rechnet in Zeiträumen, nicht in Tagen.** Bis v.35.48.0
legte er jeden Eintrag in eine Tabelle je TAG (`eventMap`, `dayProgramMap`):
ein Lager stand viermal in der Liste und als vier Schnipsel im Monat, zwei
Termine um 10 Uhr lagen übereinander, und beim ersten Öffnen fragte er
„Google Kalender oder Outlook?“. Seit v.35.49.0 in `assets/js/feature/kalender/`:

- `eintraege.js` (rein): ein Eintrag ist ein Zeitraum von…bis. `agenda()`
  legt ein Lager EINMAL an seinen Anfang und heute noch einmal („Tag 2/4“),
  eine offene Erinnerung von früher als überfällig zu heute, und zählt freie
  Tage; `monatsWochen()` gibt Balken über Tage in Spuren; `zeitRaster()`
  stellt Überschneidungen nebeneinander.
- `ansicht.js` zeichnet Liste, Monat (am Handy Punkte je Tag, die Einträge
  des gewählten Tags darunter), Tag/3 Tage/Woche — und hängt EINEN Zuhörer an
  die Bühne (`verdrahten`); ein Klick findet seinen Eintrag über die Liste
  des letzten Zeichnens.
- `kalender.js`: Daten, Blätter, Verdrahtung. Am Handy ist die Seite eine
  App: Befehlsleiste fest, nur die Bühne scrollt. Die Liste steht beim
  Öffnen auf heute; ein zweiter Stellversuch nach einem Neuzeichnen darf die
  Liste nicht nach oben reissen (`ziel.isConnected`) — genau das passierte
  im Rundgang.
- Keine Hinweise wie „(optional)“ oder „kann leer bleiben“ an Feldern — was
  nicht verlangt ist, sieht man (Michel). Beispiele („z.B. Malbun“) ja.

Tests: `kalender-eintraege`, `kalender-ansicht` (jsdom), `calendar-groups`.

**17. Termine und Reisen sind EIN Modell** (v.35.50.0). Bis dahin gab es
zwei Dinge für dasselbe: den Termin der Gruppe (`groups/{gid}/events` —
Art, Zusagen, Absage, Unterlagen) und die Reise (`trips` — Programm aus
einer HTML-Seite, Aufgaben, Dateien, Gast-Link). Die Reise stand nie im
Gruppe-Tab, der Termin hatte kein Programm. Michel: „leg Termine und Reisen
zusammen — ohne die Funktionalität der Reise nachzulassen, also die coole
HTML-Option“. Jetzt kann der Termin alles:

- **Programm** (`assets/js/programm.js`, geteilt von Kalender, Gruppe-Tab
  und Gastseite): `programm` am Termin (dieselbe Form wie `itinerary`),
  `planHtml`/`planUrl` als Seite. Eine Seite (einfügen, Datei, Link) liest
  `programmMitSeite()` nach Tagen ein; die Punkte vom letzten Einlesen werden
  ersetzt, von Hand angelegte (und geänderte) bleiben. „Programm öffnen“
  zeigt es gross, „Original ansehen“ die bereinigte Seite (`sicheresHtml()`,
  Rahmen ohne allow-scripts). Das Blatt baut das Modul selbst.
- **Ein Programm wird NICHT abgehakt** (Michel: „um 7:00 sollte es von
  alleine gehen, muss ja nicht durchgestrichen werden“). Vorbei ist, was nach
  der Uhr vorbei ist (`punktVorbei()`, leiser, nie durchgestrichen), der
  nächste Punkt trägt „Als Nächstes“. Die Leitung tippt einen Punkt an und
  ändert ihn (Zeit, Datum, Details).
- **Ändern darf nur die Leitung** — Programm, Seite, Abfahrten, Packliste,
  Unterlagen. Mitglieder ändern am Termin nichts (die Regel hat keinen
  Zweig mehr für sie).
- **Abfahrten** je Person (`abfahrten: { uid: { zeit, ort } }`): die Leitung
  trägt ein („Für alle“ füllt jede Zeile), jeder sieht oben im Termin, im
  Programm und in der Karte des Kalenders „Deine Abfahrt“.
- **Packliste:** die Punkte legt die Leitung an und bearbeitet sie
  (`packliste` am Termin, „Yogamatte, Aussen-Turnschuhe“), abgehakt wird
  für jede Person einzeln (`events/{eid}/gepackt/{uid}`, wie die Zusagen) —
  dort stehen auch Punkte, die jemand nur für sich dazuschreibt. Die alten
  Aufgaben einer Reise werden bei der Übernahme ihre Packliste.
- **Was oft vorkommt**, tippt man nicht jedes Mal neu: im Formular stehen
  die häufigsten Termine der Gruppe zum Antippen (gleicher Titel, Zeit, Ort
  mindestens zweimal), und Titel, Orte und Packpunkte haben Vorschlagslisten
  (`<datalist>`, gefüllt aus dem, was die Gruppe schon hat).
- **Gäste:** `gastToken` am Termin, Link `guest.html?g=&termin=&token=`,
  Zugang `guestAccess/{uid}_{eid}`; die Regel `terminGast()` vergleicht das
  Token bei jedem Lesen. Ein Gast sieht genau einen Termin (`get`, nie
  `list`).
- **Bearbeiten** (gab es für Termine nicht): nur die Leitung, die Art bleibt.
  Dazu Ende am Tag (`bisZeit`), Bemerkung, `.ics` für jeden.

**Die Übernahme** (`reise-uebernahme.js`): wer eine Gruppe leitet,
übernimmt ihre Reisen beim Öffnen von Kalender oder Gruppe — der Termin
bekommt DIESELBE Kennung wie die Reise (`events/{tripId}`), die Aufgaben
werden seine Packliste, die Dateien seine Unterlagen, zuletzt
`trips.uebernommen = true`. Nichts wird gelöscht, jeder
Schritt ist wiederholbar. Weil die Kennung bleibt und der Termin das Token
der Reise trägt, gilt der alte Gastzugang `{uid}_{tripId}` auch für den
Termin: alte Links (`guest.html?trip=`) zeigen ihn. Bis zur Übernahme steht
die Reise wie früher im Kalender (zum Ansehen); eine übernommene nie
doppelt (`sichtbareReisen()`). Der Kalender legt keine Reisen mehr an —
„Gruppentermin“ führt in den Gruppe-Tab.

Tests: `termine-reisen` (Programm, Übernahme, Regeln, Gruppe-Tab),
`gast-seite`.

**18. Der Router lässt Seiten stehen** (v.35.53.0). Michel: „man muss 1,5
Sekunden warten, bis es von Start zu Kalender wechselt, und wenn man zu
Gruppe wechselt, wird die ganze Seite neu geladen — dadurch gehen alle
Animationen verloren". Bis dahin baute `router.js` für jeden Wechsel einen
neuen Rahmen, lud die Seite samt Firebase neu und wartete bis zu sechs
Sekunden auf `routeReady`; die Gruppe stand nicht in `APP_FILES` und kam
als ganze neue Seite. Jetzt:

- Ein verlassener Rahmen wird **geparkt** (`.is-parked`: `visibility:
  hidden`, nicht `display:none` — die Seite darin muss weiter messen
  können) und beim nächsten Besuch sofort gezeigt. Höchstens
  `VORRAT_MAX` geparkte, weg geht der am längsten nicht gesehene
  (`zuVerdraengen`); eine Seite läuft nur einmal (`passenderRahmen`: ein
  Tab nimmt auch die Gruppe, die mit `?termin=` offen war).
- Die vier Tabs lädt der Router nach dem Laden der Reihe nach vor — nur von
  einer Seite des Routers aus (nicht in Einheit/Video) und nicht im
  Datensparmodus —, dazu jeden Link der Leiste, den der Finger berührt. Ein
  neuer Rahmen erscheint spätestens `HOECHSTENS_WARTEN` (700 ms) nach dem
  Laden.
- **Mehrere Dokumente leben nebeneinander.** Darum: der Gruppenwechsel
  erreicht die anderen über das `storage`-Ereignis (`groups.js`); ein
  geparkter Rahmen bekommt `tvza-sichtbar` und trägt
  `html[data-tvza-geparkt]` — der Chat markiert dann nichts als gelesen
  (für den Browser ist ein unsichtbarer Rahmen nicht `hidden`); nur der
  gezeigte Rahmen darf einen Wechsel verlangen.
- Titel und Gruppenwechsel einer Seite im Rahmen gehen über
  `setShellTitle`/`setShellTitleWahl` als `tvza-titel`/`tvza-titel-wahl`
  nach oben, ein Tipp als `tvza-titel-klick` zurück. Die Seite oben
  merkt sich ihren eigenen Kopf (`basisTitel`, `basisTitelWahl`).
- **Nie `location.href` auf eine Seite des Routers** aus einer Seite, die im
  Rahmen laufen kann — das lädt sie IN den Rahmen, ohne `tvzaFrame`, mit
  zweiter Leiste und zweitem Kopf. `window.tvzaNavigate?.(url) ||
  (location.href = url)`. Links auf Seiten ausserhalb (Einheit, Video)
  öffnet die Brücke oben (`window.top`).

Tests: `navigation.test.mjs` („verlassene Seiten bleiben stehen …"),
`calendar-groups`.

**Einmal-Anweisungen gehören nicht in die Adresszeile** (v.35.57.1).
Michel: „beim Neuladen spickt das plötzlich raus" — nach „+ Neue Gruppe"
stand `?anlegen=1` weiter oben, und jedes Neuladen öffnete das Formular
wieder. Die Gruppenseite nimmt `anlegen`, `neu`, `termin`, `g` heraus,
sobald sie sie gelesen hat (`adresseAufraeumen`, nach `mountShell`), und
meldet die saubere Adresse dem Router (`tvzaAdresseErsetzen`, im Rahmen
als `tvza-adresse`); der merkt sie sich auch als Basis, sonst setzte der
Tab sie beim Zurückkommen wieder hinein. Und (v.35.57.2): der Router lädt nie eine Adresse mit
Anweisung im Voraus — der Mauszeiger über „+ Neue Gruppe" lud die Gruppe
sonst MIT dem Formular vor und verdrängte die normale.

**19. Eine Einladung ist ein kurzer Link, der abläuft** (v.35.53.0).
Michel: „ein Link zum Anmelden direkt mit Code, aber gekürzt … wenn jemand
einfach einen Code erhält, fragt er sich WTF … über den Firn-Chat
verschicken, auf Teilen und gleich an mehrere … wichtig ist, dass der Code
mal abläuft, und dass es keine Backends zeigt". Bis dahin: 24 Hexzeichen
ohne Ablauf, nackt in die Zwischenablage.

- `assets/js/einladung.js` (rein): Code aus 8 Zeichen ohne Verwechsler
  (`ALPHABET`, 31 Zeichen, lesbar „K7Q3-M9XP"), Link = Wurzel der App +
  `?k=<code>` — keine Gruppenkennung, kein Dienstname. `codeSauber()`
  nimmt Code, Strich, Kleinschreibung oder den ganzen Link, alte Hex-Codes
  bleiben klein.
- **Ablauf:** `groupInvites/{code}.bis`, 7 Tage (`GUELTIG_TAGE`); die
  Regel lässt beim Anlegen höchstens 15 zu und beim Beitritt nur, solange
  `bis > request.time` — alte Codes ohne `bis` bis zum 15.10.2026. Die
  Leitung darf die Einladungen IHRER Gruppe auflisten (`where gid ==`):
  eine noch gültige wird wieder gezeigt statt neu angelegt, abgelaufene
  räumt sie dabei weg (`gruppenEinladungen`).
- **Gruppe-Tab:** „Leute einladen" → Karte mit Link, Code, „gilt bis";
  Teilen (`navigator.share`, nur `text` — mit `url` setzte iOS den Link
  zweimal), „Im Chat senden" (`mehrere()` in `dialog.js`, an mehrere,
  nur wer noch nicht drin ist; `chat-senden.js` schreibt dieselbe Form wie
  der Chat), Kopieren, Zurückziehen. Der Text nennt die Gruppe und das
  Datum — nie ein nackter Code.
- **Ankommen:** `requireAuth()` merkt `?k=` auf dem Gerät
  (`localStorage['firn.beitritt']`, 14 Tage) und nimmt es aus der Adresse,
  BEVOR irgendein Modul umleitet; wer eingeladen ist und kein Konto hat,
  landet bei `login.html?neu=1` (mit Hinweis, ohne das Feld für
  E-Mail-Einladungen — ein kurzer Code dort wird trotzdem genommen). Nach
  der Anmeldung löst `start.js` den Code ein (nur oben, nie ein
  vorgeladener Rahmen) und führt in die Gruppe. Im Chat wird NUR ein
  Einladungslink der App zum Link (`data-kein-router`), ein Tipp tritt bei.

Tests: `einladung.test.mjs`.

**20. Der Assistent: der Schlüssel liegt nur im Worker** (v.35.54.0).
Michel: „Verwende immer ein tiefes Modell und erlaube jedem Nutzer dreimal
die höhere Stufe … Stelle sicher, dass dieser API-Key NIE öffentlich
irgendwo steht" — „die KI sollte auf Daten des jeweiligen Kontos und nur
des jeweiligen Kontos zugreifen und Termine oder Trainings eintragen,
planen oder übertragen … wie eine fliegende Pille, die überall ist" — „wäre
cool, wenn Gruppen ihren Assistenten benennen und einen eigenen haben".

- **`worker/ki.js`, POST `/ki`:** der Gemini-Schlüssel ist ein Secret des
  Workers (`GEMINI_API_KEY`, `npx wrangler secret put`) — nie im Repo,
  nie in der Website, nie in Firestore. Der Worker prüft das
  Firebase-ID-Token selbst (RS256 gegen die JWKS von Google, `aud`/`iss`
  = Projekt, kein anonymes Konto), zählt in KV (`KI`) je Person und Tag
  (`KI_PRO_TAG` 40, davon `KI_HOCH_PRO_TAG` 3 auf der höheren Stufe) und
  für alle (`KI_ALLE_PRO_TAG`). Modelle: `gemini-flash-lite-latest` tief,
  `gemini-flash-latest` für Deep Thinking (Michel: „the least expensive"
  — nie Pro). **Nur "-latest"-Namen:** am 15.09.2026 scheiterte jede
  Frage mit „Das hat nicht geklappt", das Log des Workers (`npx.cmd
  wrangler tail`) zeigte `gemini 404` — Google hatte
  `gemini-2.5-flash-lite` zurückgezogen. Bei 404 geht der Worker die
  Reihe weiter (`modellReihe`) und fragt zuletzt Google, welche Modelle
  es gibt (`modellAussuchen`: das günstigste, das Text kann, keine
  Vorschau, nie Pro). Ist die hohe voll, antwortet die tiefe und wird
  gezählt. Der Browser kürzt den Kontext auf `KONTEXT_MAX` (12 000
  Zeichen, das Fernste zuerst), der Worker nimmt bis 24 000. Er **liest und schreibt keine Daten**: den Kontext schickt der
  Browser, und aus `functionCall`s werden nur Vorschläge.
- **`assets/js/ki.js` (rein):** `kontextBauen` — nur die eigenen Gruppen,
  deren Termine, eigene Termine und offene Erinnerungen, eine Woche zurück
  bis zwei Monate vor, keine Namen anderer, keine Kontakte, keine
  Zusagen. `aktionPruefen` — ein Vorschlag wird nur, was die Person selbst
  dürfte (Gruppentermin nur mit `leite`, erfundene ids und Daten fallen
  weg, ein Lager behält beim Verschieben seine Länge).
- **`assets/js/ki-pille.js`:** die Pille (am Handy links über der Leiste,
  am Laptop unten rechts), nur im obersten Dokument und nur mit
  Worker-Adresse (`WORKER_BASIS`, in der Attrappe `FIRN_KI_BASIS`); nicht
  in Einheit, Video, Gastseite. Jeder Vorschlag ist eine Karte, geschrieben
  wird erst nach „Eintragen" — mit den Rechten der Person. Danach
  `localStorage['firn.daten']`: der geparkte Kalender lädt neu.
- **Der Assistent der Gruppe:** `groups/{gid}.assistent = { name, anweisung }`
  (`assistentSetzen`, nur die Leitung, Regel `assistentGueltig`: Name
  1–30, Anweisung ≤ 600). Die Pille trägt den Namen der aktiven Gruppe
  („Coach Maxi"), die Anweisung geht mit jeder Frage mit — im Prompt UNTER
  den Regeln. Die Gruppen kennt die Pille aus der Leiste
  (`window.__firnGruppen`, kein zweites Lesen).
- **Zwei Assistenten, zwei Freischaltungen** (v.35.55.0). Michel: „der
  persönliche Assistent sollte sich von der Gruppe unterscheiden — aber wenn
  die Gruppe dafür zahlt, wird ja extra freigeschaltet, auch wenn jemand
  privat für Firn zahlt, oder sowie auch für TVZA". **Dein Assistent** (der
  persönliche, navy): eigene Termine, Erinnerungen, liest die Termine der
  eigenen Gruppen mit, trägt nur für die Person ein; frei für den TVZA-Kreis
  und für wen der Admin ihn freischaltet (`users.ki`, Admin → Benutzer,
  „Persönlicher Assistent"). **Der Assistent der Gruppe** (ihre Farbe, ihr
  Name): kennt nur diese Gruppe, plant ihre Termine (für die Leitung), darf
  erinnern; frei für alle Mitglieder, wenn der Admin die Gruppe freischaltet
  (`groups.ki`, Admin → „Assistent der Gruppen" — die Regel lässt nur den
  Admin `ki` schreiben, und er darf dafür die Gruppen lesen). Die
  Werkzeuge je Assistent stehen EINMAL in `ki.js` (`werkzeugeFuer`), der
  Worker nimmt dieselben. Wer antwortet, entscheidet die Seite (Gruppe →
  der der Gruppe, sonst der persönliche), oben im Gespräch lässt sich
  wechseln, jeder hat sein Gespräch. Ohne Freischaltung keine Pille — warum,
  steht nirgends. Mit `SERVICE_ACCOUNT` prüft der Worker die Freischaltung
  selbst (`freigabePruefen`, `kreisVon` = `imKreis`, vom Test
  verglichen); ohne verlässt er sich auf die Pille. Später ersetzt ein
  Bezahlen das Häkchen des Admins — die Felder bleiben dieselben.
- **Wer den persönlichen hat, hat jede seiner Gruppen** (v.35.58.0).
  Michel sah in der Pille nur „Dein Assistent" — die Freischaltung der
  Gruppe lag im Admin, und er suchte sie nicht dort: „wenn ich in einer
  Gruppe bin, sollte der Wechsel direkt in der Pille stehen". `gruppeFrei()`
  in `ki.js`: `groups.ki` ODER der persönliche ist frei; der Worker
  (`freigabePruefen`) rechnet gleich. Eine Gruppe ohne eigenen Namen des
  Assistenten steht im Wechsel mit ihrem Namen („Familie van Zanten"), nicht
  als zweites „Assistent". Auch den Namen setzen darf die Leitung dann.
- **Deep Thinking** heisst die höhere Stufe (Michel), vorher „Gründlich".
- **Die Trainings aus der Excel** (v.35.59.0). Michel: „am Dienstag,
  8. September steht Sprungprogramm — der Assistent hat keine Ahnung davon
  … müsste in den Kalender". `planEinheiten()` in `wochenplan.js` macht aus
  den Plänen eine Liste mit Datum (der neuere Plan gewinnt, wie in der
  Woche). Die Pille schickt sie als `trainings` mit (`kontextBauen`):
  der persönliche Assistent die Pläne für alle und die eigenen, der der
  Gruppe für die Leitung alle — Einzelpläne zusammengefasst („3 Athleten"),
  nie mit Namen. Der Worker braucht dafür nichts Neues (er reicht den
  Kontext durch).
- **Diktieren** (v.35.59.0): ein Mikrofon neben Senden, die
  Spracherkennung des Browsers (`webkitSpeechRecognition`) — kein Dienst,
  kein Schlüssel; ohne sie (Firefox) kein Knopf. Der Text landet im Feld
  und wird nicht von allein geschickt.
- **Attrappe:** `dev/attrappe/ki.mjs` beantwortet `/__ki-basis/ki` aus
  Mustern (Erinnerung, Training planen, verschieben) — ohne Gemini. BSV ist
  dort freigeschaltet („Coach Maxi"); Lea sieht nur ihn, Michel beide.

Tests: `ki.test.mjs` (Token mit echtem RSA-Schlüssel, Kontingent, Route,
Kontext, Vorschläge, Gruppe-Tab, kein Schlüssel im Repo).

**21. Die Einstellungen sind eine Liste, keine Kartensammlung** (v.35.58.0).
Michel: „das ist ja wohl nicht dein Bestes". Über dem Dialog stand fest
„Firn" (auch für den Kreis) — weg, der Titel reicht. Jede Zeile war eine
Karte in der Karte, die Bereiche standen am Laptop zu zweit, bis „Schliff &
Wachs" abgeschnitten war, die Sprachwahl hatte ein `style=""` und ragte am
Handy hinaus, `.form-hint` hatte **gar keine Regel** (Hinweise in
Textgrösse, auch beim Registrieren), und das Erscheinungsbild war ein ◐, das
man durchtippen musste. Jetzt: je Gruppe eine Karte, darin flache Zeilen mit
Haarlinien, eine Spalte; das Erscheinungsbild drei Knöpfe (`#themeWahl`,
`.seg`, am Handy unter dem Wort), die Rechte beim Teilen ebenso
(`.radio-row`, das Radio liegt unsichtbar darüber). Im Dunkeln trägt eine
gewählte Schiene die Schrift des Hauptknopfs (Weiss auf hellem Blau war
unlesbar — betraf auch die Gruppe). `dev/einstellungen.test.mjs`.

**22. Eine Gruppe verwalten** (v.35.59.0). Michels Rundgang nach dem
Anlegen einer Gruppe:

- **Die Leiste kannte die neue Gruppe nicht**, bis man neu lud. Die
  Mitgliedschaft meldet Firestore sofort, noch bevor der Server den Stapel
  bestätigt; in dem Moment lässt die Regel die Gruppe nicht lesen, und sie
  fiel still aus der Liste. Die Bestätigung ändert nur die Metadaten — die
  kamen ohne `includeMetadataChanges` nie an. Jetzt
  `gruppen-strom.js`: eine nicht lesbare Gruppe macht die Liste
  „unvollständig", die nächste Meldung (auch nur der Metadaten) oder ein
  Versuch nach der Uhr lädt nach; eine gelöschte Gruppe zählt nicht als
  unlesbar (`zuGruppen`). In der Attrappe gibt es keine ausstehenden
  Schreibvorgänge — dort sah man den Fehler nie; `dev/gruppen-strom.test.mjs`.
- **Farbe:** die Leitung wählt sie aus den Kalenderfarben (`groups.farbe`,
  die Regel kannte das Feld immer). Die Seite trägt sie oben als Band
  (`--gruppe-farbe`; seit v.35.68.0 statt des Bands ein Punkt am Namen im
  Kopf, siehe 30), Leiste und Pille ziehen über `firn-gruppe-geaendert`
  mit (die Mitgliedschaften ändern sich dabei nicht). Ein Logo braucht
  Speicher für Bilder — später.
- **Löschen** nur der Kopf, nach einer Frage mit dem Namen
  (`gruppeLoeschen`): die Gruppe, dann Kontaktkarten, offene Einladungen
  und die anderen Mitglieder, zuletzt die eigene Mitgliedschaft — die Regel
  lässt den Kopf erst gehen, wenn die Gruppe weg ist. Termine und Pläne
  bleiben in Firestore, lesbar für niemanden mehr.
- **Die Liste nach Funktion:** „Trainer" und „Athleten" (je Art eigene
  Wörter, `leitungen`/`mitgliederPl` in `WORTE`) mit Zahl; unter dem
  Namen steht die Funktion nur noch beim Kopf. „E-Mail an alle" steht in
  der Kopfzeile der Liste statt als breiter Knopf darunter.
- **Im Kalender** stehen die Einheiten der Pläne (`ausTraining`, Art
  `training`): ohne Uhrzeit mit „Vormittag"/„Nachm." statt „ganztägig",
  ein Tipp öffnet den Player am geplanten Tag, „Zurück" führt in den
  Kalender (`RUECKWEGE.kalender`). Nur die Pläne für alle und die eigenen.

Tests: `gruppe-verwalten`, `gruppen-strom`, `trainings-assistent`.

**Die Einstellungen der Gruppe sind eine eigene Ansicht** (v.35.60.0).
Michel: „das sollten gruppenspezifische Einstellungen sein, in den
Einstellungen vergraben — nicht so öffentlich, man kommt sehr schnell
durcheinander". Farbe, Kalender der Gruppe, Assistent, Kalender-Abo und
Löschen stehen in `#secGruppeEinst` (mit Zurück), erreichbar über eine
leise Zeile im Gruppe-Tab und aus den Einstellungen der App („Deine
Gruppen", nur wer etwas leitet): `gruppe.html?g=…&einst=1`, die
Einstellungs-Ebene führt über `tvza-settings-gehe` hin (nur Adressen der
eigenen App). Offen bleibt die Ansicht auch, wenn eine Meldung die Seite
neu zeichnet (`inEinst` in `zeichne()`). **„Für wen" bei einem Plan:
„Mehrere Personen …"** — derselbe Dialog wie im Chat (`mehrere()`, jetzt
mit vorab angehakten), und jede Person bekommt ihren eigenen Plan. Ein
Plan gilt weiter für alle oder für einen: Regeln, Woche und „der neuere
gewinnt" bleiben. `dev/gruppe-einstellungen.test.mjs`.

**23. Mehrere Kalender** (v.35.60.0, `kalender-quellen.js`). Michel: „die
Gruppe soll mehrere Kalender erstellen können … auch persönlich … zwischen
Trainings, Trainingslager und Rennen unterscheiden — Rennplan". Jede
Quelle hat einen Schlüssel, ausgeschaltet wird eine Menge davon (gemerkt im
Gerät; das alte `{ personal, teamsAus }` gilt weiter): `p` Persönlich,
`pk:<id>` eigene Kalender (`users/{uid}/kalender`, der eigene Termin trägt
`kalender`), `r` Erinnerungen, `g:<gid>` die Gruppe als Ganzes, darunter
`g:<gid>:art:<art>` — die **Arten der Termine** (Training, Lager, Rennen;
bei der Familie Termin, Reise), nichts anzulegen —, `g:<gid>:k:<id>`
Kalender, die die Leitung anlegt (`groups/{gid}/kalender`, der Termin trägt
`kalender`, im Formular „Kalender"), und `g:<gid>:plaene`. Ein Termin in
einem gelöschten Kalender fällt zurück unter seine Art bzw. „Persönlich" —
nichts verschwindet. Am Laptop die Liste eingerückt in der Seitenleiste,
am Handy dieselbe im Blatt „Kalender" und oben Knöpfe für das Eigene und
die Gruppen. Export nimmt dieselben Quellen. `dev/kalender-quellen.test.mjs`.

**24. Formatierter Text** (v.35.60.0, `formatierung.js`). Michel: „das
Formatieren der KI … nimmt ** nicht wahr" und „sollte auch vom Chat
verstanden werden". Erst wird ALLES maskiert, dann kommen fett, kursiv,
Code, Überschrift, Listen (eine Stufe eingerückt) und Absätze dazu — nie
ein Link, ein Bild oder ein Attribut aus dem Text. Die Pille formatiert nur
die Antworten des Assistenten; der Chat jede Nachricht, seine
Einladungslinks entstehen im schon maskierten Text (`inline`). Achtung:
im Quelltext stehen Platzhalter als `\uE000` und der Backtick als `\x60`
— ein echtes Steuerzeichen oder ein Backtick im regulären Ausdruck
brachte `aufrufe.test.mjs` durcheinander.

Dazu in dieser Runde: **die Glocke** blendet jede Meldung mit × aus
(`tvza-notif-weg`, im Gerät) — Michel: „die Nachricht von der
Maturaarbeit … kommt immer wieder"; die Matura-Meldungen hängen am
Abgabedatum, ein neues Datum ist eine neue Meldung. Und **die Knöpfe oben
im Assistenten** schrumpfen nicht mehr (`flex: none`): ein langes Gespräch
drückte sie am Handy zusammen, samt eigenem Scrollbalken.

**25. Der Chat hat drei Arten Unterhaltung** (v.35.61.0,
`chat-modell.js` rein, `chat-stand.js` mit Firebase). Michel: „Gruppenchats
und zusätzlich immer einen Chat für jede Gruppe … Tags wie beim Eintragen
von Terminen beim KI-Assistenten — oder gleich von der KI beim Eintragen
versendet … bestimmte Chats stummschalten".

- **Zu zweit** wie bisher (`dms/{a__b}`). **Gruppenchat** (`art: 'runde'`):
  `dms/{zufall}`, 3–30 Leute, ein Titel; wer drin ist, steht beim Anlegen
  fest (die Regel verbietet, `participants` zu ändern, und eine Runde kann
  keine Kennung `a__b` belegen). **Der Chat jeder Gruppe**:
  `groups/{gid}/chat`, lesen und schreiben alle in der Gruppe (`inGroup`),
  dazu `chatMeta/letzte` für Liste und Punkt — wie viele neu sind, weiss
  niemand, ungelesen ist ein Punkt.
- **Stumm und gelesen** stehen unter `users/{uid}/chat/{d_<id>|g_<gid>}`,
  nur die Person selbst. Stumme Chats zählen nicht am Tab (`nav.js`) und
  nicht an der Kachel auf Start — beide nehmen `beobachteUnterhaltungen` +
  `ungelesenGesamt`, eine Rechnung für drei Stellen.
- **Termin-Karten** (`termin` an der Nachricht, `terminKarte`): nur, was
  jede Person im Chat sehen darf — keine Notiz, keine Abfahrten, kein
  Gasttoken. „Zum Termin" nur, wer in der Gruppe ist. Im Chat teilt man
  sie über den Kalender-Knopf neben dem Feld. **Der Assistent** schickt
  eine Karte in den Chat der Gruppe, sobald er dort etwas einträgt oder
  verschiebt (`imChatAnkuendigen`, geschrieben von der Person, die
  bestätigt; scheitert der Chat, bleibt der Termin).
- In einer offenen Unterhaltung tritt die Pille zurück
  (`body.chat-offen` im obersten Dokument) — sie lag am Handy über dem
  Eingabefeld.
- Der Chat ist weiter ein Inline-Modul in `pages/messages.html` (nicht
  umgezogen, Falle 4) — viele Tests lesen ihn als Text.

`dev/chat-gruppen.test.mjs`.

**Wem schreiben — und finden über die Adresse** (v.35.62.0). Michel: „beim
Gruppenchat sollten nicht einfach alle Leute aufgelistet sein … die, die
schon mit dir schreiben, und die Leute in deiner Gruppe … und man sollte
die E-Mail eintragen können, dann zeigt sich der Name". Die Auswahl zeigt
nur noch die eigenen Gruppen und die, mit denen man schreibt (der
TVZA-Kreis nicht mehr); wer eine Adresse eintippt, findet das Konto über
`emailKarten/{sha256 der Adresse}` = `{ uid, name }`. Jede Person legt
ihre Karte selbst an (`eigeneKarte` → `eigeneEmailKarte`); die Regel
prüft mit `hashing.sha256(request.auth.token.email.lower())`, dass die
Kennung wirklich die eigene Adresse ist, lesen darf nur, wer die Adresse
kennt (`get`, nie `list`). Die Adresse selbst steht nirgends. Ein Fenster
für beides: zu zweit (ein Tipp öffnet) oder Gruppenchat (Häkchen, „Weiter
(n)" ab zwei). `dev/chat-suche.test.mjs`.

**Die Tastatur am Handy** (v.35.62.0). Michel: „auf dem Handy verschwindet
die Textbox, wenn man die Tastatur ausfährt". Das iPhone schrumpft die
Seite nicht (`interactive-widget` kennt es nicht), es legt die Tastatur
darüber; der Rahmen des Routers und das Blatt des Assistenten endeten
hinter ihr. Und stand der Fokus im Rahmen, wusste die Seite oben nichts
davon. Jetzt meldet `watchKeyboard` (nav.js) `kb-open` auch nach oben,
oben zählt ein Fokus im Rahmen, und `syncShellBounds` (router.js) nimmt
als Unterkante die Überdeckung `innerHeight − visualViewport.height −
offsetTop`, dazu `--vv-hoehe` für die Höhe des Blatts.

**Keine lesbare Gruppe ist nicht „keine Gruppe"** (v.35.62.0). Michel: „auf
dem Handy ist die Gruppe meiner Familie, auf dem Laptop nicht — dasselbe
Konto", und am Laptop warf ein Wechsel auf „Noch in keiner Gruppe". Im
Attrappen-Modus nie zu sehen. Vermutete Ursache: am Laptop lädt der Router
alle Tabs vor, jeder Rahmen hat seine Firestore-Instanz auf EINEM
gemeinsamen Speicher (`persistentMultipleTabManager`); ein veralteter
Speicher oder ein „offline" beim Lesen einer Gruppe liess Gruppen aus der
Liste fallen. Jetzt: `beobachteMeineGruppen` fragt einmal direkt beim
Server (`getDocsFromServer`), `ladeGruppe` fällt auf den Speicher zurück,
und die Gruppenseite zeichnet eine leere, unvollständige Liste nicht als
„Noch in keiner Gruppe". Die Seite selbst ist neu gestaltet (`.grp-leer`:
Zeichen, Satz, zwei Karten).

**Die Ursache war die zweite Liste** (v.35.63.0). Michels Bildschirm: links
in der Leiste „TEST" und „Test 2", daneben die Gruppenseite mit „Noch in
keiner Gruppe" — wechseln half nicht. Die Leiste hört in der obersten
Seite, die Gruppenseite im Rahmen mit ihrer eigenen Firestore-Instanz, und
die lieferte am Laptop eine leere Liste. Jetzt gibt es EINEN Zuhörer: die
oberste Seite legt `window.__firnGruppenQuelle` an (`gruppenQuelle` in
groups.js), jeder Rahmen hängt sich an (`abonnieren`, beim `pagehide`
wieder ab) — Gruppe, Kalender, Chat und Training sehen, was die Leiste
sieht. Nur wo oben noch keine Quelle ist, hört eine Seite selbst; ein
Rahmen legt nie eine ab (sie stürbe mit ihm). Ein Fehler des Zuhörers
leert eine bekannte Liste nicht. Die Listen stammen aus dem obersten
Dokument: `Array.isArray`, nie `instanceof Array`.

**Admin** ist, wer im eigenen Profil `isTimo: true` hat — setzen kann das
nur ein Admin (Admin → Benutzer → „Admin") oder die Firebase-Konsole,
nie die Person selbst (Regel beim Anlegen und am eigenen Profil). Eine
Regel, mit der sich ein Konto über den Hash seiner Adresse selbst zum Admin
macht, wurde verworfen: sie weicht genau diesen Schutz auf. **Der Weg
dorthin** steht im Kontomenü („Admin", nur mit `isTimo`, v.35.63.1) — Start
nimmt den Admin aus der Bereichsliste, und bis dahin führte für ein
Admin-Konto kein Link mehr zu `pages/admin.html`. `dev/admin-weg.test.mjs`.

**26. Das Trainingsprotokoll wird je Übung geschrieben** (v.35.64.0).
Michel: „Fortschritt vom Handy kam nicht auf den PC, Notizen sind
verschwunden". Im Code belegt waren zwei Ursachen: `protokollSpeichern`
schrieb mit `set()` das GANZE Protokoll des Tages — ein zweites Gerät, das
die Einheit mit altem Stand offen hatte, schrieb beim nächsten Tipp über
alles, was das erste eingetragen hatte —, und gespeichert wurde 900 ms nach
der letzten Eingabe, ohne `pagehide`: wer vorher „Zurück" tippte, verlor die
letzte Eingabe (oft die Notiz). Ob Michels verlorene Einträge noch
irgendwo liegen, lässt sich von hier nicht prüfen (kein Zugriff auf die
echten Daten); was überschrieben wurde, ist weg.

- Jeder Eintrag einer Übung trägt `stand` (ms). `protokollAbgleichen`
  (groups.js) schreibt in einer **Transaktion** nur die geänderten Übungen
  und nur, wo der Server nicht neuer ist (`aenderungenPruefen`, einheit.js);
  eine geleerte Übung bleibt als `{ stand }` stehen, damit ein älteres
  Gerät sie nicht zurückbringt. Die Kennung bleibt `uid__datum` (Regeln,
  Trainerzugriff, alte Daten), der Plan steht an der Einheit (`plan`) — ein
  korrigierter Plan derselben Woche setzt den Fortschritt nicht zurück.
- **Das Gerät hält, was noch aussteht** (`protokoll-sicherung.js`,
  `localStorage['firn.protokoll.offen']`): synchron bei jeder Änderung,
  weg erst nach der Bestätigung genau dieses Stands. Der Player schickt es
  beim Öffnen, die Leiste beim Start der App (`offenesNachtragen` in
  shell.js — nicht nav.js, das Gruppe, Training und Einheit nicht laden).
  Offline scheitert die Transaktion, oben steht „Noch nicht synchronisiert".
- Sofort gespeichert wird beim Übungswechsel, „Übung erledigt", Verlassen
  und Wegschalten der App; sonst nach 900 ms. `beobachteProtokoll` zeigt
  live, was ein anderes Gerät einträgt; wer gerade tippt, wird nicht neu
  gezeichnet. Die Leitung sieht in der Ansicht „Zuletzt synchronisiert".
- **Ein Satz trägt seinen Haken selbst** (`ok`). Die grosse Fläche hakt ab
  (mit der Vorgabe), ein zweiter Tipp nimmt zurück (die Werte bleiben); der
  Stift daneben öffnet „Wiederholungen × Gewicht" (+ Körpergewicht, Dauer,
  Strecke, wo die Übung davon spricht) und hakt nichts ab. Alte Protokolle
  ohne `ok` zählen wie früher. „Übung erledigt" hat ein Rückgängig.
- **Zwei Notizen:** „Notiz für die Leitung" im Protokoll, „Nur für mich"
  unter `users/{uid}/trainingLogs/{datum}` (owner-only, Regel seit jeher).
- **Die Pause:** ein Bereich („180-240 Sec") hat beide Längen zur Wahl
  (`pauseBereich`), dazu Anhalten/Fortsetzen, +15 s, Neu starten,
  Überspringen; eine Uhr, mit der Endzeit gerechnet, übersteht Übungswechsel
  und Neuladen (`sessionStorage`). Wer den Satz zurücknimmt, beendet seine
  Pause.
- **Direkt in die Einheit:** aus der Woche öffnet der Player die Einheit
  des Tages; hat der Tag mehrere, stehen nur diese oben zum Umschalten
  (`einheitenAmTag`, wochenplan.js). „Einheit wechseln" gibt es nur noch
  ohne Tag.
- Attrappe: `runTransaction`, offline mit `window.__attrappeOffline = true`.
  Zwei Tabs sind zwei Geräte (BroadcastChannel).

`dev/protokoll-sync.test.mjs`, `einheit-seite`, `einheit-timer`.

**27. Die Leitung sieht den Fortschritt, Pläne gehen an Angehakte, Vorlagen**
(v.35.65.0).

- **Fortschritt der Athleten** (Gruppe-Tab, nur Leitung, `#secFortschritt`):
  je Tag (‹ › Heute) und Athlet die Einheiten aus dem Plan
  (`fortschrittZeilen` in wochenplan.js: der neueste Plan je Person und der
  neueste für alle, ein Plan für alle gilt für die, die nicht leiten), dazu
  Abgeschlossen/Begonnen/Nichts synchronisiert, „n/m Übungen · n/m Sätze",
  die Notizen für die Leitung und „synchronisiert HH:MM". Aus denselben
  Protokollen wie der Player (`beobachteProtokolleAm`, live; die Regel lässt
  nur die Leitung auflisten). Scheitert das Laden: „Unbekannt", nie „nicht
  trainiert". Ein Tipp öffnet die Einheit des Athleten als Ansicht — bei
  einem Plan für alle mit `&a=<uid>` (einheit.js), sonst sähe die Leitung
  ihr eigenes Protokoll.
- **Für wen:** „Mehrere Personen …" zeigt Häkchen im Formular (eine,
  mehrere, „Alle auswählen" = alle, die jetzt da sind, je ein eigener Plan).
  „Alle in der Gruppe" ist der eine Plan für alle — auch für Künftige. Vor
  dem Veröffentlichen steht „Geht an …", der Knopf sagt „An n Personen
  veröffentlichen". Scheitert einer, gehen die anderen trotzdem, und es
  steht da, für wen nicht; nur die bleiben gewählt.
- **Vorlagen** (`groups/{gid}/vorlagen`, nur Leitung): „Auch als Vorlage
  speichern" beim Einlesen einer Excel, „Oder aus einer Vorlage" + „Woche ab
  (Montag)" im Formular. Der Plan bekommt eine **Kopie**, auf die Woche
  gelegt (`vorlageAufWoche`: Tage nach mo…so, KW und Wochenname fallen
  weg — keine selbst gerechnete zweite Zahl). Vorlage, Plan und Protokoll
  sind drei Dokumente; eine geänderte Vorlage ändert nichts Veröffentlichtes.
- Im Profil eines Athleten „9 × 60 kg" wie im Player.

`dev/gruppe-einstellungen.test.mjs`.

**28. Start ist nie leer — der Überblick** (v.35.66.0). Michel: ein
Athlet in einer Gruppe sah „Keine Bereiche aktiviert" und sonst nichts, und
die Karte mit den wichtigen Infos „erscheint nur selten". Belegt: die
Tageskarte (heute.js) wartete 1,2 s auf die eigenen und höchstens 0,9 s auf
die Termine der Gruppen, was später kam, fiel weg und wurde nie
nachgezeichnet; sie zählte nur heute (am Abend morgen), und Trainings aus
den Plänen kamen nicht vor.

- `#ueberblick` oben auf Start, für jedes Konto
  (`feature/start/ueberblick.js` lädt und zeichnet, `ueberblick.js`
  entscheidet rein): **Heute/Morgen** — Trainings aus den Plänen mit dem
  eigenen Fortschritt (Tipp → Player), Termine samt Notiz, Absagen im
  Fenster, neue Pläne (drei Tage), überfällige Erinnerungen —, darunter
  **Demnächst** (14 Tage). Kompakt: fünf plus drei, der Rest im Kalender.
  Nichts Vergangenes, nichts Abgehaktes. Alle Quellen nebeneinander
  (`Promise.allSettled`), keine Frist; neu gezeichnet, sobald etwas kommt,
  bei `online`, bei `firn.daten` und alle fünf Minuten.
- **Vier Zustände:** lädt / offline / gescheitert (mit „Erneut laden") /
  nichts geplant — nie dieselbe leere Fläche. Eine leere, unvollständige
  Gruppenliste ist „lädt", nicht „keine Gruppe".
- **Deine Gruppen** als Plättchen in ihrer Farbe; **ohne Gruppe** zwei
  Wege hinein (`gruppe.html?anlegen=1`, `?beitreten=1` → `codeEinloesen`).
- **Der Assistent, den man hat:** je Assistent eine Zeile („Coach Maxi
  fragen · Assistent von «BSV»"); die Liste kommt von der Pille
  (`window.__firnAssistenten`, `firn-ki-liste`), geöffnet wird über
  `firn-ki-oeffnen`. Für Athleten gilt, was vorher galt und jetzt geprüft
  ist: den Assistenten einer Gruppe hat, wer in einer freigeschalteten
  Gruppe ist (`gruppeFrei`), er sieht nur diese Gruppe, darf erinnern und
  fragen, einen Gruppentermin trägt nur die Leitung ein (`aktionPruefen`).
- Die Hinweiskarte (hints.js) bleibt, mit einem leisen Info-Zeichen statt
  des orangen „n" (Michel: „dezent, passend zum blauen Design"). Die
  Kalenderzeile in „Heute" ist weg — sie stand im Überblick schon.
- **Babelek** (Punkt 7): eine Gruppe, die im Assistenten stand, fehlte in
  der Leiste. Vermutete Ursache (ohne Zugriff auf Michels Browser nicht
  bewiesen): der Speicher des Laptops hielt für `groups/{familyId}` noch
  „gibt es nicht" aus der Zeit vor der Übernahme (Falle 13, dieselbe
  Kennung), `zuGruppen` nahm das als gelöscht und fragte nie wieder; die
  Pille fragte später, mit Netz. Jetzt fragt ein „gibt es nicht" aus dem
  Speicher den Server (`getDocFromServer`), ohne Antwort ist die Gruppe
  unbekannt und die Liste unvollständig (wird nachgefragt). Nichts wird
  angelegt, verschoben oder gelöscht; Mitglieder, Rollen, Termine, Chats
  bleiben, wie sie sind.

`dev/start-ueberblick.test.mjs`.

**29. Chat: Sag Hallo, Nachrichten über den Assistenten, Suche** (v.35.67.0).

- **„Sag Hallo"** in einer leeren Unterhaltung ist ein Knopf: er setzt
  „Hallo Anna! 👋" (im Gruppenchat „Hallo zusammen!") ins Feld und
  fokussiert es; gesendet wird erst mit „Senden" (`halloEinsetzen`). Bis
  dahin stand dort ein Text, der wie ein Knopf aussah.
- **Nachricht über den Assistenten** (Werkzeug `nachricht_senden`, beide
  Assistenten): nur auf ausdrücklichen Wunsch. Der Assistent gibt Empfänger
  (wie genannt) und Text zurück — Namen anderer kennt er weiter nicht; der
  Browser löst sie gegen die eigenen Gruppen und Chats auf
  (`nachricht-ki.js`: Teile, gross/klein, ä = ae, genauer Treffer vor
  ungefähren, zwei Leas → Wahl mit Gruppe; der Assistent einer Gruppe nur
  in ihr). Die Karte zeigt An, Von („… (du)"), den vollen Text;
  Bearbeiten, Abbrechen, Senden. Gesendet wird genau der gezeigte Text,
  einmal (kein Knopf, solange es läuft; wer schon angekommen ist, bekommt
  beim erneuten Senden nichts doppelt), mit `nachrichtSenden` bzw.
  `gruppenNachricht` — denselben Wegen und Regeln wie im Chat. „Gesendet"
  steht erst, wenn der Server es hat; offline „Noch nicht gesendet …";
  scheitert jemand, steht es da. „Zum Chat mit …" öffnet die Unterhaltung
  (`messages.html?to=` bzw. `?gruppe=`). Attrappe: „Schreib Lea: …".
  **Braucht den Worker** (Deklaration in `worker/ki.js`) — ausgerollt am
  16.09.2026; ohne ihn kennt Gemini das Werkzeug nicht, sonst ändert sich
  nichts.
- **Suche** (`bekannte.js`): „Mueller" findet „Müller", mehrere Wörter in
  beliebiger Folge; Gruppen beim Namen (zu zweit: ihr Chat; im Gruppenchat:
  alle ihre Leute anhaken). Die Adresse findet weiter über `emailKarten`,
  eine Suche über alle Konten gibt es nicht. `kontakte()` nimmt die
  Gruppenliste der Leiste (`gruppenJetzt`), sonst blieb „Wem schreiben?"
  im Rahmen am Laptop leer.

`dev/chat-ki-nachricht.test.mjs`.

**30. Gruppen: eigene Reihenfolge, Farben der Arten, kein Band** (v.35.68.0).

- **Reihenfolge je Person** (`gruppen-folge.js` rein): Einstellungen →
  „Deine Gruppen" zeigt ALLE Gruppen mit Griff (ziehen per Pointer, mit
  Finger und Maus; auf dem Griff auch Pfeil hoch/runter) und Pfeilknöpfen;
  wer leitet, kommt von dort in die Einstellungen der Gruppe. Gespeichert
  im Gerät (`localStorage['firn.gruppenFolge']`) und unter
  `users/{uid}/einstellungen/gruppen` (`gruppenFolgeSetzen`). Die
  gemeinsame Liste (`gruppenQuelle`) und `meineGruppen` ordnen danach
  (`geordnet`, `unvollstaendig` bleibt), neu geordnet bei `storage`,
  `firn-gruppen-folge` und Meldungen des Servers — Leiste, Wähler,
  Kalender (`vereinigeGruppen` sortiert nicht mehr nach dem Namen), Chat,
  Pille und Start. Eine neue Gruppe kommt hinten dazu, nach dem Namen.
  Farben hängen an der Kennung (`teamFarben` sortiert selbst) — Ordnen
  färbt nichts um. Ohne Regel bleibt die Folge im Gerät, und dort steht es.
- **Farben der Arten** (`groups.artFarben`, nur die Leitung, in den
  Einstellungen der Gruppe unter der Gruppenfarbe, je Art „wie die Gruppe"
  oder eine der Kalenderfarben). Im Kalender gilt: Kalender der Gruppe >
  Art > Gruppe, in der Quellenliste ebenso; die Gruppe steht weiter in der
  Zeile jedes Eintrags (`quelle`) und in seiner Karte. Bestehende Farben
  bleiben, wie sie sind — ohne `artFarben` ändert sich nichts.
- **Kein Band mehr** über der Gruppenseite; die Farbe steht als Punkt vor
  dem Namen im Kopf (`setShellTitleFarbe` → `tvza-titel-farbe` →
  `titelFarbeSetzen` im Router, wie Titel und Wahl). Die aktive Gruppe
  erkennt man am Namen im Kopf und an der Auswahl in der Leiste.

`dev/gruppen-folge-farben.test.mjs`.

**31. Die Tastatur misst jede Seite selbst** (v.35.69.0, `tastatur.js`).
Michel, mit einem Bild aus Samsung Internet: „auf dem Handy verschwindet die
Textbox, wenn man die Tastatur ausfährt“ — obwohl v.35.62.0 genau das gelöst
hatte. Belegt: `watchKeyboard` stand in `nav.js`, und Gruppe, Training,
Einheit und Video laden nav.js nicht; dort gab es kein `kb-open`, und der
Router rechnete die Tastatur nie mit. Ausserdem richtete sich alles, was
unten klebt, allein nach der Unterkante des Routers.

- `tastaturBeobachten()` läuft in JEDER Seite mit Hülle (`mountRail`) und
  in nav.js; sie setzt `--tastatur` (die Überdeckung, 0 wo der Browser die
  Seite selbst verkleinert), `--vv-hoehe` und `kb-open` — auch im
  Elterndokument, wenn die Seite in einem Rahmen läuft. Gemessen wird nur,
  solange der Fokus in einem Schreibfeld steht (`schreibfeld`), und nicht
  beim Zoomen (`vv.scale`).
- Darüber liegen jetzt: das Blatt des Assistenten (`bottom: max(…,
  var(--tastatur))`), der Dialog von unten (`margin-bottom`), der Chat-Thread
  (`body.dm-thread.kb-open .app` = sichtbarer Ausschnitt) und die
  Rückgangig-Leiste im Player. `.ki-verlauf` scrollt für sich
  (`overscroll-behavior: contain`), damit nicht zwei Flächen gleichzeitig
  scrollen. Nach dem Schliessen der Tastatur steht alles wieder, wo es war.

`dev/tastatur.test.mjs`.

**32. Was Firn ist, steht jetzt da — und wer dahintersteht** (v.35.70.0).
Michel, nach einem Rundgang durch Willkommen, Anmeldung, Gruppenerstellung
und die Bedingungen: „Es fehlt vor allem eine verständliche Erklärung: Was
ist Firn, für wen ist es gedacht und was mache ich nach der Registrierung?"
Dazu vier Aussagen, die nicht stimmten.

- **Die Willkommen-Seite** sagt in einem Satz, was Firn ist („Termine,
  Trainingspläne und Nachrichten an einem Ort"), zeigt vier Funktionen, drei
  Gruppenarten, drei Schritte („So beginnt ihr") und vier häufige Fragen.
  Weg sind: die Videoanalyse und die FIS-Punkte (beides gibt es, aber
  deswegen meldet sich niemand an, und beides liess Firn wie Software für
  einen einzigen Sport aussehen), „kein Konto beim Anbieter" (für Firn
  braucht es genau eines), „Was in der Beta entsteht, bleibt" (ein
  Versprechen über Datenbestand und künftige Tarife, das niemand halten
  kann) und der Abo-Kasten. Geblieben ist: kein Preis, solange es keinen
  gibt. `dev/willkommen.test.mjs` hält die Zusagen — die zum Video gilt
  jetzt bedingt, statt einen Satz wörtlich einzufrieren (Falle 9).
- **Die Anmeldung** hat eine Überschrift („Willkommen zurück" / „Willkommen
  bei {marke}"), unter jedem Feld einen Satz, der sagt, wozu es da ist, die
  **tatsächliche** Passwortregel (sechs Zeichen — dieselbe Zahl wie in der
  Fehlermeldung, ein Test vergleicht sie), „Einladungscode — optional" und
  **„Passwort vergessen?"**: `sendPasswordResetEmail` aus dem SDK, Firebase
  verschickt die Mail selbst (kein Server, kein Tarifwechsel). Die
  Bestätigung sagt NICHT, ob es das Konto gibt. Die Zustimmung zu den
  Bedingungen ist ein **Häkchen**, ohne das kein Konto entsteht; die
  Datenschutzerklärung steht daneben als Hinweis, nicht als Einwilligung
  (Michel: „nicht als pauschale Einwilligung … zusammenfassen").
- **Die Gruppenerstellung** erklärt, was die Wahl bewirkt, und nennt die
  Arten nach dem, was sie sind: **Sportteam**, **Verein oder
  Trainingsgruppe**, **Familie oder Freundeskreis**. Michel: „«Rennkader»
  lediglich in «Sportteam» umzubenennen reicht nicht, wenn danach
  ausschliesslich Skirennen und FIS-Punkte angeboten werden" — darum sagt
  die Karte, dass Disziplinen und FIS-Punkte zum **alpinen Skirennsport**
  gehören (`kenntDisziplinen` hängt weiter an `kader`; ein neutraler
  vierter Typ wäre eine eigene Runde). Nach dem Anlegen steht da, was der
  nächste Schritt ist (`#secBereit`: einladen, Termin, zur Gruppe) —
  vorher stand die frische Gruppe leer da.
- **Die Beispiele gehören niemandem mehr:** „z.B. Timo" →
  „Max Mustermann", „deine@email.com" → „max.mustermann@example.com"
  (RFC 2606), „BSV Perspektivkader" → „Lauftreff am Mittwoch", „Malbun" →
  „Sporthalle oder Haupteingang", „Coach Maxi" → „Gruppenassistent",
  „zu wenig Schnee" → „zu wenige Anmeldungen". Ein Test hält jeden
  Platzhalter frei von diesem Kreis. Echte Daten, bestehende Gruppen und
  die Testdaten der Attrappe bleiben, wie sie sind.
- **Drei Rechtstexte statt einem.** `nutzung.html` ist Michels Entwurf,
  Fassung 2: Betreiber, Testphase, Konto, Gruppen, eigene Inhalte,
  zulässige Nutzung, Training und Gesundheit, KI-Assistent, Datenschutz,
  Verfügbarkeit, Beendigung, Haftung, Änderungen, Recht. Die Haftung
  schliesst Vorsatz und grobe Fahrlässigkeit **nicht** mehr aus (Art. 100
  OR: ein solcher Ausschluss wäre nichtig). `datenschutz.html` ist neu und
  am Code nachgeprüft, nicht abgeschrieben: welche Daten wo liegen
  (Firestore in **europe-west6, Zürich** — abgefragt, nicht geraten), wer
  was sieht, welche Dienste mitarbeiten (Firebase, Cloudflare, Gemini,
  GitHub Pages, Google Fonts), was an den Assistenten geht **und was
  nicht**, was auf dem Gerät bleibt, dass es keine geplanten Sicherungen
  gibt. Der Satz „Wir geben sie nicht weiter" ist weg — er stand neben der
  Bearbeitung durch Firebase und Gemini und stimmte nicht.
  `betreiber.html` nennt den Betreiber (Betrieb und technischer Betrieb:
  Timothy van Zanten — ein zweiter Name gehört nicht auf diese Seiten);
  **Anschrift und Kontaktadresse
  fehlen und sind als Lücke markiert**. Erfunden wird nichts (Michel: „Max
  Mustermann ist hier kein zulässiger Ersatz für die tatsächliche
  Identität"); ein Test hält Lücke und Hinweis zusammen — wer die Angaben
  einträgt, nimmt den Hinweis mit weg.
- **Gefunden im Rundgang:** die Attrappe kannte `sendPasswordResetEmail`
  nicht, und ein fehlender Export beendet das ganze Modul, bevor es läuft
  (Falle 14). `dev/attrappe-vollstaendig.test.mjs` vergleicht jetzt jeden
  Namen, den die App aus dem Firebase-SDK holt, mit dem, was die Attrappe
  anbietet — gegengeprüft, indem der Export einmal entfernt wurde.

`dev/rechtstexte.test.mjs`, `dev/attrappe-vollstaendig.test.mjs`.

**33. Ein synchroner Zuhörer beendete den Chat** (v.35.70.2). Michel:
„die chats sind nicht mehr zum öffnen, ich kann nicht auf die chats
klicken und sehen wer was schreibt." Belegt: `abonnieren()` in
groups.js meldet einem neuen Abonnenten den bekannten Stand **synchron**
(`if (letzte) cb(letzte)`, seit v.35.63.0). In messages.html lief der
Zuhörer damit mitten im Modulrumpf — und griff auf `aktiv` zu, das erst
fünfzig Zeilen später deklariert war. Der ReferenceError flog aus dem
synchronen Aufruf heraus und beendete **das ganze Modul** (Falle 14):
die Liste der Unterhaltungen stand da, weil sie vorher gezeichnet wurde,
aber kein einziger Klick war mehr verdrahtet. Im Attrappen-Modus meldete
der Stub asynchron; dort fiel nur der Chat aus der Adresse aus (?gruppe=,
die Karte des Assistenten) — darum sah man es dort nicht.

Die Deklarationen stehen jetzt vor dem Zuhörer. Ein `?.` davor hätte den
Fehler nur unsichtbar gemacht. `dev/chat-gruppen.test.mjs` hält beides:
die Reihenfolge und die Zusage, dass `abonnieren()` sofort meldet.

## Ausrollen

`main` ist die Live-Seite. Der Arbeitszweig ist `firn`.

```bash
git push origin firn:main
```

**Michel entscheidet, wann.** Nie ungefragt auf `main` pushen.

## Mehrsprachigkeit

Sieben Sprachen: de, en, fr, it, pl, nl, es. **1255 Schlüssel** aus dreizehn
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

- **Der Worker läuft seit 15.09.2026** unter
  `https://firn-worker.tvza-app.workers.dev` (Michels Cloudflare-Konto,
  KV `KI`, Gemini-Schlüssel als Secret — von Michel selbst gesetzt, nie
  durch das Repo). `/health` meldet `ki=bereit`, `konto=FEHLT`: der
  Service-Account fehlt noch. Darum steht das Kalender-Abo hinter einem
  eigenen Schalter (`KALENDER_ABO = false` in `worker-config.js`) — mit
  der Adresse allein stünde sonst ein Knopf da, der zuverlässig scheitert.
  Ohne Service-Account prüft der Worker die Freischaltung nicht selbst
  (Falle 20). Auf Windows: PowerShell kennt kein `&&` und blockiert
  `npx.ps1` — `npx.cmd wrangler …` im Ordner `worker`.
- **Anschrift und Kontaktadresse des Betreibers fehlen** (v.35.70.0).
  `betreiber.html` trägt an zwei Stellen `[noch einzutragen]` und darüber
  den Hinweis, dass die Angaben vor der öffentlichen Freigabe ergänzt
  werden. Bis dahin führt der Weg über den Chat in Firn. Michel muss
  liefern: vollständiger Name (steht: Timothy van Zanten), Strasse, PLZ,
  Ort, Land und eine Kontaktadresse, an die Auskunfts-, Berichtigungs- und
  Löschungsbegehren sowie Sicherheitsmeldungen gehen. Wer sie einträgt,
  entfernt den Hinweis `.nb__entwurf` — `dev/rechtstexte.test.mjs` hält
  beides zusammen.
- **Kein Server.** Das blockiert vier Dinge auf einmal: Einladungsmails
  (`mailer/` schreibt in die `mail`-Sammlung, niemand leert sie), das
  Kalender-Abo (`worker/` ist fertig, nirgends ausgerollt), das Abo/Bezahlen
  (ohne Server nicht absicherbar — darum nennt `willkommen.html` keinen
  Preis) und fremde Quellen in der Tageszusammenfassung. Michel hat
  entschieden, dass ein Server später dazukommt.
- **Gegen echtes Firestore ist die App nie durchgeklickt worden.** Seit
  v.35.45.0 gibt es den Attrappen-Modus (siehe Befehle): die ganze App mit
  Testkonto und Speicher im Browser. Er fand beim ersten Rundgang, dass
  `start.js` seit v.35.12.0 mitten im Modul abbrach. Die Regeln prüft er
  nicht — das bleibt security-model.test.mjs und `--dry-run` —, bis auf
  eine: fremde Profile liest und Profile wie Namenskarten listet nur der
  Admin (Falle 15). Sonst sähe man dort nie, was ein Athlet sieht.
- `APP_CHECK_SITE_KEY` ist noch `''` — App Check vorbereitet, nicht scharf.
- Die Anmeldesperre in `assets/js/auth-security.js` ist localStorage-only.
  Bequemlichkeit, **kein** Schutz gegen Brute Force.
- Kein 2FA. SMS braucht Identity Platform (kostenpflichtig).
- **Reste des Familienmodells.** Das Profilfeld `users.familyId` wird nicht
  mehr geschrieben; alte, offene Einladungen in eine Kalendergruppe werden
  noch eingelöst (`invitedAutoJoin`). Die Reisen (`trips`, `activities`,
  `attachments` mit `parent` = Reise) bleiben nach der Übernahme stehen
  (Falle 17) — löschen erst, wenn alle übernommen sind und niemand mehr
  einen alten Gastlink braucht.
- **Regeln ohne Emulator.** Auf dieser Maschine gibt es kein Java; die
  Regeln werden vor dem Ausrollen nur mit `--dry-run` gegen das Projekt
  kompiliert, nicht gegen Testfaelle gefahren. Zuletzt ausgerollt mit
  v.35.32.0 (`tripGruppe()`, Übernahme-Marke an `families`, Schutz der
  Familienkennung beim Anlegen einer Gruppe) — Regeln VOR dem Code.
  v.35.33.0 (Einladungen in Gruppen, `einladungsBeitritt()`), ebenfalls
  Regeln vor dem Code. v.35.47.0 (Profile privat, Namenskarten — Falle 15)
  umgekehrt: erst der Code, der beides verträgt, dann die Regeln, dann
  einmal als Admin die App öffnen, damit die Karten nachgetragen sind.
  v.35.48.0 (TVZA-Kreis, `kreis/{uid}`) gehört in dieselbe Runde: bis die
  Regeln stehen, scheitert im Admin nur das Speichern einer Person (der
  Stapel schreibt die Kreisliste mit). Beide ausgerollt am 13.09.2026.
  v.35.49.0 (`tripLeitung()`: Reisen schreibt die Leitung) verschärft nur —
  der Code verlangt die neue Regel nicht, sie kann nach dem Code kommen.
  v.35.50.0 (Termine = Reisen, Falle 17) wieder **Regeln VOR dem Code**: der
  neue Code schreibt `programm`, `abfahrten`, `packliste`, `gastToken`,
  `gepackt/{uid}` und legt bei der Übernahme Termine mit diesen Feldern an — die alten
  Regeln lehnen das ab (die Übernahme scheitert dann still und läuft beim
  nächsten Öffnen wieder). Die neuen Regeln vertragen den alten Code.
  Ausgerollt am 14.09.2026 — ausnahmsweise kurz NACH dem Code (Michel
  wollte gleich pushen); dazwischen scheiterten nur die neuen Felder. Mit
  derselben Runde: `protokoll` `get` über die Kennung (Falle-14-artig: ein
  Athlet konnte einen Tag ohne Protokoll nicht öffnen).
  v.35.53.0 (Einladungen mit Ablauf, Falle 19): Regeln und Code **gleich
  nacheinander** — die alten Regeln lehnen `bis` und die kurzen Codes ab,
  die neuen die langen ohne `bis`. Dazwischen scheitert nur das Anlegen
  einer Einladung; Beitreten mit alten Codes geht weiter. Ausgerollt am
  14.09.2026, Regeln unmittelbar vor dem Push.
  v.35.54.0 (Assistent der Gruppe, `assistentGueltig`) Regeln VOR dem Code:
  der neue Code schreibt `groups.assistent`, die alten Regeln lehnen das ab;
  die neuen vertragen den alten Code. Ausgerollt am 15.09.2026.
  v.35.55.0 (Freischaltung: Admin liest Gruppen und schreibt `groups.ki`)
  erweitert nur — der alte Code braucht sie nicht, der neue nur fürs
  Freischalten im Admin. Regeln vor oder mit dem Code. Ausgerollt am
  15.09.2026, vor dem Push.
  v.35.56.0 (TVZA-Einladungslink, `kreisEinladungen`, Selbst-Zweig bei
  `users` und `kreis`) **Regeln VOR dem Code**: ohne sie scheitert das
  Anlegen eines Links im Admin und das Einlösen. Ausgerollt am 15.09.2026,
  vor dem Push.
  v.35.59.0 (der Kopf geht zuletzt aus einer gelöschten Gruppe) erweitert
  nur. Ohne die Regel scheitert beim Löschen nur der letzte Schritt — die
  eigene Mitgliedschaft bleibt und zeigt auf nichts (`zuGruppen` lässt sie
  weg). Regeln vor oder mit dem Code. Ausgerollt am 15.09.2026, vor dem
  Push.
  v.35.60.0 (Kalender: `users/{uid}/kalender`, `groups/{gid}/kalender`,
  `kalender` am Termin) **Regeln VOR dem Code**: ohne sie scheitert das
  Anlegen eines Kalenders, und ein Termin mit Kalender wird abgelehnt. Ausgerollt am 15.09.2026, vor dem Push.
  v.35.61.0 (Chat: Runden in `dms`, `groups/{gid}/chat` und `chatMeta`,
  `users/{uid}/chat`, `termin` an Nachrichten) **Regeln VOR dem Code**:
  ohne sie scheitern Gruppenchats, der Chat der Gruppe, stumm und Karten;
  Nachrichten zu zweit gehen weiter. Ausgerollt am 15.09.2026 (zusammen mit
  v.35.60.0), vor dem Push.
  v.35.62.0 (`emailKarten`) erweitert nur — ohne die Regel findet die
  Suche per Adresse niemanden, sonst geht alles. Regeln vor oder mit dem
  Code. Ausgerollt am 15.09.2026, vor dem Push.
  v.35.64.0 braucht keine neue Regel (Transaktion auf `protokoll` wie
  bisher, private Notizen unter `trainingLogs`).
  v.35.65.0 (`groups/{gid}/vorlagen`) erweitert nur — ohne die Regel
  bleibt „Oder aus einer Vorlage" verborgen und „Als Vorlage speichern"
  meldet, dass es nicht ging; der Plan geht trotzdem hinaus. Ausgerollt am
  16.09.2026, zusammen mit v.35.68.0 und unmittelbar vor dem Push.
  v.35.67.0 braucht keine neue Regel (Nachrichten wie im Chat), aber den
  **Worker** (`nachricht_senden` in `worker/ki.js`): `npx.cmd wrangler
  deploy` im Ordner `worker`. Ausgerollt am 16.09.2026, nach dem Code —
  bis dahin kannte Gemini das Werkzeug nicht, die Karte im Browser gab es
  schon. `wrangler deploy` fasst die Secrets nicht an: der
  Gemini-Schlüssel steht danach unverändert, `/health` meldet weiter
  `ki=bereit` (und `konto=FEHLT`, der Service-Account fehlt weiter).
  v.35.70.0 braucht keine neue Regel: Texte, Formulare und drei neue
  Seiten, kein neues Feld und keine neue Sammlung. Das Zurücksetzen des
  Passworts verschickt Firebase Auth selbst.
  v.35.68.0 (`users/{uid}/einstellungen/gruppen`, `artFarben` an
  `groups` samt `artFarbenGueltig`) erweitert nur — ohne sie bleibt die
  Reihenfolge im Gerät (mit Hinweis) und die Farbe einer Art lässt sich
  nicht speichern (Meldung), sonst geht alles. Ausgerollt am 16.09.2026,
  unmittelbar vor dem Push (Regeln erweitern nur, der alte Code vertraegt sie).

## Gewohnheiten

- Deutsch für Kommentare und Commit-Messages. Form:
  `v.35.63.1: <deutsche Zusammenfassung>`, darunter ein Absatz, der das
  **Warum** erklärt — besonders bei Fehlern, die still waren.
- Geheimnisse nie ins Repo: `mailer/.env`, `**/*service-account*.json`,
  `worker/.wrangler/`, `firestore.rules.live`, `*.zip` sind ignoriert.
- **Jede Verhaltensänderung bekommt einen Test in `dev/`.** Ohne
  Typprüfung und ohne Build-Schritt ist die Suite das einzige Netz.
- Findet ein Test einen Fehler, ist meistens der Test im Recht. Wenn nicht,
  gehört in denselben Commit, warum nicht.
