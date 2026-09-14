/* Termine und Reisen sind eins (v.35.50.0).

   Michel: "leg Termine und Reisen zusammen — ohne die Funktionalität der
   Reise nachzulassen, also die coole HTML-Option". Bis dahin gab es zwei
   Dinge für dasselbe: Termine der Gruppe (groups/{gid}/events) und Reisen
   (trips) mit Programm aus einer HTML-Seite, Aufgaben, Dateien und
   Gast-Link — die Reise stand nie im Gruppe-Tab, der Termin hatte kein
   Programm. Jetzt kann der Termin alles, was die Reise konnte, und die
   Reisen ziehen um (reise-uebernahme.js).

   Und was Michel dazu gesagt hat, während es entstand:
   - "Ein Plan sollte nicht abgehakt werden können … um 7:00 sollte es
     von alleine gehen, muss ja nicht durchgestrichen werden."
   - Abfahrtszeiten und -orte je Athlet.
   - "Wenn etwas oft eingetragen wird, sollte es von alleine gehen."
   - "Nur der Admin ändert solche Sachen — abhaken nur, was jeden selbst
     angeht: die Packliste für jeden einzeln", angelegt und bearbeitet
     von der Leitung.

   Hier stehen:
   - das Programm (programm.js): Einlesen, vorbei nach der Uhr, die
     bereinigte Seite, Abfahrten, Packliste;
   - die Übernahme einer Reise: Felder, Reihenfolge, Wiederholbarkeit;
   - der Kalender: ein Termin trägt sein Programm wie vorher die Reise;
   - die Regeln: schreiben darf nur die Leitung, packen jeder für sich,
     ein Gast sieht genau einen Termin;
   - der Gruppe-Tab. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { starteGruppe, klick, warte } from './gruppe-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFile(join(root, p), 'utf8');

const leer = new JSDOM('');
globalThis.DOMParser ??= leer.window.DOMParser;
globalThis.Node ??= leer.window.Node;

const {
  programmMitSeite, seiteLesen, neuerPunkt, punktSetzen, punktVorbei, naechsterPunkt,
  sichereAdresse, sicheresHtml, programmHtml, punkteHtml,
  abfahrtVon, abfahrtenSauber, packlisteFuer, haeufigste,
} = await import('../assets/js/programm.js');
const { terminAusReise, reiseUebernehmen, sollReiseUebernehmen } = await import('../assets/js/reise-uebernahme.js');
const { ausTeamTermin } = await import('../assets/js/feature/kalender/eintraege.js');
const { alsIcsEintrag, pruefe, zeitraum } = await import('../assets/js/termine.js');

/* Eine Seite, wie sie aus einem Reiseplaner kommt: zwei Tage, drei Punkte. */
const SEITE = `
<h2>15.09.2026</h2>
<ul><li>10:00 Museumsbesuch</li><li>13:00 Mittagessen</li></ul>
<h2>16.09.2026</h2>
<ul><li>09:00 Heimreise</li></ul>`;

/* ── Das Programm ─────────────────────────────────────────────────── */

test('eine Seite wird zum Programm nach Tagen; von Hand Angelegtes bleibt', () => {
  const { punkte, tage } = seiteLesen(SEITE, '2026-09-15');
  assert.equal(punkte.length, 3);
  assert.equal(tage, 2);

  const vonHand = neuerPunkt({ date: '2026-09-15', time: '18:00', title: 'Znacht' });
  const alt = [vonHand, { id: 'alt', title: 'vom letzten Einlesen', autoImported: true }];
  const neu = programmMitSeite(alt, SEITE, '2026-09-15');
  assert.deepEqual(neu.map(p => p.title), ['Znacht', ...punkte.map(p => p.title)],
    'der alte eingelesene Punkt ist ersetzt, der eigene bleibt');
  assert.equal(programmMitSeite(alt, '<p>Nur ein Flyer</p>', ''), alt, 'eine Seite ohne Punkte lässt das Programm stehen');
});

