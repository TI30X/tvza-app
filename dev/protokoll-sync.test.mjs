/* Trainingsfortschritt zwischen Geräten (v.35.64.0).

   Michel: "Fortschritt vom Handy kam nicht auf den PC, Notizen sind
   verschwunden." Belegt im Code waren zwei Ursachen: das Protokoll
   wurde als GANZES Dokument geschrieben (ein Gerät mit altem Stand
   schrieb über das andere), und die letzten 900 ms vor dem Verlassen
   gingen nie hinaus. Hier die reinen Teile der Lösung: je Übung ein
   Stand, der Server entscheidet, das Gerät hält, was noch aussteht. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import {
  eintrag, mitEintrag, eintragSauber, eintragSchluessel, abgleichen, aenderungenPruefen,
  satzOk, saetze, einheitStatus, satzFortschritt, pauseBereich, sauber,
} from '../assets/js/einheit.js';
import { einheitenAmTag } from '../assets/js/wochenplan.js';
import {
  sichern, bestaetigt, offeneFuer, alleOffenen, nachtragen, tagSchluessel, SCHLUESSEL,
} from '../assets/js/protokoll-sicherung.js';

const read = p => readFile(join(root, p), 'utf8');

/* Ein Speicher wie localStorage, ohne Browser. */
function speicherAttrappe() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('der Server gilt je Übung — ausser wo hier etwas noch nicht geschrieben ist', () => {
  let lokal = mitEintrag({}, 'kraft', 'a', { note: 'meins', stand: 10 });
  lokal = mitEintrag(lokal, 'kraft', 'b', { done: true, stand: 5 });
  const fern = { units: { kraft: { items: {
    a: { done: false, note: 'vom Handy', sets: [], stand: 20 },
    b: { done: false, note: 'vom Handy', sets: [], stand: 30 },
    c: { done: true, note: '', sets: [], stand: 30 },
  } } } };
  const offen = new Set([eintragSchluessel('kraft', 'a')]);
  const neu = abgleichen(lokal, fern, offen);
  assert.equal(eintrag(neu, 'kraft', 'a').note, 'meins', 'die eigene, offene Änderung ging verloren');
  assert.equal(eintrag(neu, 'kraft', 'b').note, 'vom Handy', 'was schon geschrieben war, nimmt den Server');
  assert.equal(eintrag(neu, 'kraft', 'c').done, true, 'eine Übung, die nur das andere Gerät kennt, fehlt');
});

test('ein Gerät, das offline war, überschreibt nichts, was seither neuer ist', () => {
  const server = { units: { kraft: { items: { a: { note: 'neu', stand: 200 } } } } };
  const r = aenderungenPruefen(server, [
    { unitId: 'kraft', key: 'a', eintrag: { note: 'alt', stand: 100 }, stand: 100 },
    { unitId: 'kraft', key: 'b', eintrag: { note: 'nur hier', stand: 100 }, stand: 100 },
  ]);
  assert.deepEqual(r.verworfen, [eintragSchluessel('kraft', 'a')]);
  assert.deepEqual(r.geschrieben, [eintragSchluessel('kraft', 'b')]);
  assert.deepEqual(Object.keys(r.units.kraft.items), ['b'], 'die ältere Fassung von a ginge hinaus');
});

test('geleert heisst nicht gelöscht: der Stand bleibt, damit Älteres nicht zurückkommt', () => {
  const leer = eintrag(mitEintrag({}, 'kraft', 'a', { note: '', stand: 300 }), 'kraft', 'a');
  assert.deepEqual(eintragSauber(leer), { stand: 300 });
  const server = { units: { kraft: { items: { a: { stand: 300 } } } } };
  const r = aenderungenPruefen(server, [{ unitId: 'kraft', key: 'a', eintrag: { note: 'alt', stand: 250 }, stand: 250 }]);
  assert.equal(r.geschrieben.length, 0);
  /* Ein Eintrag ohne alles und ohne Stand wird gar nicht erst gespeichert. */
  assert.equal(eintragSauber({ done: false, note: '', sets: [] }), null);
  assert.deepEqual(sauber(mitEintrag({}, 'kraft', 'leer', { note: '' })), {});
});

