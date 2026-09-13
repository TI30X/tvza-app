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
import { starteEinheit, warte } from './gruppe-harness.mjs';

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

/* Bis v.35.40.0 stand hier ein Test, der wörtlich
   ladePlaene(gid, user.uid, false) verlangte — die Abfrage eines
   Athleten. Genau die fand den Plan nicht, wenn die Leitung aus der
   Gruppe die Einheit eines Athleten öffnete: "Der Plan liess sich nicht
   laden." Der Test schützte die Zeile, nicht das Verhalten (Falle 9).
   Die Sicherung ist die Regel (allow get, list auf plaene, weiter unten
   geprüft); diese Tests starten den Player und prüfen, was man sieht. */

const grid = JSON.parse(await read('dev/fixtures/kw31-grid.json'));
const { parseProgram } = await import('../assets/js/training-parser.js');
const { einheiten } = await import('../assets/js/einheit.js');
const programm = parseProgram(grid);
const kraft = einheiten(programm).find(e => e.anzahl > 0).id;
const plan = (id, fuer) => ({ id, titel: 'Woche 31', fuer, json: JSON.stringify(programm) });
const MITGLIEDER = [{ uid: 'timo', name: 'Timothy', rolle: 'head' }, { uid: 'lea', name: 'Lea', rolle: 'mitglied' }];

test('die Leitung öffnet die Einheit eines Athleten und sieht dessen Protokoll', async () => {
  globalThis.__protokoll = { lea: { uid: 'lea', datum: '2026-08-05', units: {} } };
  const { doc, zurueck } = await starteEinheit({
    suche: `?g=g1&p=p1&u=${kraft}&d=2026-08-05`,
    gruppen: [{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'head' }],
    plaene: [plan('p1', 'lea')], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('ansichtHinweis').hidden);
    assert.equal(doc.getElementById('ladeFehler').hidden, true, doc.getElementById('ladeFehler').textContent);
    assert.equal(doc.getElementById('secPlayer').hidden, false, 'der Player steht nicht');
    assert.match(doc.getElementById('ansichtHinweis').textContent, /Plan von Lea/);
    assert.deepEqual(globalThis.__aufrufe.find(a => a[0] === 'ladeProtokoll').slice(2), ['lea', '2026-08-05'],
      'die Leitung sieht ihr eigenes Protokoll statt das des Athleten');

    /* Nur ansehen: kein Haken, keine Notiz, kein "Übung erledigt". */
    const haken = doc.querySelector('[data-satz-tippen]');
    if (haken) {
      assert.equal(haken.disabled, true);
      haken.click();
    }
    assert.equal(doc.querySelector('[data-satz-oeffnen]'), null, 'der Stift zum Ändern steht noch da');
    assert.equal(doc.getElementById('uebNotiz').readOnly, true);
    assert.equal(doc.getElementById('btnErledigt').hidden, true);
    await new Promise(r => setTimeout(r, 1000));
    assert.equal(globalThis.__aufrufe.filter(a => a[0] === 'protokollSpeichern').length, 0,
      'die Leitung schreibt ein Protokoll auf den Plan eines Athleten');
  } finally { zurueck(); delete globalThis.__protokoll; }
});

test('ein Athlet öffnet seinen eigenen Plan und trägt ein', async () => {
  const { doc, zurueck } = await starteEinheit({
    suche: `?g=g1&p=p2&u=${kraft}&d=2026-08-05`,
    plaene: [plan('p2', 'timo')], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    assert.equal(doc.getElementById('ansichtHinweis').hidden, true);
    assert.equal(doc.getElementById('btnErledigt').hidden, false);
    doc.getElementById('btnErledigt').click();
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'protokollSpeichern'), 200);
    const gespeichert = globalThis.__aufrufe.find(a => a[0] === 'protokollSpeichern');
    assert.ok(gespeichert, 'nichts gespeichert');
    assert.equal(gespeichert[2], 'timo');
  } finally { zurueck(); }
});

test('ein Athlet bekommt den Plan eines anderen nicht — die Regel sagt nein', async () => {
  const { doc, zurueck } = await starteEinheit({
    suche: `?g=g1&p=p1&u=${kraft}`,
    plaene: [plan('p1', 'lea')], mitglieder: MITGLIEDER,
  });
  try {
    assert.equal(doc.getElementById('ladeFehler').hidden, false);
    assert.equal(doc.getElementById('secPlayer').hidden, true);
  } finally { zurueck(); }
});

test('der Vorgabewert aus dem Plan steht als Platzhalter, nicht als Wert', async () => {
  const js = await skript();

  /* Der Vorgabewert bleibt Platzhalter. Nur das Ersatzwort geht
     jetzt durch den Katalog: "Wert" heisst auf Englisch Value. */
  assert.match(js, /placeholder="\$\{escHtml\(reihe\.zielWert \|\| t\(/);
  assert.match(js, /t\('eh.wert', 'Wert'\)/);
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

test('einen Plan lesen darf, für wen er ist — und die Leitung', async () => {
  /* Das ist die Sicherung, seit der Player den Plan direkt liest statt
     über die Abfrage eines Athleten (v.35.41.0). */
  const block = matchBlock(await read('firestore.rules'), '/groups/{gid}/plaene/{planId}');
  const lesen = allowClause(block, 'get, list');
  assert.match(lesen, /inGroup\(gid\)/);
  assert.match(lesen, /resource\.data\.get\('fuer', ''\) == 'alle'/);
  assert.match(lesen, /resource\.data\.get\('fuer', ''\) == request\.auth\.uid/);
  assert.match(lesen, /leadsGroup\(gid\)/);
});
