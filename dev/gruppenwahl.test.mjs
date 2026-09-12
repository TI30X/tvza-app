/* Die Gruppe wechseln.

   Michels Frage: "was wenn man mehr als nur Teil eines Teams ist?" Das
   Datenmodell konnte es, die Oberflaeche versteckte es — ein Auswahlfeld
   des Browsers, nur auf der Gruppenseite, und in der Leiste nichts, was
   verriet, dass es weitere Gruppen gibt.

   Jetzt: Karten mit Plaettchen, Name und eigener Rolle (dialog.js,
   waehle), erreichbar ueber eine Karte oben auf der Gruppenseite und am
   Laptop ueber "Gruppe wechseln" in der Leiste. Ein Merker, ein
   Ereignis ('firn-gruppe'), und die Farbe der Gruppe ist ueberall
   dieselbe wie im Kalender. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';

const lies = pfad => readFile(join(root, pfad), 'utf8');
const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);

const ZWEI = [
  { id: 'g1', name: 'BSV Kader', art: 'kader', meineRolle: 'mitglied' },
  { id: 'g2', name: 'SC Einsiedeln', art: 'organisation', meineRolle: 'head' },
];

/* ── Die reinen Teile ─────────────────────────────────────────────── */

test('das Kuerzel: die Anfaenge zweier Woerter, sonst zwei Buchstaben', async () => {
  const { kuerzel } = await import(pathToFileURL(join(root, 'assets/js/gruppenwahl.js')).href);
  assert.equal(kuerzel('SC Einsiedeln'), 'SE');
  assert.equal(kuerzel('Kader'), 'KA');
  assert.equal(kuerzel('  '), '·');
});

test('die Karten: Rolle und Art, die aktive markiert, die Farbe wie im Kalender', async () => {
  const { gruppenOptionen } = await import(pathToFileURL(join(root, 'assets/js/gruppenwahl.js')).href);
  const { teamFarben } = await import(pathToFileURL(join(root, 'assets/js/kalender-teams.js')).href);
  const { CALENDAR_COLORS } = await import(pathToFileURL(join(root, 'assets/js/calendar-view.js')).href);

  const rolle = (art, was) => ({ mitglied: 'Athlet', head: 'Leitung' }[was] || '');
  const karten = gruppenOptionen(ZWEI, 'g2', rolle);
  assert.deepEqual(karten.map(k => [k.wert, k.aktiv]), [['g1', false], ['g2', true]]);
  assert.equal(karten[0].titel, 'BSV Kader');
  /* Ohne Katalog (deutsch, keine eigene Wahl) muss die Art trotzdem
     dastehen — die erste Fassung hatte '' als Rueckfall. */
  assert.equal(karten[0].text, 'Athlet · Rennkader');
  assert.equal(karten[1].text, 'Leitung · Verein oder Gym');

  /* EIN Team, EINE Farbe: das Plaettchen hier und die Quelle im Kalender. */
  const farben = teamFarben(ZWEI, CALENDAR_COLORS.map(c => c.value));
  for (const k of karten) assert.match(k.stil, new RegExp(`--tint:${farben.get(k.wert)};`));
});

test('waehle() antwortet mit der gewaehlten Karte, ein Abbruch mit null', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://firn.test/' });
  const vorher = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try {
    const { waehle } = await import(pathToFileURL(join(root, 'assets/js/dialog.js')).href + '?waehle');
    const optionen = [{ wert: 'a', titel: 'A', aktiv: true }, { wert: 'b', titel: 'B' }];

    const eins = waehle({ titel: 'Gruppe wechseln', optionen });
    await warte(() => dom.window.document.querySelector('[data-wahl]'));
    const karten = dom.window.document.querySelectorAll('.wahlkarte');
    assert.equal(karten.length, 2);
    assert.equal(karten[0].getAttribute('aria-checked'), 'true', 'die aktive ist markiert');
    klick(karten[1]);
    assert.equal(await eins, 'b');
    assert.equal(dom.window.document.querySelector('dialog'), null, 'der Dialog ist wieder weg');

    const zwei = waehle({ titel: 'Gruppe wechseln', optionen });
    await warte(() => dom.window.document.querySelector('[data-frage="nein"]'));
    klick(dom.window.document.querySelector('[data-frage="nein"]'));
    assert.equal(await zwei, null);
  } finally {
    globalThis.window = vorher.window;
    globalThis.document = vorher.document;
  }
});

/* ── Die Gruppenseite ─────────────────────────────────────────────── */

