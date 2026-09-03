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
  assert.match(body, /\['name', 'farbe', 'bereiche', 'inviteToken'\]/);
  assert.match(body, /\.filter\(\(\[k\]\) => erlaubt\.includes\(k\)\)/);

  const rules = await read('firestore.rules');
  assert.match(rules, /hasOnly\(\['name', 'farbe', 'bereiche', 'inviteToken'\]\)/);
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

  // Rückfall auf Deutsch, wenn der Katalog den Schlüssel nicht kennt.
  assert.match(fnBody(src, 'wort'), /window\.TVZAI18n\?\.t\(eintrag\.key\) \?\? eintrag\.de/);
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
