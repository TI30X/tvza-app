/* "Training teilen" im Bereich Training (v.35.73.0), im jsdom.
 *
 * Gemessen wird, was eine Athletin sieht und was dabei WIRKLICH
 * hinausgeht: nicht nur, dass ein Knopf etwas aufruft, sondern womit.
 * Der Auszug, der an training-freigaben.js geht, wird hier durchsucht.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteTraining, klick, warte, root } from './gruppe-harness.mjs';
import { pruefeAuszug, UMFANG_VORGABE } from '../assets/js/training-teilen.js';

const HEUTE = '2026-08-05';
/* Die Uhr der Seite steht auf HEUTE — ein Fixture mit Date.now() aus
   dem Testlauf läge daneben, und "abgelaufen" wäre nie abgelaufen. */
const JETZT = Date.parse(`${HEUTE}T09:00:00`);
const tage = n => new Date(JETZT + n * 86400000);
const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);

/* dialog.js reiht seine Dialoge in EINE Kette (ein Dialog auf einmal).
   Bleibt einer offen, wartet jeder spätere Test ewig auf seinen — und
   dialog.js ist echter, geteilter Code. Also jeden wieder schliessen. */
function dialogeSchliessen(doc) {
  for (const d of doc.querySelectorAll('dialog.frage')) {
    const zu = [...d.querySelectorAll('button')].pop();
    if (zu) zu.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
    else d.remove();
  }
}

let grid = null;
async function plan() {
  grid ||= JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { parseProgram } = await import('../assets/js/training-parser.js');
  return JSON.stringify(parseProgram(grid));
}

async function mitPlan(extra = {}) {
  return starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'timo', json: await plan(), erstelltAm: { seconds: 1 } }],
    heute: HEUTE,
    profil: { displayName: 'Timothy van Zanten' },
    ...extra,
  });
}

