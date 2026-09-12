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

test('der Plan der Gruppe steht als Woche da, heute offen, und fuehrt in den Player zurueck ins Training', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV Perspektivkader', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json }],
  });
  try {
    assert.equal(doc.getElementById('secWoche').hidden, false);
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'BSV Perspektivkader');
    assert.equal(doc.querySelectorAll('#wocheStreifen .woche__tag').length, 7);
    assert.equal(doc.querySelector('#wocheStreifen [aria-selected="true"]').dataset.tag, 'mi');
    assert.equal(doc.getElementById('planWahl').hidden, true, 'ein Plan braucht keine Auswahl');

    const ziel = new URL(doc.querySelector('#listPlaene a.row').href);
    assert.equal(ziel.pathname, '/pages/einheit.html');
    assert.equal(ziel.searchParams.get('g'), 'g1');
    assert.equal(ziel.searchParams.get('z'), 'training', 'der Player fuehrt ins Training zurueck, nicht in die Gruppe');

    klick(doc.querySelector('#wocheStreifen [data-tag="di"]'));
    const titel = [...doc.querySelectorAll('#listPlaene .row__title')].map(e => e.textContent);
    assert.deepEqual(titel, ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
  } finally { zurueck(); }
});

test('Plaene aus zwei Gruppen stehen zur Wahl, mit dem Namen der Gruppe davor', async () => {
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
    const wahl = doc.getElementById('planWahl');
    assert.equal(wahl.hidden, false);
    assert.deepEqual([...wahl.options].map(o => o.textContent),
      ['BSV Perspektivkader — KW 31', 'Gym Malbun — Kraftblock']);

    wahl.value = 'g2/p9';
    wahl.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    await warte(() => doc.getElementById('wocheGruppe').textContent === 'Gym Malbun');
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'Gym Malbun');
    const ziel = new URL(doc.querySelector('#listPlaene a.row').href);
    assert.equal(ziel.searchParams.get('g'), 'g2');
    assert.equal(ziel.searchParams.get('p'), 'p9');
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
    const optionen = [...doc.getElementById('planWahl').options].map(o => o.textContent);
    assert.deepEqual(optionen, ['KW 31', 'Nur ich']);
  } finally { zurueck(); }
});
