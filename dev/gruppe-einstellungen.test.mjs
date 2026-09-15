/* v.35.60.0 — die Einstellungen der Gruppe, Kalender der Gruppe, ein Plan
   für mehrere.

   Michel: "das sollten gruppenspezifische Einstellungen sein, in den
   Einstellungen vergraben — nicht so öffentlich" — "bei Für wen sollte man
   eine Excel nicht nur an eine Person oder an alle teilen können, sondern
   an mehrere gleichzeitig, ähnlich wie bei den Chats" — "die Gruppe soll
   mehrere Kalender erstellen können … Rennplan". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');
const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);
const KADER = {
  gruppen: [{ id: 'g1', name: 'BSV Kader', art: 'kader', meineRolle: 'head' }],
  mitglieder: [
    { uid: 'timo', name: 'Timothy', rolle: 'head' },
    { uid: 'lea', name: 'Lea', rolle: 'mitglied' },
    { uid: 'max', name: 'Max', rolle: 'mitglied' },
  ],
};

test('Assistent, Farbe, Kalender und Löschen stehen nicht mehr offen im Gruppe-Tab', async () => {
  const html = await read('pages/gruppe.html');
  const aktionen = html.slice(html.indexOf('id="secAktionen"'), html.indexOf('</section>', html.indexOf('id="secAktionen"')));
  for (const id of ['assistentEinst', 'gruppeFarbeKarte', 'grpLoeschen', 'btnAbo']) {
    assert.doesNotMatch(aktionen, new RegExp(`id="${id}"`), `${id} gehört in die Einstellungen der Gruppe`);
  }
  const einst = html.slice(html.indexOf('id="secGruppeEinst"'), html.indexOf('</section>', html.indexOf('id="secGruppeEinst"')));
  for (const id of ['assistentEinst', 'gruppeFarbeKarte', 'gruppeKalenderKarte', 'grpLoeschen', 'btnGruppeEinstZurueck']) {
    assert.match(einst, new RegExp(`id="${id}"`));
  }
});

test('die Leitung öffnet die Einstellungen über eine leise Zeile — und kommt zurück', async () => {
  const { doc, zurueck } = await starteGruppe(KADER);
  try {
    await warte(() => !doc.getElementById('grpEinstZeile').hidden);
    klick(doc.getElementById('btnGruppeEinst'));
    assert.equal(doc.getElementById('secGruppeEinst').hidden, false);
    for (const id of ['secWoche', 'secMitglieder', 'secAktionen', 'grpEinstZeile']) assert.equal(doc.getElementById(id).hidden, true, id);
    assert.match(doc.getElementById('grpEinstTitel').textContent, /BSV Kader/);
    assert.equal(doc.getElementById('grpLoeschen').hidden, false, 'der Kopf sieht das Löschen');
    klick(doc.getElementById('btnGruppeEinstZurueck'));
    assert.equal(doc.getElementById('secGruppeEinst').hidden, true);
    assert.equal(doc.getElementById('secWoche').hidden, false);
  } finally { zurueck(); }

  // Ein Athlet sieht die Zeile nicht.
  const athlet = await starteGruppe({ ...KADER, gruppen: [{ ...KADER.gruppen[0], meineRolle: 'mitglied' }] });
  try {
    await warte(() => !athlet.doc.getElementById('secWoche').hidden);
    assert.equal(athlet.doc.getElementById('grpEinstZeile').hidden, true);
  } finally { athlet.zurueck(); }
});

test('aus den Einstellungen der App: ?einst=1 öffnet die der Gruppe', async () => {
  const { doc, zurueck } = await starteGruppe({ ...KADER, suche: '?g=g1&einst=1' });
  try {
    await warte(() => !doc.getElementById('secGruppeEinst').hidden);
    assert.equal(doc.getElementById('secWoche').hidden, true);
  } finally { zurueck(); }

  const html = await read('index.html');
  assert.match(html, /id="gruppenEinstSection" data-settings-section="gruppen" hidden/);
  const start = await read('assets/js/feature/start/start.js');
  assert.match(start, /pages\/gruppe\.html\?g=\$\{encodeURIComponent\(zeile\.dataset\.gruppeEinst\)\}&einst=1/);
  assert.match(start, /tellSettingsParent\(\{ type:'tvza-settings-gehe', url:ziel \}\)/);
  // Die Ebene folgt nur Adressen der eigenen App.
  const ebene = await read('assets/js/settings-layer.js');
  assert.match(ebene, /if \(!ziel \|\| ziel\.origin !== location\.origin\) return;/);
});

test('die Leitung legt Kalender der Gruppe an — ein Termin kann einem davon gehören', async () => {
  globalThis.__gruppenKalender = { g1: [{ id: 'k1', name: 'Rennplan', farbe: '#d4537e' }] };
  const { doc, zurueck } = await starteGruppe(KADER);
  try {
    await warte(() => !doc.getElementById('grpEinstZeile').hidden);
    klick(doc.getElementById('btnGruppeEinst'));
    await warte(() => doc.querySelector('#gruppeKalenderListe [data-kalender-weg="k1"]'));
    doc.getElementById('gruppeKalenderName').value = '  Eltern   Anlässe ';
    klick(doc.getElementById('btnGruppeKalender'));
    await warte(() => aufrufe('gruppenKalenderAnlegen').length);
    const [, gid, uid, k] = aufrufe('gruppenKalenderAnlegen')[0];
    assert.deepEqual([gid, uid, k.name], ['g1', 'timo', 'Eltern Anlässe']);
    assert.notEqual(k.farbe, '#d4537e', 'eine Farbe, die noch keiner hat');
    await warte(() => doc.querySelectorAll('#gruppeKalenderListe .grp-kalender__zeile').length === 2);

    // Im Terminformular steht die Wahl, weil es Kalender gibt.
    klick(doc.getElementById('btnGruppeEinstZurueck'));
    klick(doc.getElementById('btnTermin'));
    await warte(() => !doc.getElementById('secForm').hidden);
    assert.equal(doc.getElementById('grpKalender').hidden, false);
    assert.deepEqual([...doc.getElementById('fKalender').options].map(o => o.value), ['', 'k-neu', 'k1']);
  } finally { zurueck(); delete globalThis.__gruppenKalender; }

  const g = await read('assets/js/groups.js');
  assert.match(g, /kalender: termin\.kalender,/);
  assert.match(g, /'abfahrten', 'packliste', 'kalender',\n\]\);/);
  const regeln = await read('firestore.rules');
  assert.match(regeln, /match \/groups\/\{gid\}\/kalender\/\{kalenderId\} \{\s*allow get, list: if inGroup\(gid\);\s*allow create, update: if leadsGroup\(gid\) && kalenderGueltig\(request\.resource\.data\);\s*allow delete: if leadsGroup\(gid\);/);
  assert.match(regeln, /match \/users\/\{uid\}\/kalender\/\{kalenderId\} \{\s*allow read, delete: if isMember\(\) && request\.auth\.uid == uid;/);
  assert.match(regeln, /'kalender', 'createdBy', 'createdAt'\s*\]\)\s*&& terminKalenderGueltig\(request\.resource\.data\);/);
});

test('"Für wen": mehrere Personen wie im Chat — jede bekommt ihren eigenen Plan', async () => {
  globalThis.__raster = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { doc, zurueck } = await starteGruppe(KADER);
  try {
    klick(doc.getElementById('btnPlanNeu'));
    await warte(() => !doc.getElementById('secPlanForm').hidden);
    const feld = doc.getElementById('planDatei');
    const win = doc.defaultView;
    Object.defineProperty(feld, 'files', { value: [new win.File(['x'], 'KW 31.xlsx')], configurable: true });
    feld.dispatchEvent(new win.Event('change', { bubbles: true }));
    await warte(() => !doc.getElementById('planVorschau').hidden);

    const fuer = doc.getElementById('planFuer');
    assert.ok([...fuer.options].some(o => o.value === 'mehrere'), '"Mehrere Personen …" steht zur Wahl');
    fuer.value = 'mehrere';
    fuer.dispatchEvent(new win.Event('change', { bubbles: true }));
    await warte(() => doc.querySelector('dialog.frage [data-mehrere]'));
    const kaestchen = [...doc.querySelectorAll('dialog.frage [data-mehrere] input')];
    kaestchen[1].checked = true;   // Lea
    kaestchen[2].checked = true;   // Max
    klick(doc.querySelector('dialog.frage [data-frage="ja"]'));
    await warte(() => /Lea, Max/.test(doc.getElementById('planFuerHinweis').textContent));
    assert.match(fuer.selectedOptions[0].textContent, /\(2\)/);

    klick(doc.getElementById('btnPlanSpeichern'));
    await warte(() => aufrufe('planVeroeffentlichen').length === 2);
    assert.deepEqual(aufrufe('planVeroeffentlichen').map(a => a[3].fuer), ['lea', 'max']);
  } finally { zurueck(); delete globalThis.__raster; }
});