test('mit einer Gruppe gibt es nichts zu wechseln — und keine Karte dafuer', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [ZWEI[0]] });
  try {
    assert.equal(doc.getElementById('secWechsel').hidden, true);
  } finally { zurueck(); }
});

test('mit zwei Gruppen zeigt eine Karte, wo man ist, und wechselt ueber Karten', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: ZWEI });
  try {
    assert.equal(doc.getElementById('secWechsel').hidden, false);
    assert.equal(doc.getElementById('wechselName').textContent, 'BSV Kader');
    assert.match(doc.getElementById('wechselMehr').textContent, /1 weitere Gruppe/);
    assert.match(doc.getElementById('wechselBild').getAttribute('style') || '', /--tint:#/);
    assert.equal(doc.getElementById('grpWahl'), null, 'das Auswahlfeld des Browsers ist weg');

    klick(doc.getElementById('btnWechsel'));
    await warte(() => doc.querySelectorAll('dialog .wahlkarte').length === 2);
    const karten = doc.querySelectorAll('dialog .wahlkarte');
    assert.equal(karten.length, 2);
    assert.equal(karten[0].getAttribute('aria-checked'), 'true');

    klick(karten[1]);
    await warte(() => doc.getElementById('wechselName').textContent === 'SC Einsiedeln');
    assert.equal(doc.getElementById('wechselName').textContent, 'SC Einsiedeln',
      'die Seite zeigt nach der Wahl die andere Gruppe');
    assert.deepEqual(aufrufe('aktiveGruppeSetzen').at(-1), ['aktiveGruppeSetzen', 'g2'],
      'die Wahl wird gemerkt — derselbe Merker wie in der Leiste');
  } finally { zurueck(); }
});

test('ein Wechsel aus der Leiste schaltet die offene Gruppenseite mit um', async () => {
  const { doc, window, zurueck } = await starteGruppe({ gruppen: ZWEI });
  try {
    window.dispatchEvent(new window.CustomEvent('firn-gruppe', { detail: { gid: 'g2' } }));
    await warte(() => doc.getElementById('wechselName').textContent === 'SC Einsiedeln');
    assert.equal(doc.getElementById('wechselName').textContent, 'SC Einsiedeln');
    /* Eine unbekannte Gruppe (gerade angelegt, Snapshot unterwegs) laesst
       die Seite, wie sie ist, statt ins Leere zu schalten. */
    window.dispatchEvent(new window.CustomEvent('firn-gruppe', { detail: { gid: 'gibt-es-nicht' } }));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(doc.getElementById('wechselName').textContent, 'SC Einsiedeln');
  } finally { zurueck(); }
});

test('die Karte beschriftet der Code — kein data-i18n darauf (Falle 5)', async () => {
  const html = await lies('pages/gruppe.html');
  for (const id of ['wechselName', 'wechselMehr', 'wechselBild']) {
    const tag = html.match(new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `#${id} fehlt`);
    assert.doesNotMatch(tag, /data-i18n/);
  }
});

/* ── Die Leiste und der Merker ────────────────────────────────────── */

test('die Leiste hat "Gruppe wechseln" unter dem Gruppe-Tab, nur am Laptop', async () => {
  const [shell, kit] = await Promise.all([lies('assets/js/shell.js'), lies('assets/css/kit.css')]);
  assert.match(shell, /<button class="nav__wechsel" type="button" data-gruppe-wechsel hidden/,
    'erst sichtbar, wenn es mehr als eine Gruppe gibt');
  assert.match(shell, /wechsel\.hidden = gruppen\.length < 2/);
  /* Am Handy ist die Leiste ein Raster aus vier Spalten; ein fuenftes
     Element risse es auf. Die Grundregel steht AUSSERHALB der
     Laptop-Abfrage und versteckt. */
  const grund = kit.indexOf('.nav__wechsel { display: none; }');
  const laptop = kit.indexOf('.nav__wechsel:not([hidden])');
  assert.ok(grund > 0 && laptop > grund, 'die Handy-Regel fehlt oder steht nach der Laptop-Regel');
});

test('ein Merker fuer die aktive Gruppe, und wer ihn setzt, meldet es', async () => {
  const groups = await lies('assets/js/groups.js');
  const fn = groups.match(/export function aktiveGruppeSetzen\(gid\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /localStorage\.setItem\(SCHLUESSEL/);
  assert.match(fn, /new CustomEvent\('firn-gruppe'/);
  /* Die Terminkarte im Kalender fuehrt ueber denselben Merker zur Gruppe. */
  assert.match(await lies('pages/planner.html'), /aktiveGruppeSetzen\(event\.ref\.gid\)/);
});