test('ohne Plan gibt es nichts zu teilen — die Zeile bleibt weg', async () => {
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [], heute: HEUTE,
  });
  try {
    assert.equal(doc.getElementById('teilenZeile').hidden, true);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('mit Plan steht „Training teilen" unter der Woche', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    assert.equal(doc.getElementById('teilenZeile').hidden, false);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ohne eigene Links steht da, dass man mit niemandem teilt', async () => {
  const { doc, zurueck } = await mitPlan({ freigaben: [] });
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('teilenListe').textContent.length > 0);
    assert.match(doc.getElementById('teilenListe').textContent, /mit niemandem/);
    /* Die Woche tritt zurück, solange das Teilen offen ist. */
    assert.equal(doc.getElementById('secWoche').hidden, true);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ein Link entsteht erst mit einem Namen — und wird sonst begründet abgelehnt', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('secTeilen').hidden === false);
    klick(doc.getElementById('btnTeilenNeu'));
    klick(doc.getElementById('btnTeilenErstellen'));
    await warte(() => doc.getElementById('teilenFehler').hidden === false);
    assert.equal(aufrufe('freigabeAnlegen').length, 0);
    assert.match(doc.getElementById('teilenFehler').textContent, /für wen/i);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('der neue Link trägt Namen, Umfang und Frist — und einen Auszug ohne Gruppendaten', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('secTeilen').hidden === false);
    klick(doc.getElementById('btnTeilenNeu'));
    doc.getElementById('teilenLabel').value = 'Privattrainerin';
    klick(doc.getElementById('btnTeilenErstellen'));
    await warte(() => aufrufe('freigabeAnlegen').length > 0);

    const [, uid, o] = aufrufe('freigabeAnlegen')[0];
    assert.equal(uid, 'timo');
    assert.equal(o.label, 'Privattrainerin');
    assert.equal(o.tage, 30);
    assert.deepEqual(o.umfang, { ...UMFANG_VORGABE });
    assert.ok(o.daten.tage.length, 'der Auszug ist leer');

    /* Und das Wichtigste: nichts aus der Gruppe. */
    const treffer = pruefeAuszug(o.daten, { verboten: ['g1', 'p1', 'BSV', 'michel', 'lea'] });
    assert.deepEqual(treffer, [], `der Auszug trägt: ${treffer}`);
    await warte(() => doc.querySelector('dialog.frage'));
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ohne den Haken „Übungen" fallen Werte, Notizen und private Notizen aus der Auswahl', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('secTeilen').hidden === false);
    klick(doc.getElementById('btnTeilenNeu'));

    doc.getElementById('umfWerte').checked = true;
    doc.getElementById('umfUebungen').checked = false;
    doc.getElementById('teilenUmfang').dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));

    for (const id of ['umfWerte', 'umfNotizen', 'umfPrivat']) {
      assert.equal(doc.getElementById(id).checked, false, id);
      assert.equal(doc.getElementById(id).disabled, true, id);
    }
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('die Warnung zu „Nur für mich" steht erst da, wenn der Haken gesetzt ist', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('secTeilen').hidden === false);
    klick(doc.getElementById('btnTeilenNeu'));
    assert.equal(doc.getElementById('umfPrivatWarnung').hidden, true);

    doc.getElementById('umfPrivat').checked = true;
    doc.getElementById('teilenUmfang').dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    assert.equal(doc.getElementById('umfPrivatWarnung').hidden, false);
    assert.match(doc.getElementById('umfPrivatWarnung').textContent, /Nur für mich/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('bestehende Links stehen mit Empfänger, Umfang, Frist und Adresse da', async () => {
  const { doc, zurueck } = await mitPlan({
    freigaben: [{
      code: 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB',
      label: 'Physio Meier',
      umfang: { einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: false, privat: false },
      bis: tage(5),
      erstellt: tage(-1),
      stand: Date.now(),
    }],
  });
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('teilenListe').textContent.includes('Physio Meier'));
    const text = doc.getElementById('teilenListe').textContent;
    assert.match(text, /Physio Meier/);
    assert.match(text, /gilt bis/);
    assert.match(text, /Erstellt:/);
    assert.match(text, /Werte/);
    assert.match(doc.getElementById('teilenListe').innerHTML, /geteilt\.html\?t=ABCDEFGHJKMNPQRSTUVWXYZ234567AB/);
    assert.ok(doc.querySelector('[data-teilen-weg]'), 'es fehlt der Weg zum Zurückziehen');
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ein abgelaufener Link zeigt keine Adresse mehr, nur noch zwei Wege', async () => {
  const { doc, zurueck } = await mitPlan({
    freigaben: [{
      code: 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB',
      label: 'Alter Link',
      umfang: { ...UMFANG_VORGABE },
      bis: tage(-1),
      erstellt: tage(-40),
      stand: JETZT - 40 * 86400000,
    }],
  });
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('teilenListe').textContent.includes('Alter Link'));
    assert.match(doc.getElementById('teilenListe').textContent, /abgelaufen/);
    assert.doesNotMatch(doc.getElementById('teilenListe').innerHTML, /geteilt\.html\?t=/);
    assert.ok(doc.querySelector('[data-teilen-neu]'));
    assert.ok(doc.querySelector('[data-teilen-weg]'));
    /* Ein abgelaufener Link wird nicht aufgefrischt — das wäre ein
       Schreibvorgang, den die Regel ohnehin ablehnt. */
    assert.equal(aufrufe('freigabeAuffrischen').length, 0);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('beim Öffnen werden gültige Links mit dem heutigen Stand versehen', async () => {
  const { doc, zurueck } = await mitPlan({
    freigaben: [{
      code: 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB',
      label: 'Privattrainerin',
      umfang: { ...UMFANG_VORGABE },
      bis: tage(5),
      erstellt: tage(0), stand: 1,
    }],
  });
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => aufrufe('freigabeAuffrischen').length > 0);
    const [, code, o] = aufrufe('freigabeAuffrischen')[0];
    assert.equal(code, 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB');
    assert.ok(o.daten.tage.length);
    assert.deepEqual(pruefeAuszug(o.daten, { verboten: ['g1', 'p1', 'BSV'] }), []);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('Zurückziehen fragt zuerst und löscht dann — der Link ist danach weg', async () => {
  const { doc, window, zurueck } = await mitPlan({
    freigaben: [{
      code: 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB',
      label: 'Physio Meier',
      umfang: { ...UMFANG_VORGABE },
      bis: tage(5),
      erstellt: tage(0), stand: JETZT,
    }],
  });
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.querySelector('[data-teilen-weg]'));
    klick(doc.querySelector('[data-teilen-weg]'));

    /* dialog.js zeichnet eine echte Frage — kein confirm(). */
    await warte(() => doc.querySelector('dialog.frage'));
    const dialog = doc.querySelector('dialog.frage');
    assert.match(dialog.textContent, /Physio Meier/);
    const ja = [...dialog.querySelectorAll('button')].find(b => /Zurückziehen/.test(b.textContent));
    assert.ok(ja, 'der bestätigende Knopf fehlt');
    klick(ja);

    await warte(() => aufrufe('freigabeZurueckziehen').length > 0);
    assert.equal(aufrufe('freigabeZurueckziehen')[0][1], 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB');
    await warte(() => !doc.getElementById('teilenListe').textContent.includes('Physio Meier'));
    void window;
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('„Zurück" bringt die Woche wieder', async () => {
  const { doc, zurueck } = await mitPlan();
  try {
    klick(doc.getElementById('btnTeilen'));
    await warte(() => doc.getElementById('secTeilen').hidden === false);
    klick(doc.getElementById('btnTeilenZurueck'));
    assert.equal(doc.getElementById('secTeilen').hidden, true);
    assert.equal(doc.getElementById('secWoche').hidden, false);
    assert.equal(doc.getElementById('teilenZeile').hidden, false);
  } finally { dialogeSchliessen(doc); zurueck(); }
});
