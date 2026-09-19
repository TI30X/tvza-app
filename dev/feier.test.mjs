/* Planen mit Freunden (v.35.75.0).
 *
 * Die Frage, an der dieser Test hängt: kommt bei den Freunden etwas
 * dazu, OHNE dass sich beim Sport etwas ändert? Darum steht neben
 * jeder Zusage über die Familie eine über den Kader.
 *
 * Und: es entsteht kein zweiter sozialer Graph und kein zweiter
 * Kalender. Eine Feier ist ein Termin der Gruppe `familie` — mit
 * denselben Zusagen, derselben Packliste, demselben Gastlink.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ARTEN, ARTEN_JE_GRUPPE, BEREICH_DER_ART, artenFuer, artWort, artName,
  kenntFeier, istFeier, kenntDisziplinen, pruefe,
} from '../assets/js/termine.js';
import { packlisteAusText, packlisteFuer, PACKLISTE_MAX } from '../assets/js/programm.js';
import { starteGruppe, klick, warte } from './gruppe-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = name => readFile(join(root, name), 'utf8');

const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);
const leitung = art => ({
  gruppen: [{ id: 'g2', name: 'Freunde', art, meineRolle: 'head' }],
  mitglieder: [
    { uid: 'timo', name: 'Timothy', rolle: 'head' },
    { uid: 'anna', name: 'Anna', rolle: 'mitglied' },
  ],
  heute: '2026-08-05',
});

function tippe(feld, wert) {
  feld.value = wert;
  feld.dispatchEvent(new feld.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

/* ── Die vierte Art ────────────────────────────────────────────────*/

test('die Feier gibt es nur bei Familie und Freunden', () => {
  assert.ok(ARTEN.includes('feier'));
  assert.deepEqual([...ARTEN_JE_GRUPPE.familie], ['training', 'lager', 'feier']);
  assert.deepEqual([...ARTEN_JE_GRUPPE.kader], ['training', 'lager', 'rennen']);
  assert.deepEqual([...ARTEN_JE_GRUPPE.organisation], ['training', 'lager', 'rennen']);
  assert.equal(kenntFeier('familie'), true);
  assert.equal(kenntFeier('kader'), false);
  assert.equal(istFeier('feier'), true);
  assert.equal(istFeier('training'), false);
});

test('der Sport behält seine Wörter, Buchstabe für Buchstabe', () => {
  assert.equal(artWort('training', 'kader'), 'Training');
  assert.equal(artWort('lager', 'kader'), 'Trainingslager');
  assert.equal(artWort('rennen', 'kader'), 'Rennen');
  assert.equal(artWort('training', 'organisation'), 'Kurs');
  assert.equal(artWort('lager', 'organisation'), 'Workshop');
  assert.equal(artWort('rennen', 'organisation'), 'Wettkampf');
  assert.equal(kenntDisziplinen('kader'), true);
  assert.equal(kenntDisziplinen('familie'), false);
});

test('eine Feier hat eine eigene Farbe, und die gibt es in kit.css', async () => {
  const bereich = BEREICH_DER_ART.feier;
  assert.equal(bereich, 't-feier');
  /* Und keine, die schon einer Sportart gehört. */
  for (const art of ['training', 'lager', 'rennen']) {
    assert.notEqual(BEREICH_DER_ART[art], bereich);
  }
  const css = await lies('assets/css/kit.css');
  assert.match(css, /\[data-bereich="t-feier"\]/);
});

test('eine Feier ist EIN Tag — mehrere Tage sind eine Reise', () => {
  const feier = { art: 'feier', titel: 'Grillabend', von: '2026-07-04', zeit: '18:00' };
  assert.deepEqual(pruefe(feier), []);
  assert.match(pruefe({ ...feier, bis: '2026-07-06' })[0], /Reise/);
  /* Ein Lager darf weiterhin mehrere Tage. */
  assert.deepEqual(pruefe({ art: 'lager', titel: 'Ferien', von: '2026-07-04', bis: '2026-07-11' }), []);
});

test('ein eigenes Wort schlägt die Art — auch bei einer Feier', () => {
  assert.equal(artName({ art: 'feier' }, 'familie'), 'Feier');
  assert.equal(artName({ art: 'feier', bezeichnung: 'Geburtstag' }, 'familie'), 'Geburtstag');
});

/* ── Wer bringt was mit ────────────────────────────────────────────*/

