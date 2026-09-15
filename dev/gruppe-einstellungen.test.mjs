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

    /* Seit v.35.65.0 stehen die Häkchen im Formular (Michel: "Checkbox-
       Mehrfachauswahl: eine, mehrere oder alle") statt in einem zweiten
       Dialog — und vor dem Veröffentlichen steht, an wen es geht. */
    const fuer = doc.getElementById('planFuer');
    assert.ok([...fuer.options].some(o => o.value === 'mehrere'), '"Mehrere Personen …" steht zur Wahl');
    fuer.value = 'mehrere';
    fuer.dispatchEvent(new win.Event('change', { bubbles: true }));
    await warte(() => !doc.getElementById('planEmpfaenger').hidden);
    const haken = uid => doc.querySelector(`#planEmpfaenger [data-empfaenger="${uid}"]`);
    /* Die Excel nannte Timothy: er ist schon angehakt. */
    assert.equal(haken('timo').checked, true, 'wer vorher gewählt war, fängt angehakt an');
    haken('timo').checked = false;
    haken('timo').dispatchEvent(new win.Event('change', { bubbles: true }));
    for (const uid of ['lea', 'max']) {
      haken(uid).checked = true;
      haken(uid).dispatchEvent(new win.Event('change', { bubbles: true }));
    }
    assert.match(doc.getElementById('planGehtAn').textContent, /Geht an Lea, Max — jede Person bekommt den Plan als ihren eigenen/);
    assert.match(doc.getElementById('planGehtAn').textContent, /Wer später beitritt, bekommt ihn nicht/);
    assert.equal(doc.getElementById('btnPlanSpeichern').textContent, 'An 2 Personen veröffentlichen');
    assert.match(fuer.selectedOptions[0].textContent, /\(2\)/);

    /* "Alle auswählen": die, die jetzt da sind. */
    klick(doc.querySelector('#planEmpfaenger [data-empfaenger-alle]'));
    assert.ok([...doc.querySelectorAll('#planEmpfaenger [data-empfaenger]')].every(k => k.checked));
    klick(doc.querySelector('#planEmpfaenger [data-empfaenger-alle]'));
    for (const uid of ['lea', 'max']) {
      haken(uid).checked = true;
      haken(uid).dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    /* Einer scheitert: die anderen gehen, und es steht da, für wen nicht. */
    globalThis.__planScheitertFuer = 'max';
    klick(doc.getElementById('btnPlanSpeichern'));
    await warte(() => !doc.getElementById('planFehler').hidden);
    assert.match(doc.getElementById('planFehler').textContent, /1 von 2 veröffentlicht\. Nicht für: Max/);
    assert.equal(doc.getElementById('secPlanForm').hidden, false, 'das Formular ging zu, obwohl Max fehlt');
    assert.equal(fuer.value, 'max', 'nur wer fehlt, bleibt gewählt');
    delete globalThis.__planScheitertFuer;
    klick(doc.getElementById('btnPlanSpeichern'));
    await warte(() => doc.getElementById('secPlanForm').hidden);
    assert.deepEqual(aufrufe('planVeroeffentlichen').map(a => a[3].fuer), ['lea', 'max'], 'Lea bekam den Plan zweimal');
  } finally { zurueck(); delete globalThis.__raster; delete globalThis.__planScheitertFuer; }
});

test('"Alle in der Gruppe" sagt, dass es auch für Künftige gilt', async () => {
  globalThis.__raster = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { doc, zurueck } = await starteGruppe(KADER);
  try {
    klick(doc.getElementById('btnPlanNeu'));
    await warte(() => !doc.getElementById('secPlanForm').hidden);
    const feld = doc.getElementById('planFuer');
    feld.value = 'alle';
    feld.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    assert.match(doc.getElementById('planGehtAn').textContent, /ganze Gruppe — jetzt 3 Personen, und alle, die später beitreten/);
  } finally { zurueck(); delete globalThis.__raster; }
});

