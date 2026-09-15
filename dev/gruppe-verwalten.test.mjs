/* Die Gruppe verwalten (v.35.59.0): Liste nach Funktion, Farbe, Löschen,
   der Verteiler in der Kopfzeile. Michel:
   - "unter Kader stehen alle Personen aufgelistet — könntest du nach den
     verschiedenen Funktionen sortieren?"
   - "die E-Mail an alle ist irgendwie komisch platziert"
   - "es sieht auch gar nicht anders aus, vielleicht muss man Farben
     unterscheiden können"
   - "man kann Gruppen nicht löschen, wenn man sie erstellt hat" */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');
const KADER = [
  { uid: 'timo', name: 'Timothy', rolle: 'head' },
  { uid: 'anna', name: 'Anna', rolle: 'staff' },
  { uid: 'lea', name: 'Lea', rolle: 'mitglied' },
  { uid: 'max', name: 'Max', rolle: 'mitglied' },
];
const kopf = (rolle = 'head') => ({
  gruppen: [{ id: 'g1', name: 'BSV Kader', art: 'kader', meineRolle: rolle }, { id: 'g2', name: 'Familie', art: 'familie', meineRolle: 'mitglied' }],
  mitglieder: KADER,
});

test('die Liste steht nach Funktion: erst die Trainer, dann die Athleten — mit Zahl', async () => {
  const { doc, zurueck } = await starteGruppe(kopf());
  try {
    await warte(() => doc.querySelector('.grp-funktion'));
    const koepfe = [...doc.querySelectorAll('#listMitglieder .grp-funktion')].map(p => [...p.children].map(s => s.textContent).join(' '));
    // Der Test-Stub von wort() gibt den Schlüssel zurück.
    assert.deepEqual(koepfe, ['leitungen 2', 'mitgliederPl 2']);
    const reihenfolge = [...doc.querySelectorAll('#listMitglieder [data-person]')].map(b => b.dataset.person);
    assert.deepEqual(reihenfolge, ['timo', 'anna', 'lea', 'max']);
    // Unter dem Namen steht die Funktion nur noch beim Kopf.
    assert.equal(doc.querySelectorAll('#listMitglieder .row__sub').length, 1);
  } finally { zurueck(); }
  const g = await read('assets/js/groups.js');
  assert.match(g, /leitungen: \{ key: 'grp\.kader\.leitungen', de: 'Trainer' \}/);
  assert.match(g, /mitgliederPl: \{ key: 'grp\.kader\.mitgliederPl', de: 'Athleten' \}/);
});

