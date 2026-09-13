/* Der Bereich Training — gefahren, nicht gelesen.

   Michel: "Der Bereich Training sollte gleich alle Übungen usw. aus der
   Gruppe auslesen können." Bis v.35.26.0 hatte er seinen eigenen Import
   und Speicher. Diese Tests laden die neue Seite mit Gruppen und
   Plaenen als Attrappe und Timothys echter KW 31 als Plan.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteTraining, klick, warte, root } from './gruppe-harness.mjs';
import { parseProgram } from '../assets/js/training-parser.js';

const programm = parseProgram(JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8')));
const json = JSON.stringify(programm);

test('ohne Gruppe sagt die Seite, woher das Training kommt, und fuehrt dorthin', async () => {
  const { doc, zurueck } = await starteTraining({ gruppen: [] });
  try {
    assert.equal(doc.getElementById('secOhne').hidden, false);
    assert.equal(doc.getElementById('secWoche').hidden, true);
    assert.match(doc.getElementById('ohneText').textContent, /Gruppe/);
    assert.equal(doc.getElementById('lnkGruppe').getAttribute('href'), './gruppe.html');
  } finally { zurueck(); }
});

test('mit Gruppe, aber ohne Plan: der Athlet erfaehrt, dass der Trainer noch nichts veroeffentlicht hat', async () => {
  const { doc, zurueck } = await starteTraining({ plaene: [] });
  try {
    assert.equal(doc.getElementById('secOhne').hidden, false);
    assert.match(doc.getElementById('ohneText').textContent, /Trainer/);
  } finally { zurueck(); }
});

test('die Leitung ohne Plan wird zum Einlesen geschickt', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'TEST', art: 'kader', meineRolle: 'head' }],
    plaene: [],
  });
  try {
    assert.match(doc.getElementById('ohneText').textContent, /Excel/);
    assert.match(doc.getElementById('lnkGruppe').textContent, /veröffentlichen/);
  } finally { zurueck(); }
});

const tag = (doc, datum) => doc.querySelector(`.agenda__tag[data-datum="${datum}"]`);
const planIds = doc => [...doc.querySelectorAll('.agenda a.row')].map(a => new URL(a.href).searchParams.get('p'));

test('der Plan der Gruppe steht als Woche da, heute markiert, und fuehrt in den Player zurueck ins Training', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV Perspektivkader', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json }],
  });
  try {
    assert.equal(doc.getElementById('secWoche').hidden, false);
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'BSV Perspektivkader');
    assert.equal(doc.querySelectorAll('.agenda__tag').length, 7);
    assert.equal(tag(doc, '2026-08-05').classList.contains('ist-heute'), true);

    const ziel = new URL(tag(doc, '2026-08-05').querySelector('a.row').href);
    assert.equal(ziel.pathname, '/pages/einheit.html');
    assert.equal(ziel.searchParams.get('g'), 'g1');
    assert.equal(ziel.searchParams.get('z'), 'training', 'der Player fuehrt ins Training zurueck, nicht in die Gruppe');

    const di = [...tag(doc, '2026-08-04').querySelectorAll('.row__title')].map(e => e.textContent);
    assert.deepEqual(di, ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
    assert.equal(doc.querySelectorAll('.agenda__neu').length, 0, 'Termine legt man in der Gruppe an');
  } finally { zurueck(); }
});

test('Plaene aus zwei Gruppen stehen in derselben Woche, mit dem Namen der Gruppe', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [
      { id: 'g1', name: 'BSV Perspektivkader', art: 'kader', meineRolle: 'mitglied' },
      { id: 'g2', name: 'Gym Malbun', art: 'organisation', meineRolle: 'mitglied' },
    ],
    plaene: {
      g1: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json }],
      g2: [{ id: 'p9', titel: 'Kraftblock', fuer: 'alle', json }],
    },
  });
  try {
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'Aus deinen Gruppen');
    const mi = tag(doc, '2026-08-05');
    const ziele = [...mi.querySelectorAll('a.row')].map(a => new URL(a.href).searchParams.get('g'));
    assert.deepEqual([...new Set(ziele)].sort(), ['g1', 'g2'], 'eine Woche, beide Gruppen');
    assert.match(mi.textContent, /Gym Malbun/, 'bei mehreren Gruppen steht dabei, woher');
  } finally { zurueck(); }
});

test('die Termine aller Gruppen stehen in der Woche und oeffnen sich in ihrer Gruppe', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV Perspektivkader', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json }],
    termine: [{ id: 't1', art: 'training', titel: 'Kondi Halle', von: '2026-08-06', zeit: '18:00' }],
  });
  try {
    await warte(() => doc.querySelector('[data-termin="t1"]'));
    const zeile = tag(doc, '2026-08-06').querySelector('[data-termin="t1"]');
    assert.ok(zeile, 'der Termin fehlt in der Woche');
    let ziel = '';
    doc.defaultView.tvzaNavigate = href => { ziel = href; return true; };
    klick(zeile);
    const url = new URL(ziel);
    assert.equal(url.pathname, '/pages/gruppe.html');
    assert.equal(url.searchParams.get('g'), 'g1');
    assert.equal(url.searchParams.get('termin'), 't1');
  } finally { zurueck(); }
});

test('die Leitung sieht hier ihr Training, nicht die Einzelplaene ihrer Athleten', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'TEST', art: 'kader', meineRolle: 'head' }],
    plaene: [
      { id: 'p1', titel: 'KW 31', fuer: 'alle', json },
      { id: 'p2', titel: 'Nur Lena', fuer: 'lena', json },
      { id: 'p3', titel: 'Nur ich', fuer: 'timo', json },
    ],
  });
  try {
    assert.deepEqual([...new Set(planIds(doc))].sort(), ['p1', 'p3']);
  } finally { zurueck(); }
});
