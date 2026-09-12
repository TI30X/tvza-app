/* Kontakte und Verteiler auf der Gruppenseite — gefahren, nicht gelesen.

   Das Wichtigste daran ist, wer was sieht: die Leitung alles, ein
   Athlet nur sich selbst. Die Regeln setzen das durch (die Tests dazu
   stehen unten); hier wird geprueft, dass die Oberflaeche nicht einmal
   fragt, wo sie nichts bekommen darf.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';
import { ELTERN_MAX, GRENZEN } from '../assets/js/kontakte.js';

const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);
const tippe = (feld, wert) => {
  feld.value = wert;
  feld.dispatchEvent(new feld.ownerDocument.defaultView.Event('input', { bubbles: true }));
};

const kader = rolle => ({
  gruppen: [{ id: 'g1', name: 'TEST', art: 'kader', meineRolle: rolle }],
  mitglieder: [
    { uid: 'timo', name: 'Timothy', rolle },
    { uid: 'lena', name: 'Lena', rolle: 'mitglied' },
    { uid: 'mia', name: 'Mia', rolle: 'mitglied' },
  ],
});

const karten = {
  lena: {
    telefon: '+41 79 111 22 33', email: 'lena@example.ch', notiz: 'Allergie: Nüsse',
    eltern: [{ name: 'Petra Muster', beziehung: 'Mutter', email: 'petra@example.ch', telefon: '+41 79 999 00 11' }],
  },
  timo: { email: 'timo@example.ch', eltern: [{ name: 'Michel', beziehung: 'Vater', email: 'michel@example.ch' }] },
};

async function oeffnePerson(doc, uid) {
  await warte(() => doc.querySelector(`[data-person="${uid}"]`));
  klick(doc.querySelector(`[data-person="${uid}"]`));
  await warte(() => !doc.getElementById('secPerson').hidden);
}

test('ein Athlet sieht die Kontaktkarte eines anderen nicht — und fragt gar nicht erst danach', async () => {
  globalThis.__kontakte = karten;
  const { doc, zurueck } = await starteGruppe(kader('mitglied'));
  try {
    await oeffnePerson(doc, 'lena');
    assert.equal(doc.getElementById('secKontakt').hidden, true);
    assert.equal(doc.getElementById('kontaktAnzeige').textContent.trim(), '');
    assert.doesNotMatch(doc.body.textContent, /petra@example\.ch/);
    /* Der Verteiler ist Sache der Leitung. */
    assert.equal(doc.getElementById('btnVerteiler').hidden, true);
  } finally { zurueck(); }
});

test('die eigene Karte sieht und bearbeitet jeder selbst', async () => {
  globalThis.__kontakte = karten;
  const { doc, zurueck } = await starteGruppe(kader('mitglied'));
  try {
    await oeffnePerson(doc, 'timo');
    assert.equal(doc.getElementById('secKontakt').hidden, false);
    await warte(() => /michel@example\.ch/.test(doc.getElementById('kontaktAnzeige').textContent));
    assert.match(doc.getElementById('kontaktAnzeige').textContent, /Michel · Vater/);
  } finally { zurueck(); }
});

test('die Leitung sieht die ganze Karte, Nummern und Adressen als Links', async () => {
  globalThis.__kontakte = karten;
  const { doc, zurueck } = await starteGruppe(kader('head'));
  try {
    await oeffnePerson(doc, 'lena');
    await warte(() => doc.querySelectorAll('#kontaktAnzeige .row').length >= 4);
    const links = [...doc.querySelectorAll('#kontaktAnzeige a.row')].map(a => a.getAttribute('href'));
    assert.ok(links.includes('tel:+41791112233'), 'Telefon als tel:-Link, nur Ziffern und Plus');
    assert.ok(links.includes('mailto:lena%40example.ch'));
    assert.ok(links.includes('mailto:petra%40example.ch'), 'die Mutter ist per Mail erreichbar');
    assert.match(doc.getElementById('kontaktAnzeige').textContent, /Allergie: Nüsse/);
  } finally { zurueck(); }
});