test('die Leitung sieht je Tag und Athlet, was begonnen und abgeschlossen ist — "unbekannt" statt "nicht trainiert"', async () => {
  const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { parseProgram } = await import('../assets/js/training-parser.js');
  const programm = parseProgram(grid);
  const { einheitenAmTag } = await import('../assets/js/wochenplan.js');
  const montagsEinheit = einheitenAmTag(programm, '2026-08-03')[0];
  const kraft = programm.units[montagsEinheit].items;
  const { doc, zurueck } = await starteGruppe({
    ...KADER,
    heute: '2026-08-03',
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json: JSON.stringify(programm) }],
    protokolle: [{ uid: 'lea', datum: '2026-08-03', units: { [montagsEinheit]: { items: {
      [kraft[0].key]: { done: true, note: 'zog im Knie', sets: [{ weight: '50', reps: '8', ok: true }] },
    } } } }],
  });
  try {
    klick(doc.getElementById('btnFortschritt'));
    await warte(() => !doc.getElementById('secFortschritt').hidden && /Begonnen/.test(doc.getElementById('listFortschritt').textContent));
    const text = doc.getElementById('listFortschritt').textContent;
    assert.match(text, /Lea[\s\S]*Begonnen[\s\S]*1\/\d+ Übungen/, 'Lea hat begonnen');
    assert.match(text, /zog im Knie/, 'die Notiz für die Leitung fehlt');
    assert.match(text, /Max[\s\S]*Nichts synchronisiert/, 'ohne Protokoll heisst es nicht "nicht trainiert"');
    assert.doesNotMatch(text, /Timothy/, 'die Leitung steht bei einem Plan für alle nicht als Athlet da');
    /* Ein Tipp öffnet die Einheit des Athleten als Ansicht. */
    const link = [...doc.querySelectorAll('.fs-einheit')].find(a => /a=lea/.test(a.getAttribute('href')));
    assert.ok(link, 'ohne &a= öffnete die Leitung ihr eigenes Protokoll');
    assert.equal(link.getAttribute('href'), `./einheit.html?g=g1&p=p1&u=${montagsEinheit}&d=2026-08-03&z=gruppe&a=lea`);
  } finally { zurueck(); }

  /* Konnte nichts geladen werden: unbekannt. */
  const zwei = await starteGruppe({ ...KADER, heute: '2026-08-03', plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'alle', json: JSON.stringify(programm) }] });
  globalThis.__protokolleFehler = true;
  try {
    klick(zwei.doc.getElementById('btnFortschritt'));
    await warte(() => !zwei.doc.getElementById('fortschrittFehler').hidden);
    assert.match(zwei.doc.getElementById('listFortschritt').textContent, /Unbekannt/);
    assert.doesNotMatch(zwei.doc.getElementById('listFortschritt').textContent, /Nichts synchronisiert/);
  } finally { zwei.zurueck(); delete globalThis.__protokolleFehler; }
});

test('eine Vorlage wird auf eine Woche gelegt — als Kopie, die Vorlage bleibt', async () => {
  const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  const { parseProgram } = await import('../assets/js/training-parser.js');
  const { vorlageAufWoche, planTageMitDatum } = await import('../assets/js/wochenplan.js');
  const programm = parseProgram(grid);
  const kopie = vorlageAufWoche(programm, '2026-09-21');
  assert.deepEqual(planTageMitDatum(kopie).map(t => t.datum), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  assert.equal(programm.days[0].date, '2026-08-03', 'die Vorlage selbst wurde verändert');
  assert.equal(kopie.kw, null, 'die KW der Excel stimmt für die neue Woche nicht');

  const { doc, zurueck } = await starteGruppe(KADER);
  /* Nach dem Start: der Harness setzt __vorlagen beim Laden zurück. */
  globalThis.__vorlagen = [{ id: 'v1', titel: 'Kraftwoche', json: JSON.stringify(programm) }];
  try {
    klick(doc.getElementById('btnPlanNeu'));
    await warte(() => !doc.getElementById('grpPlanVorlage').hidden);
    doc.getElementById('planVorlage').value = 'v1';
    doc.getElementById('planVorlageMontag').value = '2026-09-23';   // ein Mittwoch: gilt ab Montag
    doc.getElementById('planVorlage').dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    assert.match(doc.getElementById('planTitel').value, /^Kraftwoche · /);
    klick(doc.getElementById('btnPlanSpeichern'));
    await warte(() => aufrufe('planVeroeffentlichen').length === 1);
    const plan = aufrufe('planVeroeffentlichen')[0][3];
    assert.equal(JSON.parse(plan.json).days[0].date, '2026-09-21');
    assert.equal(aufrufe('vorlageSpeichern').length, 0);
  } finally { zurueck(); delete globalThis.__vorlagen; }

  const regeln = await readFile(join(root, 'firestore.rules'), 'utf8');
  assert.match(regeln, /match \/groups\/\{gid\}\/vorlagen\/\{vorlageId\} \{\s*allow get, list: if leadsGroup\(gid\);/);
});