test('ein Punkt lässt sich ändern — und ist danach ein eigener', () => {
  const p = neuerPunkt({ date: 'morgen', time: '25 Uhr', title: '  Anreise  ', notes: ' Gleis 4 ' });
  assert.equal(p.title, 'Anreise');
  assert.equal(p.notes, 'Gleis 4');
  assert.equal('date' in p || 'time' in p, false, 'nur, was ein Datum und eine Zeit ist');

  const eingelesen = [{ id: 'imp_1', date: '2026-09-15', time: '10:00', title: 'Museum', autoImported: true }];
  const geaendert = punktSetzen(eingelesen, neuerPunkt({ id: 'imp_1', date: '2026-09-15', time: '10:30', title: 'Museum' }));
  assert.equal(geaendert.length, 1);
  assert.equal(geaendert[0].time, '10:30');
  assert.equal(geaendert[0].autoImported, undefined, 'ein neues Einlesen ersetzt einen geänderten Punkt nicht');
});

test('vorbei ist, was nach der Uhr vorbei ist — abgehakt wird nichts', () => {
  const jetzt = { tag: '2026-09-15', zeit: '12:00' };
  const punkte = [
    { id: 'a', date: '2026-09-14', title: 'gestern' },
    { id: 'b', date: '2026-09-15', time: '07:00', title: 'Abfahrt' },
    { id: 'c', date: '2026-09-15', time: '14:00', title: 'Führung' },
    { id: 'd', date: '2026-09-15', title: 'irgendwann heute' },
    { id: 'e', date: '2026-09-16', time: '09:00', title: 'Heimreise' },
  ];
  assert.deepEqual(punkte.map(p => punktVorbei(p, jetzt)), [true, true, false, false, false]);
  assert.equal(naechsterPunkt(punkte, jetzt).id, 'c');

  const html = programmHtml({ titel: 'Toskana', punkte, jetzt });
  assert.doesNotMatch(html, /data-plan-stop|haken|progress|line-through/, 'nichts zum Abhaken, nichts durchgestrichen');
  assert.equal((html.match(/plan-stop is-vorbei/g) || []).length, 2);
  assert.equal((html.match(/is-naechster/g) || []).length, 1);
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(punkteHtml(punkte, { jetzt }), /data-punkt=/, 'nur die Leitung tippt einen Punkt zum Ändern an');
  assert.equal((punkteHtml(punkte, { jetzt, bearbeitbar: true }).match(/data-punkt="/g) || []).length, 5);
});

test('die Seite läuft nie mit: keine Skripte, keine on…, keine javascript:-Links', () => {
  const sauber = sicheresHtml(`<h1 onclick="x()">Plan</h1><script>alert(1)</script>
    <iframe src="https://böse"></iframe><a href="javascript:alert(2)">a</a><a href="https://ok.test">b</a>`);
  assert.match(sauber, /<h1>Plan<\/h1>/);
  assert.doesNotMatch(sauber, /<script|<iframe|onclick|javascript:/i);
  assert.match(sauber, /<a href="https:\/\/ok\.test" target="_blank" rel="noopener noreferrer">/);
  assert.equal(sichereAdresse('https://reise.test/plan'), 'https://reise.test/plan');
  assert.equal(sichereAdresse('javascript:alert(1)'), '');
  assert.equal(sichereAdresse('data:text/html,<b>x</b>'), '');
});

test('Abfahrten je Person, Packliste je Person, und was oft vorkommt', () => {
  assert.deepEqual(abfahrtenSauber({
    timo: { zeit: '06:30', ort: ' Bahnhof Buchs ' }, lea: { zeit: '', ort: '' }, x: { zeit: 'bald', ort: 'Vaduz' },
  }), { timo: { zeit: '06:30', ort: 'Bahnhof Buchs' }, x: { ort: 'Vaduz' } }, 'leere Zeilen fallen weg, eine unlesbare Zeit auch');
  assert.deepEqual(abfahrtVon({ abfahrten: { timo: { zeit: '06:30', ort: 'Buchs' } } }, 'timo'), { zeit: '06:30', ort: 'Buchs' });
  assert.equal(abfahrtVon({ abfahrten: {} }, 'lea'), null);

  const termin = { packliste: [{ id: 'm', name: 'Yogamatte' }, { id: 's', name: 'Aussen-Turnschuhe' }] };
  const liste = packlisteFuer(termin, { erledigt: { m: true, k: true }, eigene: [{ id: 'k', name: 'Ladekabel' }] });
  assert.deepEqual(liste.map(p => [p.name, p.eigen, p.an]), [
    ['Yogamatte', false, true], ['Aussen-Turnschuhe', false, false], ['Ladekabel', true, true],
  ]);

  assert.deepEqual(haeufigste(['Malbun', 'Vaduz', 'Malbun', ' ', 'Buchs', 'Vaduz', 'Malbun']), ['Malbun', 'Vaduz', 'Buchs']);
});

/* ── Die Übernahme einer Reise ───────────────────────────────────── */

const REISE = {
  id: 'r1', familyId: 'g2', name: 'Herbstferien Toskana', destination: 'Castiglione',
  startDate: '2026-10-05', endDate: '2026-10-11', startTime: '06:30', notes: 'Ferienhaus ab 15 Uhr.',
  itinerary: [{ id: 'i1', date: '2026-10-05', title: 'Abfahrt' }], itineraryDone: { i1: true },
  planHtml: '<h1>Plan</h1>', guestToken: 'tok', createdBy: 'michel',
};

test('eine Reise wird ein Termin mit denselben Dingen — und nur mit erlaubten Feldern', async () => {
  const termin = terminAusReise(REISE, 'michel', { gruppenart: 'familie', packliste: [{ id: 'a1', name: 'Vignette' }] });
  assert.deepEqual(termin, {
    art: 'lager', titel: 'Herbstferien Toskana', von: '2026-10-05', bis: '2026-10-11',
    ort: 'Castiglione', notiz: 'Ferienhaus ab 15 Uhr.', createdBy: 'michel',
    programm: REISE.itinerary, packliste: [{ id: 'a1', name: 'Vignette' }], planHtml: '<h1>Plan</h1>', gastToken: 'tok',
  }, 'mehrtägig ist ein Lager — in der Familie heisst das "Reise"; die alten Haken bleiben an der Reise');

  const rules = await read('firestore.rules');
  const block = rules.slice(rules.indexOf('match /groups/{gid}/events/{eid} {'));
  const erlaubt = block.match(/allow create:[\s\S]*?keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)[1]
    .match(/'([^']+)'/g).map(s => s.slice(1, -1));
  const eintaegig = terminAusReise({ ...REISE, endDate: '', endTime: '09:00' }, 'm', { gruppenart: 'kader' });
  for (const t of [termin, eintaegig]) {
    for (const k of Object.keys(t)) assert.ok(erlaubt.includes(k), `${k} lehnt die Regel ab`);
  }
  assert.equal(eintaegig.art, 'training');
  assert.equal(eintaegig.bezeichnung, 'Termin', 'im Kader wird aus einem Ausflug kein "Training"');
  assert.equal(eintaegig.zeit, '06:30');
  assert.equal(eintaegig.bisZeit, '09:00');
  assert.equal(terminAusReise({ id: 'x', name: 'ohne Datum' }, 'm'), null);
});

test('übernommen wird in derselben Kennung, der Reihe nach, und ein zweites Mal schreibt nichts doppelt', async () => {
  const speicher = new Map();
  const log = [];
  const fs = {
    doc: (db, ...p) => ({ pfad: p.join('/') }),
    collection: (db, name) => ({ name }),
    where: (feld, op, wert) => ({ feld, wert }),
    query: (c, w) => ({ ...c, ...w }),
    getDoc: async ref => ({ exists: () => speicher.has(ref.pfad) }),
    getDocs: async q => ({
      docs: q.name === 'activities'
        ? [{ id: 'a1', data: () => ({ tripId: 'r1', name: 'Vignette', done: true }) }]
        : [{ id: 'f1', data: () => ({ parent: 'r1', name: 'Plan.pdf', type: 'application/pdf', size: 30, dataUrl: 'data:application/pdf;base64,AAAA' }) }],
    }),
    setDoc: async (ref, daten) => { log.push(['set', ref.pfad]); speicher.set(ref.pfad, daten); },
    updateDoc: async (ref, daten) => { log.push(['update', ref.pfad, daten]); },
    serverTimestamp: () => 'jetzt',
  };
  assert.equal(await reiseUebernehmen({ db: {}, fs, reise: REISE, uid: 'michel', gruppenart: 'familie' }), true);
  assert.deepEqual(log, [
    ['set', 'groups/g2/events/r1'],
    ['set', 'groups/g2/events/r1/anhaenge/f1'],
    ['update', 'trips/r1', { uebernommen: true }],
  ], 'der Termin zuerst, die Marke an der Reise zuletzt');
  assert.deepEqual(speicher.get('groups/g2/events/r1').packliste, [{ id: 'a1', name: 'Vignette' }],
    'die Aufgaben der Reise werden die Packliste — gepackt wird je Person');

  log.length = 0;
  await reiseUebernehmen({ db: {}, fs, reise: REISE, uid: 'michel', gruppenart: 'familie' });
  assert.deepEqual(log, [['update', 'trips/r1', { uebernommen: true }]], 'was schon da ist, wird nicht noch einmal geschrieben');
});

test('übernehmen tut nur die Leitung einer Gruppe, die es gibt', () => {
  const ja = { istGruppe: () => true, leitet: () => true };
  assert.equal(sollReiseUebernehmen(REISE, ja), true);
  assert.equal(sollReiseUebernehmen({ ...REISE, uebernommen: true }, ja), false);
  assert.equal(sollReiseUebernehmen(REISE, { ...ja, leitet: () => false }), false, 'ein Mitglied übernimmt nichts');
  assert.equal(sollReiseUebernehmen(REISE, { ...ja, istGruppe: () => false }), false, 'eine alte Familie wird zuerst eine Gruppe');
});

/* ── Der Kalender und das .ics ────────────────────────────────────── */

test('im Kalender trägt ein Termin sein Programm, und das Programm reicht den Eintrag', async () => {
  const termin = {
    id: 'e1', art: 'training', titel: 'Ausflug', von: '2026-09-15', zeit: '10:00', bisZeit: '12:00',
    programm: [{ id: 'p1', date: '2026-09-15', title: 'A' }, { id: 'p2', date: '2026-09-16', title: 'B' }],
  };
  const e = ausTeamTermin(termin, { id: 'g1', name: 'Kader', art: 'kader' }, '#123');
  assert.equal(e.stops.length, 2);
  assert.equal(e.bis, '2026-09-16', 'ein Punkt am Folgetag verlängert den Eintrag');
  assert.equal(e.zeit, '', 'mehrtägig durch das Programm — dann keine Uhrzeit an allen Tagen');

  const kurz = ausTeamTermin({ ...termin, programm: [] }, { id: 'g1' }, '#123');
  assert.equal(kurz.zeit, '10:00');
  assert.equal(kurz.bisZeit, '12:00', 'das Ende am Tag hatte bis v.35.49.0 nur die Reise');
  assert.match(zeitraum(termin, 'de-CH'), /10:00–12:00$/);

  assert.deepEqual(alsIcsEintrag({ ...termin, ort: 'Vaduz', notiz: 'n' }, 'g1'), {
    id: 'g1-e1@firn', title: 'Ausflug', startDate: '2026-09-15', endDate: '2026-09-15',
    startTime: '10:00', endTime: '12:00', location: 'Vaduz', description: 'n',
  });
  assert.deepEqual(pruefe({ art: 'training', titel: 'x', von: '2026-09-15', zeit: '10:00', bisZeit: '09:00' }),
    ['Das Ende liegt vor dem Anfang.']);

  /* In der Liste: ein Programmpunkt öffnet das Programm, abhaken lässt er sich nicht. */
  const ansicht = await read('assets/js/feature/kalender/ansicht.js');
  assert.match(ansicht, /<button class="kal-stop\$\{vorbei \? ' is-vorbei' : ''\}" type="button" data-programm=/);
  assert.doesNotMatch(ansicht, /data-stop=/);
});

/* ── Die Regeln ───────────────────────────────────────────────────── */

test('Regeln: schreiben darf nur die Leitung, packen jeder für sich, ein Gast sieht genau einen Termin', async () => {
  const rules = await read('firestore.rules');
  const block = rules.slice(rules.indexOf('match /groups/{gid}/events/{eid} {'),
    rules.indexOf('match /groups/{gid}/events/{eid}/anhaenge/{id}'));

  assert.match(block, /allow get: if inGroup\(gid\) \|\| terminGast\(eid, resource\.data\);/);
  assert.match(block, /allow list: if inGroup\(gid\);/);
  assert.match(block, /allow update: if leadsGroup\(gid\)\s*&& request\.resource\.data\.diff/,
    'ein Mitglied ändert am Termin nichts — auch nicht durch Abhaken');
  assert.doesNotMatch(block, /programmErledigt/);
  assert.match(block, /'programm', 'planHtml', 'planUrl', 'gastToken', 'abfahrten', 'packliste'/);
  assert.match(block, /d\.planHtml\.size\(\) <= 900000/);
  assert.match(block, /d\.abfahrten is map && d\.abfahrten\.size\(\) <= 300/);

  const gast = rules.match(/function terminGast\(eid, termin\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(gast, /termin\.get\('gastToken', ''\) != ''/);
  assert.match(gast, /guestAccess\/\$\(request\.auth\.uid \+ '_' \+ eid\)\)\.data\.token\s*== termin\.gastToken/);
  const zugang = rules.match(/match \/guestAccess\/\{docId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(zugang, /docId == \(request\.resource\.data\.uid \+ '_' \+ request\.resource\.data\.eid\)/);

  /* Die Packliste: abgehakt wird unter der eigenen uid, und nur dort. */
  const gepackt = rules.match(/match \/groups\/\{gid\}\/events\/\{eid\}\/gepackt\/\{uid\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(gepackt, /allow get: if inGroup\(gid\) && \(request\.auth\.uid == uid \|\| leadsGroup\(gid\)\);/);
  assert.match(gepackt, /allow list: if leadsGroup\(gid\);/);
  assert.match(gepackt, /allow create, update: if inGroup\(gid\)\s*&& request\.auth\.uid == uid\s*&& request\.resource\.data\.uid == uid/);
  assert.doesNotMatch(rules, /events\/\{eid\}\/aufgaben/, 'keine Liste mehr, in die jeder schreibt');

  /* Unterlagen bringt die Leitung. */
  const anhaenge = rules.match(/match \/groups\/\{gid\}\/events\/\{eid\}\/anhaenge\/\{id\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(anhaenge, /allow create, update: if leadsGroup\(gid\)/);
  assert.match(anhaenge, /allow delete: if leadsGroup\(gid\);/);
});

/* ── Der Gruppe-Tab ───────────────────────────────────────────────── */

const MIT_PROGRAMM = {
  id: 'e1', art: 'lager', titel: 'Herbstferien', von: '2026-08-10', bis: '2026-08-12', ort: 'Toskana',
  notiz: 'Ferienhaus ab 15 Uhr.', planHtml: SEITE,
  programm: [{ id: 'p1', date: '2026-08-04', time: '06:30', title: 'Abfahrt' }, { id: 'p2', date: '2026-08-11', title: 'Siena' }],
  abfahrten: { timo: { zeit: '06:30', ort: 'Bahnhof Buchs' }, lea: { zeit: '07:00', ort: 'Schaan' } },
  packliste: [{ id: 'm', name: 'Yogamatte' }, { id: 's', name: 'Aussen-Turnschuhe' }],
};
const offen = doc => !doc.getElementById('secDetail').hidden;

test('Gruppe: ein Mitglied sieht Programm und Abfahrt, packt für sich — und ändert nichts', async () => {
  const { doc, zurueck } = await starteGruppe({ suche: '?g=g1&termin=e1', termine: [MIT_PROGRAMM] });
  try {
    assert.ok(await warte(() => offen(doc)), 'der Termin geht nicht auf');
    assert.equal(doc.getElementById('dNotiz').textContent, 'Ferienhaus ab 15 Uhr.');
    assert.match(doc.getElementById('abfahrtMeine').textContent, /Deine Abfahrt\s*06:30 · Bahnhof Buchs/);
    assert.equal(doc.getElementById('grpAbfahrten').hidden, true, 'die ganze Liste sieht die Leitung');

    assert.equal(doc.getElementById('grpProgramm').hidden, false);
    assert.equal(doc.querySelectorAll('#listProgramm .prog-punkt').length, 2);
    assert.equal(doc.querySelectorAll('#listProgramm .prog-punkt.is-vorbei').length, 1, 'die Abfahrt am 4. August ist vorbei (heute: 5.)');
    assert.equal(doc.querySelector('#listProgramm [data-punkt-haken], #listProgramm .haken'), null, 'ein Programm wird nicht abgehakt');
    assert.equal(doc.querySelector('#listProgramm [data-punkt]'), null);
    assert.equal(doc.getElementById('progNeu').hidden, true);
    for (const id of ['btnBearbeiten', 'btnGastLink', 'btnAbfahrten', 'anhangKnopf']) {
      assert.equal(doc.getElementById(id).hidden, true, `${id} gehört der Leitung`);
    }

    /* Die Packliste: die Punkte der Leitung, abgehakt für sich. */
    assert.ok(await warte(() => doc.querySelectorAll('#listPackliste .pack-punkt').length === 2));
    assert.equal(doc.querySelector('#listPackliste [data-pack-aendern]'), null, 'die Punkte der Leitung ändert ein Mitglied nicht');
    klick(doc.querySelector('[data-pack-haken="m"]'));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'gepacktSetzen')));
    const [, gid, eid, uid, stand] = globalThis.__aufrufe.find(a => a[0] === 'gepacktSetzen');
    assert.deepEqual([gid, eid, uid, stand.erledigt], ['g1', 'e1', 'timo', { m: true }]);
    assert.equal(doc.getElementById('packStand').textContent, '1 / 2');

    /* Ein eigener Punkt: nur für sich. */
    doc.getElementById('packName').value = 'Ladekabel';
    doc.getElementById('packNeu').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true, bubbles: true }));
    assert.ok(await warte(() => globalThis.__aufrufe.filter(a => a[0] === 'gepacktSetzen').length === 2));
    assert.deepEqual(globalThis.__aufrufe.filter(a => a[0] === 'gepacktSetzen')[1][4].eigene.map(p => p.name), ['Ladekabel']);
    assert.equal(globalThis.__aufrufe.some(a => a[0] === 'terminAendern'), false, 'ein Mitglied schreibt nie in den Termin');
  } finally { zurueck(); }
});

const LEITUNG = [{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'head' }];
const KADER = [
  { uid: 'michel', name: 'Michel', rolle: 'head' },
  { uid: 'timo', name: 'Timothy', rolle: 'mitglied' },
  { uid: 'lea', name: 'Lea', rolle: 'mitglied' },
];

test('Gruppe: die Leitung ändert einen Programmpunkt, trägt Abfahrten ein und pflegt die Packliste', async () => {
  const { doc, window, zurueck } = await starteGruppe({
    suche: '?g=g1&termin=e1', termine: [MIT_PROGRAMM], gruppen: LEITUNG, mitglieder: KADER,
  });
  try {
    assert.ok(await warte(() => offen(doc)));
    assert.ok(globalThis.__aufrufe.some(a => a[0] === 'reisenDerGruppeUebernehmen' && a[1] === 'g1'),
      'die Leitung übernimmt die Reisen ihrer Gruppe');

    /* Ein Punkt: antippen, ändern, speichern. */
    klick(doc.querySelector('#listProgramm [data-punkt="p2"]'));
    assert.equal(doc.getElementById('pTitel').value, 'Siena');
    assert.equal(doc.getElementById('btnPunkt').textContent, 'Speichern');
    doc.getElementById('pZeit').value = '10:00';
    doc.getElementById('pNotiz').value = 'Treffpunkt Piazza';
    klick(doc.getElementById('btnPunkt'));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'programmSetzen')));
    const programm = globalThis.__aufrufe.find(a => a[0] === 'programmSetzen')[3];
    assert.deepEqual(programm.find(p => p.id === 'p2'), { id: 'p2', title: 'Siena', date: '2026-08-11', time: '10:00', notes: 'Treffpunkt Piazza' });
    assert.equal(programm.length, 2, 'geändert, nicht dazugekommen');

    /* Abfahrten: für alle, dann eine anpassen. */
    assert.equal(doc.getElementById('grpAbfahrten').hidden, false);
    klick(doc.getElementById('btnAbfahrten'));
    assert.equal(doc.querySelectorAll('#abfahrtZeilen [data-abfahrt]').length, 3);
    const alle = doc.getElementById('abfahrtAlleOrt');
    alle.value = 'Bahnhof Buchs';
    alle.dispatchEvent(new window.Event('input'));
    doc.querySelector('[data-abfahrt="lea"] [data-feld="ort"]').value = 'Schaan';
    doc.querySelector('[data-abfahrt="michel"] [data-feld="zeit"]').value = '';
    klick(doc.getElementById('btnAbfahrtenSpeichern'));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'terminAendern' && a[3].abfahrten)));
    assert.deepEqual(globalThis.__aufrufe.find(a => a[0] === 'terminAendern' && a[3].abfahrten)[3].abfahrten, {
      michel: { ort: 'Bahnhof Buchs' }, timo: { zeit: '06:30', ort: 'Bahnhof Buchs' }, lea: { zeit: '07:00', ort: 'Schaan' },
    });

    /* Die Packliste: die Leitung schreibt für alle und benennt um. */
    doc.getElementById('packName').value = 'Trinkflasche';
    doc.getElementById('packNeu').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'terminAendern' && a[3].packliste)));
    assert.deepEqual(globalThis.__aufrufe.find(a => a[0] === 'terminAendern' && a[3].packliste)[3].packliste.map(p => p.name),
      ['Yogamatte', 'Aussen-Turnschuhe', 'Trinkflasche']);
    assert.ok(doc.querySelector('#listPackliste [data-pack-aendern="m"]'), 'die Leitung bearbeitet ihre Punkte');
  } finally { zurueck(); }
});

