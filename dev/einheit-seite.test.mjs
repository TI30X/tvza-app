/* Tests für den Einheiten-Player — Markup gegen Skript, und die
 * Regeln für das Trainingsprotokoll.
 *
 * Dieselbe Prüfung wie bei gruppe-seite.test.mjs: eine Element-ID, die
 * im Skript steht und im Markup fehlt, ergibt einen Knopf, der nichts
 * tut. Beim Bauen der Gruppenseite ist genau das einmal passiert, und
 * ein $(...) ohne Anführungszeichen ist syntaktisch gültig.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');
const seite = () => read('pages/einheit.html');
const skript = () => read('assets/js/feature/einheit/einheit.js');

test('jede vom Player gesuchte ID gibt es im Markup', async () => {
  const [html, js] = await Promise.all([seite(), skript()]);
  const vorhanden = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const gesucht = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));

  const fehlend = [...gesucht].filter(id => !vorhanden.has(id));
  assert.deepEqual(fehlend, [], `IDs ohne Element in einheit.html: ${fehlend}`);
});

test('kein $(...) ohne Anführungszeichen', async () => {
  const js = await skript();
  const nackt = [...js.matchAll(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g)]
    .map(m => m[1])
    .filter(name => name !== 'id');
  assert.deepEqual(nackt, [], `$(...) ohne Anführungszeichen: ${nackt}`);
});

test('gespeichert wird verzögert, nicht bei jedem Tastendruck', async () => {
  const js = await skript();

  // Wer mitten im Satz das Telefon weglegt, soll nicht "Speichern"
  // suchen müssen — und wer bei jedem Tastendruck schreibt, verbrennt
  // das Kontingent. Dieselbe Verzögerung wie training-sync.js.
  assert.match(js, /const VERZOEGERUNG = 900/);
  assert.match(js, /clearTimeout\(timer\)/);
  assert.match(js, /timer = setTimeout\(/);

  // sauber() wirft leere Einträge weg, sonst wüchse das Protokoll mit
  // jeder geöffneten Einheit.
  assert.match(js, /protokollSpeichern\(gid, user\.uid, datum, sauber\(protokoll\)\)/);

  // Und ein Fehler beim Speichern darf keinen Dialog aufwerfen: man
  // steht mit einer Hantel da.
  const speichern = js.slice(js.indexOf('function speichereBald'));
  assert.doesNotMatch(speichern.slice(0, 700), /alert\(/);
});

test('der Player springt zur nächsten OFFENEN Übung', async () => {
  const js = await skript();

  // Wer die Reihenfolge durchbricht — weil eine Bank besetzt war —
  // soll nicht wieder an erledigten vorbeiblättern.
  assert.match(js, /naechsteOffene\(items, protokoll, unitId, pos \+ 1\)/);
  // Und beim Wiederaufnehmen dort landen, wo er aufgehört hat.
  assert.match(js, /naechsteOffene\(items, protokoll, unitId, 0\)/);
});

test('ein Plan wird über die erlaubte Abfrage geholt, nicht direkt gelesen', async () => {
  const js = await skript();

  // So greift dieselbe Regel wie in der Gruppenansicht, und ein Plan,
  // der für jemand anderen bestimmt ist, kommt gar nicht an.
  assert.match(js, /ladePlaene\(gid, user\.uid, false\)/);
  assert.doesNotMatch(js, /doc\(db, 'groups'/);
});

test('der Vorgabewert aus dem Plan steht als Platzhalter, nicht als Wert', async () => {
  const js = await skript();

  // Sonst stünde eine fremde Zahl da, als hätte man sie selbst gemacht.
  assert.match(js, /placeholder="\$\{escHtml\(reihe\.zielWert \|\| 'Wert'\)\}"/);
  assert.match(js, /value="\$\{escHtml\(reihe\.weight\)\}"/);
});

/* ── Die Regeln zum Protokoll ──────────────────────────────────────*/

function matchBlock(rules, pfad) {
  const marke = `match ${pfad} {`;
  const start = rules.indexOf(marke);
  assert.notEqual(start, -1, `${pfad} fehlt in den Regeln`);
  let tiefe = 0;
  for (let i = start + marke.length - 1; i < rules.length; i += 1) {
    if (rules[i] === '{') tiefe += 1;
    if (rules[i] === '}') { tiefe -= 1; if (tiefe === 0) return rules.slice(start, i + 1); }
  }
  assert.fail(`${pfad} nicht geschlossen`);
}

function allowClause(block, verben) {
  const marke = `allow ${verben}:`;
  const start = block.indexOf(marke);
  assert.notEqual(start, -1, `"allow ${verben}" fehlt`);
  const rest = block.slice(start + marke.length);
  const ende = rest.search(/\n\s*allow /);
  return ende === -1 ? rest : rest.slice(0, ende);
}

test('das Protokoll schreibt nur, wem es gehört', async () => {
  const block = matchBlock(await read('firestore.rules'), '/groups/{gid}/protokoll/{id}');
  const schreiben = allowClause(block, 'create, update');

  // Ein Trainer, der einträgt, was ein Athlet geschafft habe, macht aus
  // einem Protokoll eine Behauptung.
  assert.match(schreiben, /request\.resource\.data\.uid == request\.auth\.uid/);
  assert.doesNotMatch(schreiben, /leadsGroup\(gid\)/);

  // Ein Dokument pro Person und Tag, ohne Dublettensuche.
  assert.match(schreiben, /id == request\.auth\.uid \+ '__' \+ request\.resource\.data\.datum/);
  assert.match(schreiben, /datum\.matches\('\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}'\)/);
  assert.match(schreiben, /units\.size\(\) <= 20/);
});

test('der Trainer liest das Protokoll, der Athlet nur sein eigenes', async () => {
  const block = matchBlock(await read('firestore.rules'), '/groups/{gid}/protokoll/{id}');
  const lesen = allowClause(block, 'get, list');

  // Das ist der Grund, warum es an der Gruppe hängt und nicht unter
  // users/{uid}: ein owner-only Dokument gibt dem Trainer nichts.
  assert.match(lesen, /resource\.data\.get\('uid', ''\) == request\.auth\.uid/);
  assert.match(lesen, /leadsGroup\(gid\)/);
  assert.match(lesen, /inGroup\(gid\)/);

  // Löschen darf die Leitung, damit sie nach einem Irrtum aufräumen kann.
  assert.match(allowClause(block, 'delete'), /leadsGroup\(gid\)/);
});

test('das persönliche Training bleibt persönlich', async () => {
  const rules = await read('firestore.rules');

  // users/{uid}/trainingLogs ist unberührt und trägt weiterhin das
  // eigene Training. Im Gruppenprotokoll steht nur, was zu einem Plan
  // DIESER Gruppe gehört.
  const alt = matchBlock(rules, '/users/{uid}/trainingLogs/{trainingDate}');
  assert.match(alt, /request\.auth\.uid == uid/);
  assert.doesNotMatch(alt, /leadsGroup/);
});