test('ein Satz trägt seinen Haken selbst — Bearbeiten hakt nicht ab', () => {
  /* Alte Protokolle ohne ok: ein Wert heisst weiter "gemacht". */
  assert.equal(satzOk({ weight: '50', reps: '8' }), true);
  assert.equal(satzOk({ weight: '', reps: '' }), false);
  /* Neu: der Haken zählt, nicht der Wert. */
  assert.equal(satzOk({ weight: '52', reps: '8', ok: false }), false, 'ein korrigiertes Gewicht hakte den Satz ab');
  assert.equal(satzOk({ weight: '', reps: '', ok: true }), true);
  const e = eintrag(mitEintrag({}, 'kraft', 'a', { sets: [{ weight: '52', reps: '8', ok: false }, { weight: '50', reps: '8', ok: true }] }), 'kraft', 'a');
  const reihen = saetze({ sets: [{ reps: '8', weight: '50' }, { reps: '8', weight: '50' }] }, e);
  assert.deepEqual(reihen.map(r => r.ok), [false, true]);
  /* Dauer, Strecke, Körpergewicht bleiben erhalten. */
  const mehr = eintragSauber(eintrag(mitEintrag({}, 'lauf', 'x', { sets: [{ weight: '', reps: '', dauer: '0:45', strecke: '400 m', koerper: true, ok: true }] }), 'lauf', 'x'));
  assert.deepEqual(mehr.sets[0], { weight: '', reps: '', ok: true, dauer: '0:45', strecke: '400 m', koerper: true });
});

test('für die Leitung: offen, begonnen, fertig — und die Sätze', () => {
  const items = [{ key: 'a', sets: [{}, {}] }, { key: 'b', sets: [{}] }];
  assert.equal(einheitStatus(items, {}, 'kraft'), 'offen');
  let p = mitEintrag({}, 'kraft', 'a', { sets: [{ weight: '50', reps: '8', ok: true }] });
  assert.equal(einheitStatus(items, p, 'kraft'), 'begonnen');
  assert.deepEqual(satzFortschritt(items, p, 'kraft'), { ok: 1, gesamt: 3 });
  p = mitEintrag(p, 'kraft', 'a', { done: true });
  p = mitEintrag(p, 'kraft', 'b', { done: true });
  assert.equal(einheitStatus(items, p, 'kraft'), 'fertig');
});

test('die Pause als Bereich: beide Längen zur Wahl, die untere vorgewählt', () => {
  assert.deepEqual(pauseBereich({ pause: '180-240 Sec' }), { von: 180, bis: 240 });
  assert.deepEqual(pauseBereich({ pause: '120 – 180 sec' }), { von: 120, bis: 180 });
  assert.deepEqual(pauseBereich({ pause: '2-3 min' }), { von: 120, bis: 180 });
  assert.deepEqual(pauseBereich({ pause: '90 Sec' }), { von: 90, bis: 90 });
  assert.equal(pauseBereich({}), null);
});

test('aus der Woche direkt in die Einheit: nur die des Tages', () => {
  const programm = {
    units: { kraft: { id: 'kraft', items: [{ key: 'k1' }] }, mobi: { id: 'mobi', items: [{ key: 'm1' }] }, notiz: { id: 'notiz', items: [] } },
    days: [
      { key: 'mo', date: '2026-08-03', slots: [{ items: [{ title: 'Kraft', unit: 'kraft' }] }, { items: [{ title: 'Mobi', unit: 'mobi' }, { title: 'Spiel' }] }] },
      { key: 'di', date: '2026-08-04', slots: [{ items: [{ title: 'Hinweise', unit: 'notiz' }, { title: 'Kraft', unit: 'kraft' }] }] },
    ],
  };
  assert.deepEqual(einheitenAmTag(programm, '2026-08-03'), ['kraft', 'mobi']);
  assert.deepEqual(einheitenAmTag(programm, '2026-08-04'), ['kraft'], 'ein Notizblatt ohne Übungen ist keine Einheit zum Öffnen');
  assert.deepEqual(einheitenAmTag(programm, '2026-08-09'), []);
});

