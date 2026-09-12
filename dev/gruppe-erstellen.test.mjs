/* Erstellen ohne Browser-Dialoge — gefahren, nicht gelesen.

   Michels Einwand: "wieso sind beim Erstellen Text-Prompts und nicht
   so Verbildlichungen, auf die man drücken und wählen kann?" Beim
   Anlegen einer Gruppe musste man eine Ziffer in ein Browserfenster
   tippen. Diese Tests klicken sich durch das, was jetzt dort steht.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';

const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);

/* Ein Feld fuellen, wie ein Mensch es tut. */
function tippe(feld, wert) {
  feld.value = wert;
  feld.dispatchEvent(new feld.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

test('ohne Gruppe fuehrt "Gruppe erstellen" in ein Formular, nicht in ein Browserfenster', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    assert.equal(doc.getElementById('secLeer').hidden, false);
    klick(doc.getElementById('btnNeu'));

    assert.equal(doc.getElementById('secGruppeNeu').hidden, false);
    assert.equal(doc.getElementById('secLeer').hidden, true);

    /* Drei Karten, der Rennkader vorgewaehlt. */
    const karten = [...doc.querySelectorAll('#neuArt [data-art]')];
    assert.deepEqual(karten.map(k => k.dataset.art), ['kader', 'organisation', 'familie']);
    assert.deepEqual(karten.map(k => k.getAttribute('aria-checked')), ['true', 'false', 'false']);
    /* Jede Karte hat ein Bild, einen Titel und eine Erklaerung — das
       ist der Unterschied zu "1 — Rennkader" in einem Textfenster. */
    for (const k of karten) {
      assert.ok(k.querySelector('.wahlkarte__bild svg'), `${k.dataset.art}: kein Bild`);
      assert.ok(k.querySelector('.wahlkarte__titel').textContent.trim());
      assert.ok(k.querySelector('.wahlkarte__text').textContent.trim());
    }
  } finally { zurueck(); }
});

test('eine Karte waehlen, benennen, erstellen — mit der gewaehlten Art', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    klick(doc.getElementById('btnNeu'));
    klick(doc.querySelector('#neuArt [data-art="familie"]'));
    assert.equal(doc.querySelector('#neuArt [data-art="familie"]').getAttribute('aria-checked'), 'true');
    assert.equal(doc.querySelector('#neuArt [data-art="kader"]').getAttribute('aria-checked'), 'false');

    /* Ohne Namen: ein Satz unter dem Feld, kein Speichern. */
    klick(doc.getElementById('btnGruppeAnlegen'));
    assert.equal(doc.getElementById('neuFehler').hidden, false);
    assert.match(doc.getElementById('neuFehler').textContent, /Namen/);
    assert.equal(aufrufe('gruppeAnlegen').length, 0);

    tippe(doc.getElementById('neuName'), '  Familie van Zanten  ');
    klick(doc.getElementById('btnGruppeAnlegen'));
    await warte(() => aufrufe('gruppeAnlegen').length > 0);

    const [[, uid, daten]] = aufrufe('gruppeAnlegen');
    assert.equal(uid, 'timo');
    assert.deepEqual(daten, { name: 'Familie van Zanten', art: 'familie' });
    await warte(() => aufrufe('aktiveGruppeSetzen').length > 0);
    assert.deepEqual(aufrufe('aktiveGruppeSetzen')[0], ['aktiveGruppeSetzen', 'g-neu']);
  } finally { zurueck(); }
});

test('Zurueck verlaesst das Formular, ohne etwas anzulegen', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    klick(doc.getElementById('btnNeu'));
    klick(doc.getElementById('btnGruppeNeuZurueck'));
    assert.equal(doc.getElementById('secGruppeNeu').hidden, true);
    assert.equal(doc.getElementById('secLeer').hidden, false);
    assert.equal(aufrufe('gruppeAnlegen').length, 0);
  } finally { zurueck(); }
});

test('Beitreten fragt in einem gestalteten Dialog nach dem Code', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    klick(doc.getElementById('btnBeitreten'));
    await warte(() => doc.querySelector('dialog.frage'));
    const dialog = doc.querySelector('dialog.frage');
    assert.ok(dialog, 'kein Dialog');
    /* Gross und gesperrt, weil man den Code Zeichen fuer Zeichen
       abliest. */
    const feld = dialog.querySelector('.frage__feld--gross');
    assert.ok(feld, 'das Codefeld fehlt');
    assert.match(dialog.querySelector('.frage__titel').textContent, /beitreten/i);

    tippe(feld, ' kw7x2p ');
    klick(dialog.querySelector('[data-frage="ja"]'));
    await warte(() => aufrufe('beitreten').length > 0);
    assert.equal(aufrufe('beitreten')[0][1], 'kw7x2p', 'der Code geht getrimmt an beitreten()');
    assert.equal(doc.querySelector('dialog.frage'), null, 'der Dialog ist wieder weg');
  } finally { zurueck(); }
});