test('eine Nummer oder Adresse aus dem Formular wird kein fremder Link', async () => {
  globalThis.__kontakte = { lena: { telefon: 'javascript:alert(1)', email: 'x" onclick="y', eltern: [] } };
  const { doc, zurueck } = await starteGruppe(kader('head'));
  try {
    await oeffnePerson(doc, 'lena');
    await warte(() => doc.querySelectorAll('#kontaktAnzeige .row').length >= 1);
    for (const a of doc.querySelectorAll('#kontaktAnzeige a')) {
      assert.doesNotMatch(a.getAttribute('href'), /^javascript:/i);
    }
    assert.equal(doc.querySelector('#kontaktAnzeige [onclick]'), null);
  } finally { zurueck(); }
});

test('Kontakt bearbeiten: Eltern hinzufuegen, vertippte Adresse abgelehnt, sauber gespeichert', async () => {
  globalThis.__kontakte = { lena: { telefon: '079 111' } };
  const { doc, zurueck } = await starteGruppe(kader('head'));
  try {
    await oeffnePerson(doc, 'lena');
    await warte(() => doc.querySelectorAll('#kontaktAnzeige .row').length >= 1);
    klick(doc.getElementById('btnKontaktBearbeiten'));

    assert.equal(doc.getElementById('secKontaktForm').hidden, false);
    assert.equal(doc.getElementById('kTelefon').value, '079 111');
    /* Ohne erfasste Eltern steht schon eine leere Zeile da. */
    assert.equal(doc.querySelectorAll('#kEltern [data-eltern]').length, 1);

    const zeile = n => doc.querySelectorAll('#kEltern [data-eltern]')[n];
    tippe(zeile(0).querySelector('[data-feld="name"]'), 'Petra Muster');
    tippe(zeile(0).querySelector('[data-feld="beziehung"]'), 'Mutter');
    tippe(zeile(0).querySelector('[data-feld="email"]'), 'petra@example');   // Tippfehler

    klick(doc.getElementById('btnElternNeu'));
    assert.equal(doc.querySelectorAll('#kEltern [data-eltern]').length, 2);
    /* Was schon getippt war, bleibt beim Hinzufuegen stehen. */
    assert.equal(zeile(0).querySelector('[data-feld="name"]').value, 'Petra Muster');
    tippe(zeile(1).querySelector('[data-feld="name"]'), 'Hans Muster');

    klick(doc.getElementById('btnKontaktSpeichern'));
    assert.equal(doc.getElementById('kontaktFehler').hidden, false);
    assert.match(doc.getElementById('kontaktFehler').textContent, /petra@example/);
    assert.equal(aufrufe('kontaktSpeichern').length, 0);

    tippe(zeile(0).querySelector('[data-feld="email"]'), 'Petra@Example.ch');
    klick(doc.getElementById('btnKontaktSpeichern'));
    await warte(() => aufrufe('kontaktSpeichern').length > 0);
    const [[, gid, uid, karte, von]] = aufrufe('kontaktSpeichern');
    assert.equal(gid, 'g1');
    assert.equal(uid, 'lena');
    assert.equal(von, 'timo', 'wer gespeichert hat, steht dabei');
    assert.deepEqual(karte, {
      telefon: '079 111',
      eltern: [
        { name: 'Petra Muster', beziehung: 'Mutter', email: 'petra@example.ch' },
        { name: 'Hans Muster' },
      ],
    });
  } finally { zurueck(); }
});

test('mehr als vier Eltern gehen nicht, und eine Zeile laesst sich entfernen', async () => {
  globalThis.__kontakte = { lena: { eltern: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } };
  const { doc, zurueck } = await starteGruppe(kader('head'));
  try {
    await oeffnePerson(doc, 'lena');
    await warte(() => doc.querySelectorAll('#kontaktAnzeige .row').length >= 3);
    klick(doc.getElementById('btnKontaktBearbeiten'));
    klick(doc.getElementById('btnElternNeu'));
    assert.equal(doc.querySelectorAll('#kEltern [data-eltern]').length, ELTERN_MAX);
    assert.equal(doc.getElementById('btnElternNeu').hidden, true, 'beim vierten verschwindet der Knopf');

    klick(doc.querySelector('#kEltern [data-eltern-weg="1"]'));
    const namen = [...doc.querySelectorAll('#kEltern [data-feld="name"]')].map(i => i.value);
    assert.deepEqual(namen, ['A', 'C', '']);
    assert.equal(doc.getElementById('btnElternNeu').hidden, false);
  } finally { zurueck(); }
});

