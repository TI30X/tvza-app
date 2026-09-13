/* Die Woche der Gruppe — gefahren, nicht gelesen.

   Seit v.35.42.0 ein Kalender, senkrecht wie bei Spond: oben blättert
   man die Woche, darunter steht jeder Tag mit seinen Terminen und den
   Einheiten aus den Plänen. Michel: "Kann man nicht Woche vor oder
   zurück?" und "besser in einer vertikalen Leiste wie Spond — man
   sollte ja noch eintragen können, was für Termine anstehen."

   Timothys echte KW 31 als Plan (dev/fixtures/kw31-grid.json), die
   Seite im jsdom mit Attrappen für Firestore (gruppe-harness.mjs). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { starteGruppe, klick, warte } from './gruppe-harness.mjs';
import { parseProgram } from '../assets/js/training-parser.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const programm = parseProgram(JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8')));
const json = JSON.stringify(programm);

/* Der Plan liegt vom 3. bis 9. August 2026. Damit "Heute" prüfbar ist,
   tut die Seite so, als wäre Mittwoch dieser Woche. */
const HEUTE = '2026-08-05';
const LEITUNG = [{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'head' }];
const MITGLIEDER = [{ uid: 'timo', name: 'Timothy', rolle: 'head' }, { uid: 'lea', name: 'Lea', rolle: 'mitglied' }];
const planFuerAlle = { id: 'p1', titel: 'Woche 31 — Kraft', fuer: 'alle', json };

/* Am Mittwoch abgehakt: die Ausdauer-Einheit ganz. */
const protokollMittwoch = [{
  uid: 'timo', datum: HEUTE,
  units: { ausdauer: { items: Object.fromEntries(programm.units.ausdauer.items.map(i => [i.key, { done: true }])) } },
}];

const TERMINE = [
  { id: 't1', art: 'training', titel: 'Kondi Halle', von: '2026-08-06', zeit: '18:00', ort: 'Malbun' },
  { id: 't2', art: 'lager', titel: 'Sommerlager', von: '2026-08-08', bis: '2026-08-10' },
  { id: 't3', art: 'rennen', titel: 'FIS RS Saas-Fee', von: '2026-08-20', zeit: '09:30' },
];

async function starte(o = {}) {
  const w = await starteGruppe({
    plaene: [planFuerAlle], protokolle: protokollMittwoch, heute: HEUTE, mitglieder: MITGLIEDER,
    bereit: d => !d.getElementById('agenda').hidden && d.querySelector('.agenda__tag'),
    ...o,
  });
  /* Die Termine kommen wie von onSnapshot: einen Moment später. */
  if (o.termine?.length) await warte(() => w.doc.querySelector('.agenda__termin'));
  return w;
}
const tag = (doc, datum) => doc.querySelector(`.agenda__tag[data-datum="${datum}"]`);
const titel = (el) => [...el.querySelectorAll('.row__title')].map(x => x.textContent);

test('die Woche steht als sieben Tage untereinander, heute markiert, mit dem Namen aus der Excel', async () => {
  const { doc, zurueck } = await starte();
  try {
    assert.deepEqual(globalThis.__fehler, []);
    assert.equal(doc.querySelectorAll('.agenda__tag').length, 7);
    assert.equal(doc.querySelectorAll('.agenda__tag.ist-heute').length, 1);
    assert.equal(tag(doc, HEUTE).classList.contains('ist-heute'), true);
    /* Die Daten der Woche, und die Nummer so, wie sie in der Excel steht
       — die Vorlage zählt nicht nach ISO. */
    assert.match(doc.querySelector('.agenda__daten').textContent, /3\..*Aug.*9\..*Aug/);
    assert.match(doc.querySelector('.agenda__kw').textContent, /^KW 31/);
    assert.doesNotMatch(doc.querySelector('.agenda__kopf').textContent, /Kraft/, 'der getippte Titel gehört nicht in den Kopf');
    assert.equal(doc.querySelector('[data-blaettern="0"]').hidden, true, '"Heute" braucht es in dieser Woche nicht');
    assert.equal(doc.getElementById('planPerson').hidden, true, 'ohne Einzelpläne keine Personenwahl');
  } finally { zurueck(); }
});