test('Abbrechen im Dialog tritt nirgends bei', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    klick(doc.getElementById('btnBeitreten'));
    await warte(() => doc.querySelector('dialog.frage'));
    klick(doc.querySelector('dialog.frage [data-frage="nein"]'));
    await warte(() => !doc.querySelector('dialog.frage'));
    assert.equal(aufrufe('beitreten').length, 0);
  } finally { zurueck(); }
});

/* ── Termin: die Art als Knoepfe, und eine eigene ─────────────────── */

const leitung = art => ({
  gruppen: [{ id: 'g1', name: 'TEST', art, meineRolle: 'head' }],
  mitglieder: [{ uid: 'timo', name: 'Timothy', rolle: 'head' }],
});

test('die Art eines Termins waehlt man aus Knoepfen, "Eigene" inklusive', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('kader'));
  try {
    klick(doc.getElementById('btnTermin'));
    const knoepfe = [...doc.querySelectorAll('#fArtWahl [data-art-wahl]')];
    assert.deepEqual(knoepfe.map(k => k.dataset.artWahl), ['training', 'lager', 'rennen', 'eigene']);
    assert.equal(knoepfe[0].getAttribute('aria-checked'), 'true');
    /* Die Farbe der Art traegt der Knopf schon — man soll sie in der
       Liste spaeter wiedererkennen. */
    assert.equal(knoepfe[2].dataset.bereich, 't-rennen');
    assert.equal(doc.getElementById('grpBezeichnung').hidden, true);

    klick(knoepfe[1]);
    assert.equal(doc.getElementById('fArt').value, 'lager');
    assert.equal(doc.getElementById('grpBis').hidden, false, 'ein Lager hat ein Enddatum');
  } finally { zurueck(); }
});

test('eine Familie bekommt kein Rennen angeboten, aber "Eigene"', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('familie'));
  try {
    klick(doc.getElementById('btnTermin'));
    const arten = [...doc.querySelectorAll('#fArtWahl [data-art-wahl]')].map(k => k.dataset.artWahl);
    assert.deepEqual(arten, ['training', 'lager', 'eigene']);
  } finally { zurueck(); }
});

test('"Eigene" verlangt ein Wort und speichert es als Bezeichnung', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('kader'));
  try {
    klick(doc.getElementById('btnTermin'));
    klick(doc.querySelector('#fArtWahl [data-art-wahl="eigene"]'));

    assert.equal(doc.getElementById('grpBezeichnung').hidden, false);
    /* Sie verhaelt sich wie ein Training: ein Tag mit Uhrzeit. */
    assert.equal(doc.getElementById('fArt').value, 'training');
    assert.equal(doc.getElementById('grpZeit').hidden, false);
    assert.equal(doc.getElementById('grpBis').hidden, true);

    tippe(doc.getElementById('fTitel'), 'Info zur Saison');
    klick(doc.getElementById('btnSpeichern'));
    assert.equal(doc.getElementById('formFehler').hidden, false);
    assert.equal(aufrufe('terminAnlegen').length, 0, 'ohne Wort wird nichts gespeichert');

    tippe(doc.getElementById('fBezeichnung'), 'Elternabend');
    klick(doc.getElementById('btnSpeichern'));
    await warte(() => aufrufe('terminAnlegen').length > 0);
    const [[, gid, uid, termin]] = aufrufe('terminAnlegen');
    assert.equal(gid, 'g1');
    assert.equal(uid, 'timo');
    assert.equal(termin.art, 'training');
    assert.equal(termin.bezeichnung, 'Elternabend');
    assert.equal(termin.titel, 'Info zur Saison');
  } finally { zurueck(); }
});

test('eine der drei Arten traegt keine Bezeichnung mit', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('kader'));
  try {
    klick(doc.getElementById('btnTermin'));
    /* Erst "Eigene" mit einem Wort, dann doch Rennen: das Wort darf
       nicht heimlich mitreisen. */
    klick(doc.querySelector('#fArtWahl [data-art-wahl="eigene"]'));
    tippe(doc.getElementById('fBezeichnung'), 'Materialtest');
    klick(doc.querySelector('#fArtWahl [data-art-wahl="rennen"]'));
    tippe(doc.getElementById('fTitel'), 'FIS SL Hochstuckli');
    klick(doc.getElementById('btnSpeichern'));
    await warte(() => aufrufe('terminAnlegen').length > 0);
    const termin = aufrufe('terminAnlegen')[0][3];
    assert.equal(termin.art, 'rennen');
    assert.equal(termin.bezeichnung, null);
  } finally { zurueck(); }
});