test('der Verteiler schreibt an alle, nur an die Eltern oder ohne sie — im BCC', async () => {
  globalThis.__kontakte = karten;
  const { doc, zurueck } = await starteGruppe(kader('head'));
  try {
    await warte(() => !doc.getElementById('btnVerteiler').hidden);
    klick(doc.getElementById('btnVerteiler'));
    await warte(() => !doc.getElementById('secVerteiler').hidden);

    const bcc = () => new URLSearchParams(doc.getElementById('lnkVerteiler').getAttribute('href').slice('mailto:?'.length)).get('bcc');
    assert.equal(bcc(), 'lena@example.ch,michel@example.ch,petra@example.ch,timo@example.ch');
    assert.match(doc.getElementById('verteilerZahl').textContent, /4 Adressen/);
    /* Mia hat keine Karte: sie wird genannt, damit man sie nachtraegt. */
    assert.match(doc.getElementById('verteilerFehlt').textContent, /Mia/);

    klick(doc.querySelector('#verteilerWahl [data-wer="eltern"]'));
    assert.equal(bcc(), 'michel@example.ch,petra@example.ch');
    klick(doc.querySelector('#verteilerWahl [data-wer="athleten"]'));
    assert.equal(bcc(), 'lena@example.ch,timo@example.ch');

    /* Der Betreff wandert in die Mail. */
    tippe(doc.getElementById('verteilerBetreff'), 'Lager Saas-Fee');
    assert.match(doc.getElementById('lnkVerteiler').getAttribute('href'), /subject=Lager%20Saas-Fee/);
    assert.doesNotMatch(doc.getElementById('lnkVerteiler').getAttribute('href'), /[?&]to=/);
  } finally { zurueck(); }
});

/* ── Die Regeln ──────────────────────────────────────────────────── */

async function kontaktBlock() {
  const regeln = await readFile(join(root, 'firestore.rules'), 'utf8');
  const a = regeln.indexOf('match /groups/{gid}/kontakte/{uid} {');
  assert.ok(a > 0, 'kein Regelblock fuer kontakte');
  const b = regeln.indexOf('\n    }\n', a);
  return regeln.slice(a, b);
}

test('Regeln: lesen nur Leitung und die Person selbst, auflisten nur die Leitung', async () => {
  const block = await kontaktBlock();
  assert.match(block, /allow get: if leadsGroup\(gid\) \|\| eigene\(\);/);
  assert.match(block, /allow list: if leadsGroup\(gid\);/);
  assert.match(block, /function eigene\(\) \{\s*return inGroup\(gid\) && request\.auth\.uid == uid;/);
  /* Kein Pfad, auf dem ein beliebiges Mitglied lesen koennte. */
  assert.doesNotMatch(block, /allow (get|list|read)[^;]*if inGroup\(gid\);/);
});

test('Regeln: eine Karte nur fuer ein Mitglied dieser Gruppe, mit begrenzten Feldern', async () => {
  const block = await kontaktBlock();
  assert.match(block, /allow create, update: if \(leadsGroup\(gid\) \|\| eigene\(\)\)[\s\S]*exists\(\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\/members\/\$\(uid\)\)[\s\S]*kontaktGueltig\(request\.resource\.data\)/);
  assert.match(block, /d\.geaendertVon == request\.auth\.uid/);
  /* Dieselben Grenzen wie in kontakte.js — sonst lehnt die Regel ab, was
     das Formular durchgelassen hat. */
  for (const feld of ['telefon', 'email', 'adresse', 'notiz']) {
    assert.match(block, new RegExp(`d\\.${feld}\\.size\\(\\) <= ${GRENZEN[feld]}\\)`), feld);
  }
  assert.match(block, new RegExp(`d\\.eltern\\.size\\(\\) <= ${ELTERN_MAX}\\)`));
});

test('wer die Gruppe verlaesst oder entfernt wird, dessen Karte geht mit', async () => {
  const groups = await readFile(join(root, 'assets/js/groups.js'), 'utf8');
  for (const fn of ['mitgliedEntfernen', 'gruppeVerlassen']) {
    const rumpf = groups.slice(groups.indexOf(`export function ${fn}(`)).split('\n}\n')[0];
    assert.match(rumpf, /\.delete\(kontaktRef\(gid, uid\)\)/, `${fn} laesst die Karte liegen`);
    assert.match(rumpf, /\.delete\(mitgliedRef\(gid, uid\)\)/);
  }
});