test('"E-Mail an alle" steht in der Kopfzeile der Liste, nicht unter dem letzten Namen', async () => {
  const html = await read('pages/gruppe.html');
  const kopfzeile = html.slice(html.indexOf('<div class="marke marke--reihe">'), html.indexOf('<div class="rows" id="listMitglieder">'));
  assert.match(kopfzeile, /id="btnVerteiler"/);
  assert.doesNotMatch(html, /b b--secondary b--block" id="btnVerteiler"/);
});

test('die Leitung wählt die Farbe der Gruppe — Seite, Leiste und Pille ziehen mit', async () => {
  const { doc, zurueck } = await starteGruppe(kopf());
  try {
    await warte(() => doc.querySelectorAll('#gruppeFarbe [data-farbe]').length);
    const felder = [...doc.querySelectorAll('#gruppeFarbe [data-farbe]')];
    assert.equal(felder.length, 8, 'die Farben des Kalenders');
    assert.equal(felder.filter(f => f.getAttribute('aria-checked') === 'true').length, 1);
    assert.ok(doc.documentElement.style.getPropertyValue('--gruppe-farbe'), 'die Seite trägt die Farbe');

    let gemeldet = null;
    doc.defaultView.addEventListener('firn-gruppe-geaendert', e => { gemeldet = e.detail; });
    const gruen = doc.querySelector('#gruppeFarbe [data-farbe="#1d9e75"]');
    klick(gruen);
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'gruppeAendern'));
    assert.deepEqual(globalThis.__aufrufe.find(a => a[0] === 'gruppeAendern').slice(1), ['g1', { farbe: '#1d9e75' }]);
    assert.equal(doc.documentElement.style.getPropertyValue('--gruppe-farbe'), '#1d9e75');
    assert.equal(doc.querySelector('#gruppeFarbe [data-farbe="#1d9e75"]').getAttribute('aria-checked'), 'true');
    assert.deepEqual(gemeldet, { id: 'g1', patch: { farbe: '#1d9e75' } }, 'die Leiste erfährt es');
  } finally { zurueck(); }

  // Die Leiste nimmt die neue Farbe auf, ohne neu zu laden.
  const shell = await read('assets/js/shell.js');
  assert.match(shell, /window\.addEventListener\('firn-gruppe-geaendert', event => \{[\s\S]{0,300}gruppen = gruppen\.map\(g => \(g\.id === id \? \{ \.\.\.g, \.\.\.patch \} : g\)\);[\s\S]{0,200}zeichne\(\);/);
});

test('löschen darf nur der Kopf — nach einer Frage mit dem Namen', async () => {
  const trainer = await starteGruppe(kopf('staff'));
  try {
    await warte(() => !trainer.doc.getElementById('secAktionen').hidden);
    assert.equal(trainer.doc.getElementById('grpLoeschen').hidden, true, 'ein Trainer sieht es nicht');
  } finally { trainer.zurueck(); }

  const { doc, zurueck } = await starteGruppe(kopf());
  try {
    await warte(() => !doc.getElementById('grpLoeschen').hidden);
    klick(doc.getElementById('btnGruppeLoeschen'));
    await warte(() => doc.querySelector('dialog.frage'));
    assert.match(doc.querySelector('dialog.frage .frage__titel').textContent, /BSV Kader/);
    klick(doc.querySelector('dialog.frage [data-frage="nein"]'));
    await warte(() => !doc.querySelector('dialog.frage'));
    assert.ok(!globalThis.__aufrufe.some(a => a[0] === 'gruppeLoeschen'), 'Abbrechen löscht nichts');

    klick(doc.getElementById('btnGruppeLoeschen'));
    await warte(() => doc.querySelector('dialog.frage'));
    klick(doc.querySelector('dialog.frage [data-frage="ja"]'));
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'gruppeLoeschen'));
    assert.deepEqual(globalThis.__aufrufe.find(a => a[0] === 'gruppeLoeschen').slice(1), ['g1', 'timo']);
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'aktiveGruppeSetzen' && a[1] === 'g2'));
  } finally { zurueck(); }
});

test('beim Löschen geht der Kopf zuletzt — die Regel lässt ihn erst, wenn die Gruppe weg ist', async () => {
  const g = await read('assets/js/groups.js');
  const koerper = g.slice(g.indexOf('export async function gruppeLoeschen'), g.indexOf('export function gruppeAendern'));
  const reihe = ['deleteDoc(gruppeRef(gid))', "collection(db, 'groups', gid, 'kontakte')", 'stapel.delete(ref)', 'deleteDoc(mitgliedRef(gid, uid))'];
  const stellen = reihe.map(s => koerper.lastIndexOf(s));
  assert.ok(stellen.every(i => i > 0), 'alle Schritte da');
  assert.ok(koerper.indexOf('deleteDoc(gruppeRef(gid))') < koerper.indexOf('stapel.delete(ref)'), 'erst die Gruppe');
  assert.ok(koerper.indexOf('stapel.delete(ref)') < koerper.indexOf('deleteDoc(mitgliedRef(gid, uid))'), 'der Kopf zuletzt');
  assert.match(koerper, /mitglieder\.docs\.filter\(d => d\.id !== uid\)/);

  const regeln = await read('firestore.rules');
  assert.match(regeln, /request\.auth\.uid == uid\s*&& resource\.data\.get\('rolle', ''\) == 'head'\s*&& !exists\(\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\)/);
  assert.match(regeln, /allow delete: if headsGroup\(gid\);/, 'die Gruppe löscht der Kopf');
});
