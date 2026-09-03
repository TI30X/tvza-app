/* Tests für assets/js/groups.js.
 *
 * groups.js importiert firebase-config.js und damit das Firebase-SDK von
 * gstatic — in node ohne Netz nicht ladbar. Diese Tests lesen die Datei
 * deshalb als Text, so wie navigation.test.mjs und kit-conformance.
 * Das prüft keine Laufzeit, aber es hält genau die Zusagen fest, deren
 * Bruch still wäre: ein writeBatch, der zu zwei Einzelschreibungen
 * zerfällt, oder ein fehlender Filter in der Sammelgruppen-Abfrage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');
const groups = () => read('assets/js/groups.js');

/* Den Körper einer benannten Funktion herausschneiden, damit ein Test
   nicht versehentlich in der Nachbarfunktion fündig wird. */
function fnBody(src, name) {
  const start = src.search(new RegExp(`function ${name}\\s*\\(`));
  assert.notEqual(start, -1, `Funktion ${name} fehlt`);

  /* Erst die Parameterliste überspringen. Sie kann selbst geschweifte
     Klammern enthalten — gruppeAnlegen destrukturiert sein zweites
     Argument —, und die erste "{" nach dem Namen wäre dann die des
     Parameters statt die des Körpers. */
  let paren = 0;
  let i = src.indexOf('(', start);
  for (; i < src.length; i += 1) {
    if (src[i] === '(') paren += 1;
    if (src[i] === ')') { paren -= 1; if (paren === 0) break; }
  }

  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1); }
  }
  assert.fail(`Funktion ${name} nicht geschlossen`);
}