test('aus Zeilen werden Punkte — ohne Leerzeilen und ohne Dubletten', () => {
  const liste = packlisteAusText('Salat\r\nGetränke\n\n  salat  \nMusikbox');
  assert.deepEqual(liste.map(p => p.name), ['Salat', 'Getränke', 'Musikbox']);
  assert.ok(liste.every(p => p.id && p.id.length > 0));
  assert.equal(new Set(liste.map(p => p.id)).size, 3, 'jeder Punkt braucht eine eigene Kennung');
  assert.deepEqual(packlisteAusText(''), []);
  assert.deepEqual(packlisteAusText(null), []);
});

test('die Mitbringliste bleibt begrenzt', () => {
  const viele = Array.from({ length: PACKLISTE_MAX + 20 }, (_, i) => `Sache ${i}`).join('\n');
  assert.equal(packlisteAusText(viele).length, PACKLISTE_MAX);
  assert.equal(packlisteAusText('a'.repeat(400))[0].name.length, 120);
});

test('es ist dieselbe Packliste wie beim Lager — abgehakt wird je Person', () => {
  const liste = packlisteAusText('Salat\nGetränke');
  const fertig = packlisteFuer({ packliste: liste }, { erledigt: { [liste[0].id]: true }, eigene: [] });
  assert.equal(fertig.length, 2);
  assert.equal(fertig[0].an, true);
  assert.equal(fertig[1].an, false);
  assert.ok(fertig.every(p => p.eigen === false));
});

/* ── Das Formular ──────────────────────────────────────────────────*/

test('bei Freunden stehen Mitbringen und Gastlink gleich im Formular', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('familie'));
  try {
    klick(doc.getElementById('btnTermin'));
    assert.equal(doc.getElementById('grpFeier').hidden, false);
    assert.ok(doc.getElementById('fMitbringen'));
    assert.ok(doc.getElementById('fGastlink'));
  } finally { zurueck(); }
});

test('beim Sport stehen sie NICHT im Formular', async () => {
  for (const art of ['kader', 'organisation']) {
    const { doc, zurueck } = await starteGruppe(leitung(art));
    try {
      klick(doc.getElementById('btnTermin'));
      assert.equal(doc.getElementById('grpFeier').hidden, true, art);
    } finally { zurueck(); }
  }
});

test('eine Feier entsteht in EINEM Zug: Titel, Zeit, Ort, Mitbringen, Gastlink', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('familie'));
  try {
    klick(doc.getElementById('btnTermin'));
    klick(doc.querySelector('#fArtWahl [data-art-wahl="feier"]'));
    assert.equal(doc.getElementById('fArt').value, 'feier');
    /* Eine Feier hat eine Uhrzeit und kein Bis-Datum. */
    assert.equal(doc.getElementById('grpZeit').hidden, false);
    assert.equal(doc.getElementById('grpBis').hidden, true);

    tippe(doc.getElementById('fTitel'), 'Annas Geburtstag');
    tippe(doc.getElementById('fVon'), '2026-08-08');
    tippe(doc.getElementById('fZeit'), '19:00');
    tippe(doc.getElementById('fOrt'), 'bei Anna');
    tippe(doc.getElementById('fNotiz'), 'Bitte pünktlich.');
    tippe(doc.getElementById('fMitbringen'), 'Salat\nGetränke');
    doc.getElementById('fGastlink').checked = true;

    klick(doc.getElementById('btnSpeichern'));
    await warte(() => aufrufe('terminAnlegen').length > 0);

    const [, gid, uid, daten] = aufrufe('terminAnlegen')[0];
    assert.equal(gid, 'g2');
    assert.equal(uid, 'timo');
    assert.equal(daten.art, 'feier');
    assert.equal(daten.titel, 'Annas Geburtstag');
    assert.equal(daten.von, '2026-08-08');
    assert.equal(daten.zeit, '19:00');
    assert.equal(daten.ort, 'bei Anna');
    assert.equal(daten.notiz, 'Bitte pünktlich.');
    assert.deepEqual(daten.packliste.map(p => p.name), ['Salat', 'Getränke']);
    assert.ok(daten.gastToken && daten.gastToken.length >= 8, 'der Gastlink fehlt');
    /* Kein zweites Modell: es ist ein Termin der Gruppe. */
    assert.equal(daten.bis, null);
    assert.equal(daten.disziplin, null);
  } finally { zurueck(); }
});