test('jeder Tag trägt seine Einheiten mit Tageshälfte und Fortschritt', async () => {
  const { doc, zurueck } = await starte();
  try {
    const mi = tag(doc, HEUTE);
    assert.deepEqual(titel(mi), ['Intervall INTENSIV 4x5 min (Joggen)', 'Rumpf']);
    assert.deepEqual([...mi.querySelectorAll('.eintrag__slot')].map(x => x.textContent), ['Vormittag', 'Nachmittag']);
    const erste = mi.querySelector('a.row');
    assert.match(erste.querySelector('.row__zaehler').textContent, /^(\d+)\/\1$/, 'Ausdauer ist ganz erledigt');
    assert.equal(erste.querySelector('.row__bar > i').style.width, '100%');

    assert.deepEqual(titel(tag(doc, '2026-08-04')), ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
    assert.equal(tag(doc, '2026-08-04').querySelector('.row__bar > i').style.width, '0%',
      'dieselbe Einheit an einem anderen Tag ist ein anderes Training');

    const ohne = tag(doc, '2026-08-06').querySelector('.row--ohneBlatt');
    assert.ok(ohne, '"evtl. Spiel" fehlt');
    assert.equal(ohne.tagName, 'DIV', 'kein Link — es gibt nichts zu öffnen');

    assert.equal(tag(doc, '2026-08-09').classList.contains('ist-leer'), true, 'der Sonntag ist eine leere Zeile');
    assert.equal(tag(doc, '2026-08-09').querySelectorAll('.row').length, 0);
  } finally { zurueck(); }
});

test('eine Einheit führt in den Player, mit Gruppe, Plan, Blatt und dem geplanten Tag', async () => {
  const { doc, zurueck } = await starte();
  try {
    const ziel = new URL(tag(doc, HEUTE).querySelector('a.row').href, 'https://firn.test/pages/');
    assert.equal(ziel.pathname, '/pages/einheit.html');
    assert.deepEqual(['g', 'p', 'u', 'd', 'z'].map(k => ziel.searchParams.get(k)), ['g1', 'p1', 'ausdauer', HEUTE, 'gruppe']);
  } finally { zurueck(); }
});

test('man blättert vor und zurück, und "Heute" führt heim', async () => {
  const { doc, zurueck } = await starte();
  try {
    klick(doc.querySelector('[data-blaettern="1"]'));
    assert.match(doc.querySelector('.agenda__daten').textContent, /10\..*Aug.*16\..*Aug/);
    assert.equal(doc.querySelector('.agenda__kw').textContent, '', 'eine Woche ohne Plan nennt keine KW');
    assert.match(doc.querySelector('.agenda__nichts').textContent, /nichts geplant/);
    assert.equal(doc.querySelector('[data-blaettern="0"]').hidden, false);

    klick(doc.querySelector('[data-blaettern="-1"]'));
    klick(doc.querySelector('[data-blaettern="-1"]'));
    assert.match(doc.querySelector('.agenda__daten').textContent, /27\..*Juli?.*2\..*Aug/);

    klick(doc.querySelector('[data-blaettern="0"]'));
    assert.match(doc.querySelector('.agenda__daten').textContent, /3\..*Aug.*9\..*Aug/);
    assert.equal(tag(doc, HEUTE).classList.contains('ist-heute'), true);
  } finally { zurueck(); }
});

test('Termine stehen an ihrem Tag, ein Lager an jedem seiner Tage, und was danach kommt, darunter', async () => {
  const { doc, zurueck } = await starte({ termine: TERMINE });
  try {
    const do_ = tag(doc, '2026-08-06');
    assert.equal(titel(do_)[0], 'Kondi Halle', 'der Termin steht vor den Einheiten des Tages');
    assert.match(do_.querySelector('.agenda__termin .row__sub').textContent, /18:00 · Malbun/);
    assert.ok(tag(doc, '2026-08-08').querySelector('[data-termin="t2"]'));
    assert.ok(tag(doc, '2026-08-09').querySelector('[data-termin="t2"]'), 'das Lager läuft am Sonntag weiter');
    const danach = doc.querySelector('.agenda__danach + .rows [data-termin]');
    assert.equal(danach?.dataset.termin, 't3', 'das Rennen in zwei Wochen fehlt unter der Woche');
  } finally { zurueck(); }
});

test('ein Tipp auf einen Termin öffnet ihn', async () => {
  const { doc, zurueck } = await starte({ termine: TERMINE });
  try {
    klick(tag(doc, '2026-08-06').querySelector('[data-termin="t1"]'));
    await warte(() => !doc.getElementById('secDetail').hidden);
    assert.equal(doc.getElementById('secDetail').hidden, false);
    assert.equal(doc.getElementById('secWoche').hidden, true);
  } finally { zurueck(); }
});

test('die Leitung legt einen Termin an genau dem Tag an, an dem sie "+" tippt', async () => {
  const { doc, zurueck } = await starte({ gruppen: LEITUNG });
  try {
    assert.equal(doc.querySelectorAll('.agenda__neu').length, 7);
    klick(tag(doc, '2026-08-07').querySelector('.agenda__neu'));
    assert.equal(doc.getElementById('secForm').hidden, false);
    assert.equal(doc.getElementById('fVon').value, '2026-08-07');
    /* Der Knopf unter der Woche bleibt, und dort gilt heute. */
    klick(doc.getElementById('btnAbbrechen'));
    klick(doc.getElementById('btnTermin'));
    assert.equal(doc.getElementById('fVon').value, HEUTE);
  } finally { zurueck(); }
});

test('ein Mitglied hat kein "+"', async () => {
  const { doc, zurueck } = await starte();
  try {
    assert.equal(doc.querySelectorAll('.agenda__neu').length, 0);
  } finally { zurueck(); }
});

test('die Leitung wählt, wessen Woche — und sieht dann dessen Plan und dessen Fortschritt', async () => {
  const { doc, zurueck } = await starte({
    gruppen: LEITUNG,
    plaene: [planFuerAlle, { id: 'p2', titel: 'KW 31 Lea', fuer: 'lea', json }],
  });
  try {
    const wahl = doc.getElementById('planPerson');
    assert.equal(wahl.hidden, false);
    assert.deepEqual([...wahl.options].map(o => o.textContent), ['Alle in der Gruppe', 'Lea']);
    assert.equal(wahl.value, 'alle');
    const plaeneAm = () => [...tag(doc, HEUTE).querySelectorAll('a.row')].map(a => new URL(a.href, 'https://firn.test/').searchParams.get('p'));
    assert.deepEqual([...new Set(plaeneAm())], ['p1'], 'in der Woche der Gruppe steht Leas Plan nicht');

    wahl.value = 'lea';
    wahl.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    await warte(() => plaeneAm().includes('p2'));
    assert.deepEqual([...new Set(plaeneAm())].sort(), ['p1', 'p2'], 'Leas Woche: der Plan für alle und ihrer');
    assert.deepEqual(globalThis.__aufrufe.filter(a => a[0] === 'ladeProtokolle').at(-1), ['ladeProtokolle', 'g1', 'lea'],
      'die Leitung sieht Leas Fortschritt, nicht den eigenen');
  } finally { zurueck(); }
});

test('wer nur Einzelpläne einliest, landet in der Woche des ersten Athleten', async () => {
  const { doc, zurueck } = await starte({
    gruppen: LEITUNG,
    plaene: [{ id: 'p2', titel: 'KW 31 Lea', fuer: 'lea', json }],
  });
  try {
    assert.equal(doc.getElementById('planPerson').value, 'lea');
    assert.ok(tag(doc, HEUTE).querySelector('a.row'), 'die Woche steht leer');
  } finally { zurueck(); }
});

test('eine vergangene Excel öffnet in ihrer Woche, nicht im leeren Heute', async () => {
  const { doc, zurueck } = await starte({ heute: '2026-09-13' });
  try {
    assert.match(doc.querySelector('.agenda__daten').textContent, /3\..*Aug.*9\..*Aug/);
    assert.equal(doc.querySelector('[data-blaettern="0"]').hidden, false);
  } finally { zurueck(); }
});

test('ohne Plan steht die Woche mit ihren Terminen und ein Satz', async () => {
  const { doc, zurueck } = await starte({ plaene: [], termine: TERMINE });
  try {
    assert.equal(doc.getElementById('agenda').hidden, false);
    assert.ok(tag(doc, '2026-08-06').querySelector('[data-termin="t1"]'));
    assert.match(doc.getElementById('agenda').textContent, /noch kein Plan bereit/i);
  } finally { zurueck(); }
});

test('ein unlesbarer Plan nimmt die Gruppenseite nicht mit', async () => {
  const { doc, zurueck } = await starte({ plaene: [{ id: 'px', titel: 'Kaputt', fuer: 'alle', json: '{nicht mal JSON' }] });
  try {
    assert.equal(doc.getElementById('secMitglieder').hidden, false);
    assert.equal(doc.querySelectorAll('.agenda a.row').length, 0);
    assert.equal(globalThis.__fehler.some(([wo]) => wo === 'gruppe/planLesen'), true, 'der Fehler wird gemeldet, nicht verschluckt');
  } finally { zurueck(); }
});

test('aus dem Bereich Training: ?g=&termin= öffnet den Termin in seiner Gruppe', async () => {
  const { doc, zurueck } = await starteGruppe({
    suche: '?g=g1&termin=t1', plaene: [planFuerAlle], heute: HEUTE, mitglieder: MITGLIEDER,
    termine: TERMINE,
    bereit: d => !d.getElementById('secDetail').hidden,
  });
  try {
    assert.equal(doc.getElementById('secDetail').hidden, false, 'der Termin geht nicht auf');
    assert.equal(doc.getElementById('secWoche').hidden, true);
  } finally { zurueck(); }
});