test('Gruppe: die Leitung bearbeitet einen Termin — die Art bleibt, das Programm auch', async () => {
  const { doc, zurueck } = await starteGruppe({ suche: '?g=g1&termin=e1', termine: [MIT_PROGRAMM], gruppen: LEITUNG });
  try {
    assert.ok(await warte(() => offen(doc)));
    klick(doc.getElementById('btnBearbeiten'));
    assert.equal(doc.getElementById('secForm').hidden, false);
    assert.equal(doc.getElementById('grpArt').hidden, true, 'die Art lässt sich nicht ändern');
    assert.equal(doc.getElementById('formTitel').textContent, 'Termin bearbeiten');
    assert.equal(doc.getElementById('fTitel').value, 'Herbstferien');
    assert.equal(doc.getElementById('fBis').value, '2026-08-12');
    assert.equal(doc.getElementById('fNotiz').value, 'Ferienhaus ab 15 Uhr.');
    assert.equal(doc.getElementById('grpSeite').hidden, false, 'die Seite steht offen, weil es eine gibt');
    assert.equal(doc.getElementById('fHaeufig').hidden, true, 'beim Bearbeiten keine Vorlagen');

    doc.getElementById('fTitel').value = 'Herbstferien Toskana';
    klick(doc.getElementById('btnSpeichern'));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'terminAendern')));
    const [, gid, eid, daten] = globalThis.__aufrufe.find(a => a[0] === 'terminAendern');
    assert.deepEqual([gid, eid, daten.titel], ['g1', 'e1', 'Herbstferien Toskana']);
    assert.equal(daten.programm, MIT_PROGRAMM.programm, 'dieselbe Seite liest das Programm nicht neu ein');
    assert.ok(await warte(() => offen(doc)), 'nach dem Speichern geht es zurück in den Termin');
  } finally { zurueck(); }
});