test('ohne Haken kein Gastlink, ohne Zeilen keine Mitbringliste', async () => {
  const { doc, zurueck } = await starteGruppe(leitung('familie'));
  try {
    klick(doc.getElementById('btnTermin'));
    klick(doc.querySelector('#fArtWahl [data-art-wahl="feier"]'));
    tippe(doc.getElementById('fTitel'), 'Spieleabend');
    tippe(doc.getElementById('fVon'), '2026-08-08');
    klick(doc.getElementById('btnSpeichern'));
    await warte(() => aufrufe('terminAnlegen').length > 0);

    const daten = aufrufe('terminAnlegen')[0][3];
    assert.equal(daten.gastToken, undefined);
    assert.equal(daten.packliste, undefined);
  } finally { zurueck(); }
});

/* ── Die Wörter am fertigen Termin ─────────────────────────────────*/

test('bei Freunden heisst die Packliste „Mitbringen" und das Programm „Ablauf"', async () => {
  const { doc, zurueck } = await starteGruppe({
    ...leitung('familie'),
    termine: [{
      id: 'f1', art: 'feier', titel: 'Annas Geburtstag', von: '2026-08-08', zeit: '19:00',
      ort: 'bei Anna', createdBy: 'timo',
      packliste: [{ id: 'k1', name: 'Salat' }],
    }],
  });
  try {
    await warte(() => doc.querySelector('[data-termin="f1"], #agenda a[href*="f1"], #agenda [data-termin]'));
    const ziel = doc.querySelector('[data-termin="f1"]') || doc.querySelector('#agenda [data-termin]');
    klick(ziel);
    await warte(() => doc.getElementById('secDetail').hidden === false);
    assert.equal(doc.getElementById('packWort').textContent, 'Mitbringen');
    assert.equal(doc.getElementById('programmWort').textContent, 'Ablauf');
    /* Und die Art steht als Wort oben. */
    assert.match(doc.getElementById('dMeta').textContent, /Feier/);
  } finally { zurueck(); }
});

test('beim Sport bleiben „Packliste" und „Programm" stehen', async () => {
  const { doc, zurueck } = await starteGruppe({
    ...leitung('kader'),
    termine: [{
      id: 't1', art: 'lager', titel: 'Herbstlager', von: '2026-08-08', bis: '2026-08-11',
      createdBy: 'timo', packliste: [{ id: 'k1', name: 'Skischuhe' }],
    }],
  });
  try {
    await warte(() => doc.querySelector('#agenda [data-termin]'));
    klick(doc.querySelector('#agenda [data-termin]'));
    await warte(() => doc.getElementById('secDetail').hidden === false);
    assert.equal(doc.getElementById('packWort').textContent, 'Packliste');
    assert.equal(doc.getElementById('programmWort').textContent, 'Programm');
  } finally { zurueck(); }
});

test('terminAnlegen schreibt den Gastlink auch wirklich hinaus', async () => {
  /* Im Rundgang gefunden: das Formular setzte gastToken, und
     terminAnlegen liess ihn weg — seine Feldliste kannte ihn nicht.
     Der jsdom-Test sah nur die Absicht (er haelt groups.js an), nicht
     den Schreibvorgang. Darum diese Zeile. */
  const g = await lies('assets/js/groups.js');
  const block = g.slice(g.indexOf('export async function terminAnlegen'));
  const ende = block.indexOf('return ref.id;');
  assert.match(block.slice(0, ende), /gastToken: termin.gastToken,/);
});

/* ── Kein zweites Modell ───────────────────────────────────────────*/

test('eine Feier ist ein Termin der Gruppe — keine eigene Sammlung', async () => {
  const rules = await lies('firestore.rules');
  /* Keine Sammlung 'feiern', 'parties' oder dergleichen. */
  for (const erfunden of ['/feiern/', '/parties/', '/anlaesse/']) {
    assert.ok(!rules.includes(erfunden), `es gibt eine zweite Sammlung: ${erfunden}`);
  }
  /* Die Regel kennt die vierte Art im selben Zweig wie die drei. */
  assert.match(rules, /request\.resource\.data\.art in \['training', 'lager', 'rennen', 'feier'\]/);
  /* Zusagen, Packliste und Gastzugang sind unverändert dieselben. */
  assert.ok(rules.includes('/groups/{gid}/events/{eid}/zusagen/{uid}'));
  assert.ok(rules.includes('/groups/{gid}/events/{eid}/gepackt/{uid}'));
  assert.match(rules, /function terminGast\(eid, termin\)/);
});

test('die drei Antworten bleiben ja, nein und vielleicht', async () => {
  const { ANTWORTEN } = await import('../assets/js/groups.js').catch(() => ({ ANTWORTEN: null }));
  const rules = await lies('firestore.rules');
  assert.match(rules, /request\.resource\.data\.antwort in \['ja', 'nein', 'vielleicht'\]/);
  void ANTWORTEN;

});