test('Gruppe und Kopf entstehen in einem Stapel', async () => {
  const body = fnBody(await groups(), 'gruppeAnlegen');

  // Die Regeln verlangen existsAfter auf das Mitgliedsdokument. Zwei
  // getrennte Schreibvorgänge würden abgelehnt — der erste sieht das
  // zweite Dokument nicht.
  assert.match(body, /writeBatch\(db\)/);
  assert.match(body, /stapel\.set\(ref,/);
  assert.match(body, /stapel\.set\(mitgliedRef\(ref\.id, uid\), \{ uid, rolle: 'head'/);
  assert.match(body, /stapel\.commit\(\)/);

  // headUid muss im selben Stapel stehen, sonst schlägt getAfter fehl.
  assert.match(body, /headUid: uid/);

  // Und es darf keinen Weg geben, der die Gruppe allein schreibt.
  assert.doesNotMatch(body, /setDoc\(|addDoc\(/);
});

test('die Sammelgruppen-Abfrage filtert auf die eigene uid', async () => {
  const src = await groups();
  const body = fnBody(src, 'eigeneMitgliedschaften');

  // Ohne diesen Filter lehnt die Regel /{path=**}/members/{uid} die
  // ganze Abfrage ab, weil fremde Dokumente im Ergebnis lägen.
  assert.match(body, /collectionGroup\(db, 'members'\)/);
  assert.match(body, /where\('uid', '==', uid\)/);

  // Beide Leser gehen durch dieselbe Abfrage, damit der Filter nicht an
  // einer Stelle vergessen werden kann.
  for (const leser of ['meineGruppen', 'beobachteMeineGruppen']) {
    assert.match(fnBody(src, leser), /eigeneMitgliedschaften\(uid\)/, `${leser} umgeht den Filter`);
  }
});

test('eine Mitgliedschaft ohne lesbare Gruppe kippt nicht die ganze Liste', async () => {
  const body = fnBody(await groups(), 'zuGruppen');

  // Wer gerade entfernt wurde, hat kurzzeitig ein Mitgliedsdokument
  // ohne lesbare Gruppe. Das ist ein Zwischenzustand, kein Fehler.
  assert.match(body, /try \{/);
  assert.match(body, /catch \{ return null; \}/);
  assert.match(body, /\.filter\(Boolean\)/);
});

test('kein zweiter Kopf, auch nicht über die Oberfläche', async () => {
  const src = await groups();

  assert.match(fnBody(src, 'mitgliedAufnehmen'), /if \(rolle === 'head'\) throw/);
  assert.match(fnBody(src, 'rolleSetzen'), /rolle !== 'staff' && rolle !== 'mitglied'/);

  // 'head' entsteht an genau einer Stelle: beim Anlegen der Gruppe.
  const headSetzer = (src.match(/rolle: 'head'/g) || []);
  assert.equal(headSetzer.length, 1, "'head' darf nur beim Anlegen gesetzt werden");
});

test('gruppeAendern schreibt nur, was die Regeln erlauben', async () => {
  const body = fnBody(await groups(), 'gruppeAendern');

  // Dieselbe Liste wie hasOnly in firestore.rules. Läuft sie
  // auseinander, scheitert das Speichern erst beim Nutzer.
  // 'icsToken' kam mit dem Kalender-Abo dazu: ein EIGENES Token, nicht
  // der Beitrittscode — wer den Kalender liest, soll nicht beitreten
  // können.
  assert.match(body, /\['name', 'farbe', 'bereiche', 'inviteToken', 'icsToken'\]/);
  assert.match(body, /\.filter\(\(\[k\]\) => erlaubt\.includes\(k\)\)/);

  const rules = await read('firestore.rules');
  assert.match(rules, /hasOnly\(\['name', 'farbe', 'bereiche', 'inviteToken', 'icsToken'\]\)/);
});

test('die aktive Gruppe ist eine Gerätevorliebe und überlebt ihr Verschwinden', async () => {
  const src = await groups();

  // localStorage, nicht das Profil: wer am Handy den Kader offen hat,
  // will am Rechner vielleicht die Familie sehen.
  assert.match(src, /const SCHLUESSEL = 'firn\.gruppe'/);
  for (const fn of ['aktiveGruppeId', 'aktiveGruppeSetzen']) {
    assert.match(fnBody(src, fn), /catch/, `${fn} muss den privaten Modus überstehen`);
  }

  // Eine gemerkte Gruppe kann verlassen oder gelöscht sein.
  const wahl = fnBody(src, 'waehleAktive');
  assert.match(wahl, /gruppen\.find\(g => g\.id === gemerkt\) \|\| gruppen\[0\]/);
  assert.match(wahl, /if \(!gruppen\?\.length\) return null/);
});

test('der Einladungscode kommt aus crypto, nicht aus Math.random', async () => {
  const body = fnBody(await groups(), 'code');

  assert.match(body, /crypto\.getRandomValues/);
  assert.doesNotMatch(body, /Math\.random/);

  // Die Regeln verlangen mindestens acht Zeichen; 12 Bytes als Hex
  // ergeben 24 und damit Luft nach unten.
  assert.match(body, /Uint8Array\(12\)/);
});

test('Familie und Kader unterscheiden sich in Wörtern und Vorgaben, nicht in Code', async () => {
  const src = await groups();

  for (const art of ['kader', 'familie']) {
    assert.match(src, new RegExp(`${art}: \\{`), `Wortwahl für ${art} fehlt`);
  }
  // Der Kader bringt Training mit, die Familie nicht — sonst sähe jede
  // Familie einen Trainingsplan, den niemand benutzt.
  assert.match(src, /kader:\s*\{ termine: true, training: true/);
  assert.match(src, /familie:\s*\{ termine: true, projekte: true/);

  /* Rueckfall auf Deutsch, wenn der Katalog den Schluessel nicht kennt.
     Ueber tOr und NICHT ueber `t(k) ?? deutsch`: t() gibt bei einem
     unbekannten Schluessel den Schluessel zurueck, nie undefined —
     das ?? greift also nie, und auf dem Bildschirm steht grp.kader.head
     statt "Haupttrainer". */
  assert.match(fnBody(src, 'wort'), /TVZAI18n\?\.tOr\(eintrag\.key, eintrag\.de\)/);
  assert.doesNotMatch(fnBody(src, 'wort'), /\.t\(eintrag\.key\)\s*\?\?/,
    'wort() nutzt wieder t() mit ?? — das ist die Rueckfallebene, die nie greift');
});

test('die Kaderliste zeigt Namen, nicht UIDs', async () => {
  const src = await groups();

  // Namen stehen im Profil, nicht am Mitgliedsdokument — sie dort zu
  // spiegeln hiesse, sie bei jeder Namensänderung in jeder Gruppe
  // nachziehen zu müssen. Also wird nachgeschlagen.
  assert.match(fnBody(src, 'ladeMitglieder'), /name: await nameVon\(m\.uid\)/);
  assert.match(fnBody(src, 'nameVon'), /doc\(db, 'users', uid\)/);
  assert.match(fnBody(src, 'nameVon'), /displayName \|\| d\.name/);

  // Ein nicht lesbares Profil darf die Liste nicht kippen — dann steht
  // dort eben kein Name.
  assert.match(fnBody(src, 'nameVon'), /catch \{[^}]*\}/);

  // Und nicht bei jedem Neuzeichnen erneut lesen.
  assert.match(src, /const namensSpeicher = new Map\(\)/);
  assert.match(fnBody(src, 'nameVon'), /namensSpeicher\.has\(uid\)/);
});

test('die Rolle steht einmal da, nicht zweimal', async () => {
  const js = await read('assets/js/feature/gruppe/gruppe.js');

  // Die Zeile unter dem Namen zeigte dasselbe Wort wie die Segmentwahl
  // zwei Zeilen tiefer. Jetzt zeigt sie, was sonst nirgends steht.
  assert.doesNotMatch(js, /\$\('pMeta'\)\.textContent = wort\(/);
  assert.match(js, /Dabei seit \$\{seit\.toLocaleDateString/);
});

test('die Sammelgruppen-Regel steht und ist auf list beschränkt', async () => {
  const rules = await read('firestore.rules');

  const marker = 'match /{path=**}/members/{uid} {';
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, 'ohne diese Regel scheitert meineGruppen()');
  const block = rules.slice(start, rules.indexOf('}', rules.indexOf('allow', start)) + 1);

  assert.match(block, /allow list: if isMember\(\) && uid == request\.auth\.uid/);
  // Schreiben und Einzelabruf bleiben beim gruppengebundenen Block.
  for (const verb of ['create', 'update', 'delete', 'write']) {
    assert.doesNotMatch(block, new RegExp(`allow[^:]*\\b${verb}\\b`), `${verb} gehört nicht in die Sammelgruppen-Regel`);
  }
});

test('der Index für die Sammelgruppen-Abfrage ist hinterlegt', async () => {
  const raw = await read('firestore.indexes.json');
  const cfg = JSON.parse(raw);

  const feld = (cfg.fieldOverrides || []).find(
    f => f.collectionGroup === 'members' && f.fieldPath === 'uid');
  assert.ok(feld, 'ohne COLLECTION_GROUP-Index scheitert die Abfrage zur Laufzeit');
  assert.ok(
    feld.indexes.some(i => i.queryScope === 'COLLECTION_GROUP'),
    'die Sammlungs-Reichweite allein genügt nicht',
  );
});

/* ── Gruppentermine auf dem privaten Start ─────────────────────────*/

test('die Tageszusammenfassung nimmt Gruppentermine auf, ohne an ihnen zu hängen', async () => {
  const html = await read('index.html');

  // Was heute in einer Gruppe läuft, gehört in den Tag — ein Training
  // um 14:00 auch dann, wenn der Trainer es eingetragen hat.
  assert.match(html, /import \{ meineGruppen, ladeTermine \}/);
  assert.match(html, /import \{ alsBriefingTermine, isoTag \}/);
  assert.match(html, /termine: \[\.\.\.\(window\.tvzaHeuteTermine \|\| \[\]\), \.\.\.ausGruppen\]/);

  // Die Gruppenabfrage ist das Einzige auf dieser Seite, das den
  // COLLECTION_GROUP-Index braucht. Fehlt er, muss die Karte trotzdem
  // erscheinen — mit den eigenen Terminen.
  const lader = html.slice(html.indexOf('const gruppenTermineHeute'));
  assert.match(lader.slice(0, 700), /catch \{ return \[\]; \}/);

  // Und eine langsame Verbindung darf die Karte nicht verschlucken.
  assert.match(html, /Promise\.race\(\[\s*\n?\s*gruppenTermineHeute/);
});

test('abgemeldete Besucher landen im Login, nicht bei den Projekten', async () => {
  const [index, login] = await Promise.all([read('index.html'), read('login.html')]);

  // Drei Wege führten dorthin. Keiner davon mehr: die Projektseite ist
  // ein Link, den man verschickt, und kein Ort in der App.
  assert.doesNotMatch(index, /requireAuth\('public\.html'\)/);
  assert.match(index, /requireAuth\('login\.html'\)/);
  assert.doesNotMatch(login, /href="public\.html"/);

  // Aus dem Knopf, der die Seite aufrief, wurde einer, der sie
  // verschickbar macht.
  assert.doesNotMatch(index, /id="publicPageLink" href="public\.html"/);
  assert.match(index, /id="publicPageLink"/);
  assert.match(index, /navigator\.clipboard\.writeText\(adresse\)/);
});