test('Gruppe: ein neuer Termin mit eingefügter Seite trägt ihr Programm nach Tagen', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: LEITUNG });
  try {
    klick(doc.getElementById('btnTermin'));
    assert.equal(doc.getElementById('grpSeite').hidden, true, 'zugeklappt, bis man sie braucht');
    doc.getElementById('fTitel').value = 'Museumstag';
    doc.getElementById('fVon').value = '2026-09-15';
    klick(doc.getElementById('btnSeite'));
    doc.getElementById('fSeiteHtml').value = SEITE;
    doc.getElementById('fSeiteHtml').dispatchEvent(new doc.defaultView.Event('input'));
    assert.match(doc.getElementById('fSeiteStatus').textContent, /3 Programmpunkte an 2 Tagen/);

    klick(doc.getElementById('btnSpeichern'));
    assert.ok(await warte(() => globalThis.__aufrufe.some(a => a[0] === 'terminAnlegen')));
    const termin = globalThis.__aufrufe.find(a => a[0] === 'terminAnlegen')[3];
    assert.equal(termin.planHtml, SEITE.trim());
    assert.deepEqual(termin.programm.map(p => p.date), ['2026-09-15', '2026-09-15', '2026-09-16']);
  } finally { zurueck(); }
});

test('Gruppe: was oft vorkommt, steht zum Antippen da und füllt das Formular', async () => {
  const kondi = { art: 'training', titel: 'Kondi Halle', zeit: '18:00', bisZeit: '19:30', ort: 'Malbun' };
  const { doc, zurueck } = await starteGruppe({
    gruppen: LEITUNG,
    termine: [
      { id: 'k1', von: '2026-08-03', ...kondi }, { id: 'k2', von: '2026-08-10', ...kondi },
      { id: 'k3', von: '2026-08-17', ...kondi }, { id: 'x', art: 'rennen', titel: 'FIS RS', von: '2026-09-01', ort: 'Pitztal' },
    ],
  });
  try {
    await warte(() => false, 5);
    klick(doc.getElementById('btnTermin'));
    const knoepfe = [...doc.querySelectorAll('#fHaeufig [data-vorlage]')];
    assert.equal(knoepfe.length, 1, 'nur, was mindestens zweimal vorkam');
    assert.match(knoepfe[0].textContent, /Kondi Halle\s*18:00 · Malbun/);
    klick(knoepfe[0]);
    assert.equal(doc.getElementById('fTitel').value, 'Kondi Halle');
    assert.equal(doc.getElementById('fZeit').value, '18:00');
    assert.equal(doc.getElementById('fBisZeit').value, '19:30');
    assert.equal(doc.getElementById('fOrt').value, 'Malbun');
    /* Und die Orte stehen als Vorschläge am Feld. */
    assert.deepEqual([...doc.querySelectorAll('#ortVorschlaege option')].map(o => o.value), ['Malbun', 'Pitztal']);
    assert.equal(doc.getElementById('fOrt').getAttribute('list'), 'ortVorschlaege');
  } finally { zurueck(); }
});