/* ── Keine Browserfenster mehr auf der Gruppenseite ───────────────── */

test('gruppe.js ruft weder prompt noch confirm noch alert', async () => {
  const js = (await readFile(join(root, 'assets/js/feature/gruppe/gruppe.js'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(js, /(^|[^.\w])(prompt|confirm|alert)\s*\(/,
    'ein Browserfenster ist zurueck auf der Gruppenseite');
  assert.match(js, /from '\.\.\/\.\.\/dialog\.js'/);
});

/* ── Die Excel in der Gruppe einlesen ──────────────────────────────
   "Erstens kann man nichts einlesen." Die Gruppe hatte nur ein
   Auswahlfeld mit dem, was man auf der alten persoenlichen Seite
   eingelesen hatte. Hier wird eine Datei gewaehlt — die echte KW 31
   als Raster, mit dem echten Parser dahinter. */

async function waehleDatei(doc, name = 'Van Zanten Timothy KW 31.xlsx') {
  const feld = doc.getElementById('planDatei');
  const win = doc.defaultView;
  const datei = new win.File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(feld, 'files', { value: [datei], configurable: true });
  feld.dispatchEvent(new win.Event('change', { bubbles: true }));
}

test('ein Trainer liest die Excel direkt in der Gruppe ein und sieht die Woche, bevor er sie veroeffentlicht', async () => {
  globalThis.__raster = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { doc, zurueck } = await starteGruppe(leitung('kader'));
  try {
    klick(doc.getElementById('btnPlanNeu'));
    /* Das Formular oeffnet, sobald die frueheren Programme gefragt sind. */
    await warte(() => !doc.getElementById('secPlanForm').hidden);
    assert.equal(doc.getElementById('secPlanForm').hidden, false);
    /* Ohne frueher eingelesene Programme gibt es keine zweite Auswahl. */
    assert.equal(doc.getElementById('grpPlanQuelle').hidden, true);

    await waehleDatei(doc);
    await warte(() => !doc.getElementById('planVorschau').hidden);

    const vorschau = doc.getElementById('planVorschau');
    assert.equal(vorschau.hidden, false, 'keine Vorschau nach dem Einlesen');
    assert.match(vorschau.querySelector('.row__title').textContent, /KW 31/);
    assert.match(vorschau.querySelector('.row__sub').textContent, /8 Einheiten/);
    assert.equal(vorschau.querySelectorAll('.plan-vorschau__tag').length, 7);
    assert.match(vorschau.textContent, /Kraft Beine/);
    assert.match(vorschau.textContent, /Ohne Übungsblatt:.*Koordination/);

    /* Der Titel steht schon da: die Woche selbst. */
    assert.equal(doc.getElementById('planTitel').value, 'KW 31 · TW 12');
    assert.match(doc.getElementById('planDateiKnopf').textContent, /Andere Datei/);

    klick(doc.getElementById('btnPlanSpeichern'));
    await warte(() => aufrufe('planVeroeffentlichen').length > 0);
    const [[, gid, uid, plan]] = aufrufe('planVeroeffentlichen');
    assert.equal(gid, 'g1');
    assert.equal(uid, 'timo');
    assert.equal(plan.titel, 'KW 31 · TW 12');
    assert.equal(plan.fuer, 'alle');
    /* Veroeffentlicht wird das geparste Programm — dasselbe Format, das
       der Wochenplan und der Player lesen. */
    const programm = JSON.parse(plan.json);
    assert.equal(programm.kw, 31);
    assert.equal(Object.keys(programm.units).length, 8);
  } finally { zurueck(); delete globalThis.__raster; }
});

test('eine Datei ohne Wochenplan sagt, was fehlt, statt still nichts zu tun', async () => {
  delete globalThis.__raster;
  const { doc, zurueck } = await starteGruppe(leitung('kader'));
  try {
    klick(doc.getElementById('btnPlanNeu'));
    await warte(() => !doc.getElementById('secPlanForm').hidden);
    await waehleDatei(doc, 'Einkaufsliste.xlsx');
    await warte(() => /nicht lesen/.test(doc.getElementById('planDateiStatus').textContent));
    const status = doc.getElementById('planDateiStatus');
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /Wochenplan-Blatt/, 'der Grund des Parsers soll zu lesen sein');
    assert.equal(doc.getElementById('planVorschau').hidden, true);

    /* Ohne Datei laesst sich nichts veroeffentlichen — mit einem Satz. */
    klick(doc.getElementById('btnPlanSpeichern'));
    assert.equal(doc.getElementById('planFehler').hidden, false);
    assert.match(doc.getElementById('planFehler').textContent, /Excel/);
    assert.equal(aufrufe('planVeroeffentlichen').length, 0);
  } finally { zurueck(); }
});