test('das Gerät hält, was noch aussteht — und gibt es erst nach der Bestätigung frei', async () => {
  const sp = speicherAttrappe();
  const tag = tagSchluessel('g1', 'timo', '2026-08-05');
  sichern(sp, tag, { unitId: 'kraft', key: 'a', eintrag: { note: 'zog im Knie', stand: 100 }, stand: 100, plan: 'p1' });
  sichern(sp, tag, { unitId: 'kraft', key: 'b', eintrag: { done: true, stand: 100 }, stand: 100, plan: 'p1' });
  sichern(sp, tagSchluessel('g2', 'lea', '2026-08-05'), { unitId: 'x', key: 'y', eintrag: null, stand: 1 });
  assert.equal(offeneFuer(sp, tag).length, 2);
  assert.deepEqual(alleOffenen(sp, 'timo').map(x => x.gid), ['g1'], 'nie die Einträge einer anderen Person');

  /* Eine Bestätigung für einen älteren Stand gibt nichts frei. */
  sichern(sp, tag, { unitId: 'kraft', key: 'a', eintrag: { note: 'zog im Knie, links', stand: 150 }, stand: 150, plan: 'p1' });
  bestaetigt(sp, tag, eintragSchluessel('kraft', 'a'), 100);
  assert.equal(offeneFuer(sp, tag).length, 2, 'eine neuere Eingabe wurde mit der älteren Bestätigung weggeworfen');

  /* Offline: bleibt liegen. */
  const offline = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
  assert.equal(await nachtragen(sp, 'timo', offline), 0);
  assert.equal(offeneFuer(sp, tag).length, 2);

  /* Mit Netz: b ist auf dem Server neuer (verworfen), a wird geschrieben — beide erledigt. */
  const server = { units: { kraft: { items: { b: { done: false, note: 'vom Handy', stand: 999 } } } } };
  const geschrieben = [];
  const n = await nachtragen(sp, 'timo', async (gid, uid, datum, aenderungen, plan) => {
    assert.equal(plan, 'p1');
    const r = aenderungenPruefen(server, aenderungen);
    geschrieben.push(...r.geschrieben);
    return { server, ...r };
  });
  assert.equal(n, 2);
  assert.deepEqual(geschrieben, [eintragSchluessel('kraft', 'a')]);
  assert.equal(offeneFuer(sp, tag).length, 0);
  assert.ok(sp.getItem(SCHLUESSEL), 'der Eintrag der anderen Person ist weg');
});

test('groups.js schreibt je Übung in einer Transaktion, der Player hört live', async () => {
  const g = await read('assets/js/groups.js');
  assert.match(g, /export function protokollAbgleichen\(gid, uid, datum, aenderungen, planId = ''\) \{[\s\S]*?runTransaction\(db, async tx => \{[\s\S]*?await tx\.get\(ref\)[\s\S]*?aenderungenPruefen\(server, aenderungen\)[\s\S]*?tx\.set\(ref, \{ uid, datum, units: daten, updatedAt: serverTimestamp\(\) \}, \{ merge: true \}\)/);
  assert.doesNotMatch(g, /export function protokollSpeichern/, 'das ganze Dokument zu schreiben war der Fehler');
  assert.match(g, /export function beobachteProtokoll\(gid, uid, datum, cb, fehler\) \{\s*return onSnapshot\(protokollRef\(gid, uid, datum\)/);
  /* Private Notizen: nur die Person selbst (trainingLogs, Regel seit jeher). */
  assert.match(g, /const privatRef = \(uid, datum\) => doc\(db, 'users', uid, 'trainingLogs', datum\);/);
  assert.match(g, /schema: 1,\s*units: \{ \[privatEinheit\(gid, unitId\)\]: \{ items: \{ \[key\]: \{ privat:/);
  const regeln = await read('firestore.rules');
  assert.match(regeln, /match \/users\/\{uid\}\/trainingLogs\/\{trainingDate\} \{\s*allow read, delete: if isMember\(\)\s*&& request\.auth\.uid == uid;/);

  const seite = await read('assets/js/feature/einheit/einheit.js');
  /* Verlassen, Wegschalten, Übungswechsel: sofort. */
  assert.match(seite, /window\.addEventListener\('pagehide', \(\) => \{ void jetztAlles\(\); \}\);/);
  assert.match(seite, /if \(document\.hidden\) \{ void jetztAlles\(\); return; \}/);
  assert.match(seite, /\$\('btnWeiter'\)\?\.addEventListener\('click', \(\) => \{ void jetztAlles\(\); weiter\(\); \}\);/);
  /* Sofort im Gerät, noch vor dem Speichern. */
  assert.match(seite, /offen\.set\(eintragSchluessel\(unit, key\), \{ unitId: unit, key, stand: jetzt \}\);\s*sichern\(speicher\(\), tagKey\(\),/);
  /* Die Leiste schickt beim Start der App hinaus, was noch im Gerät liegt —
     shell.js, weil Gruppe, Training und Einheit nav.js nicht laden (im
     Rundgang blieb es darum auf der Trainingsseite liegen). */
  const shell = await read('assets/js/shell.js');
  assert.match(shell, /pilleLaden\(\);\s*offenesNachtragen\(\);/);
  assert.match(shell, /if \(nachgetragen \|\| imRahmen\(\)/);
  assert.match(shell, /s\.nachtragen\(localStorage, user\.uid, g\.protokollAbgleichen\)/);
  const sw = await read('sw.js');
  assert.match(sw, /'\.\/assets\/js\/protokoll-sicherung\.js'/);
  assert.match(sw, /'\.\/assets\/css\/feature\/einheit\.css\?v=\d+'/);
});