test('Gruppe: ein Link als Seite muss http(s) sein', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: LEITUNG });
  try {
    klick(doc.getElementById('btnTermin'));
    doc.getElementById('fTitel').value = 'Ausflug';
    klick(doc.getElementById('btnSeite'));
    klick(doc.querySelector('[data-seite-art="link"]'));
    doc.getElementById('fSeiteLink').value = 'javascript:alert(1)';
    klick(doc.getElementById('btnSpeichern'));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(globalThis.__aufrufe.some(a => a[0] === 'terminAnlegen'), false);
    assert.equal(doc.getElementById('formFehler').textContent, 'Der Link muss mit https:// beginnen.');
  } finally { zurueck(); }
});

/* ── Was es nicht mehr gibt ───────────────────────────────────────── */

test('der Kalender legt keine Reise mehr an, hakt nichts ab und übernimmt die alten', async () => {
  const kalender = await read('assets/js/feature/kalender/kalender.js');
  assert.doesNotMatch(kalender, /addDoc\(collection\(db,\s*'trips'\)/, 'der Kalender schreibt wieder neue Reisen');
  assert.doesNotMatch(kalender, /itineraryDone|programmErledigt|beiStop/, 'im Kalender wird wieder abgehakt');
  assert.match(kalender, /eineReiseUebernehmen\(reise, user\.uid, team\.art\)/);
  assert.match(kalender, /!reise\.uebernommen\s*&& !\(teamTermine\.get\(reise\.familyId\) \|\| \[\]\)\.some\(termin => termin\.id === reise\.id\)/);
  const heute = await read('assets/js/feature/start/heute.js');
  assert.match(heute, /if \(x\.uebernommen\) return;/);
});
