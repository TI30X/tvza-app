/* Tests für dev/i18n-src/build.mjs — den Katalogbau in Node.
 *
 * Warum es den überhaupt gibt: auf dem Rechner, auf dem diese App
 * gebaut wird, ist kein Python installiert. Damit war der Katalog
 * monatelang nicht baubar, und jede neue Beschriftung aus den Phasen 2
 * bis 5 blieb ohne Schlüssel — auf Deutsch richtig, in den anderen
 * sechs Sprachen ebenfalls deutsch.
 *
 * Der wichtigste Test ist der letzte: die ERZEUGTEN Dateien müssen mit
 * den eingecheckten übereinstimmen. Läuft das auseinander, zeigt die
 * App etwas anderes als der Katalog sagt, und niemand merkt es — die
 * JSON-Dateien werden ja mitversioniert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { baue, leseKatalog, leseSprachen } from './i18n-src/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('der Parser überlebt einen mehrzeiligen Eintrag', async () => {
  /* Der erste Anlauf war zeilenweise und ist genau hier zerbrochen:
     eine Reihe mit sieben Übersetzungen passt nicht immer in eine
     Zeile, und dann wurde aus einer französischen Beschriftung
     plötzlich ein Schlüssel. */
  const quelle = `
LANGS = ['de', 'en']
KEYS = {
'kurz': ('eins', 'one'),
'lang': ('ein sehr langer deutscher Text',
         'a rather long english text'),
}
`;
  const eintraege = leseKatalog(quelle);
  assert.deepEqual([...eintraege.keys()], ['kurz', 'lang']);
  assert.deepEqual(eintraege.get('lang'), ['ein sehr langer deutscher Text', 'a rather long english text']);
});

test('ein Anführungszeichen im Text zerreisst die Zeile nicht', () => {
  // "l'entraînement" ist französisch völlig normal. Ein Regex zählt an
  // so etwas falsch, ein Tokenizer nicht.
  const quelle = `
LANGS = ['de', 'fr']
KEYS = {
'a': ('Training', "l'entraînement"),
'b': ('Test', 'l\\'atelier'),
}
`;
  const eintraege = leseKatalog(quelle);
  assert.deepEqual(eintraege.get('a'), ['Training', "l'entraînement"]);
  assert.deepEqual(eintraege.get('b'), ['Test', "l'atelier"]);
});

test('Kommentare zwischen den Einträgen stören nicht', () => {
  const quelle = `
LANGS = ['de', 'en']
KEYS = {
# ── Ein Abschnitt ─────────────────────────────
'a': ('eins', 'one'),   # nachgestellt
'b': ('zwei', 'two'),
}
`;
  assert.deepEqual([...leseKatalog(quelle).keys()], ['a', 'b']);
});

test('die Sprachen kommen aus der Tabelle, nicht aus einer Kopie', async () => {
  const haupt = await readFile(join(root, 'dev/i18n-src/catalog.py'), 'utf8');
  assert.deepEqual(leseSprachen(haupt), ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es']);
});

test('jede Zeile hat genau sieben Spalten und keine ist leer', async () => {
  // Das prüft build.mjs selbst und wirft sonst. Der Test hält fest,
  // dass es das WEITER tut: eine fehlende Übersetzung, die still zu
  // einer leeren Beschriftung wird, ist schlimmer als ein Abbruch.
  const { zusammen, sprachen } = await baue({ schreiben: false });

  for (const [schluessel, werte] of zusammen) {
    assert.equal(werte.length, sprachen.length, `${schluessel} hat ${werte.length} Spalten`);
    for (const [i, wert] of werte.entries()) {
      assert.ok(String(wert).trim(), `${schluessel} ist leer in ${sprachen[i]}`);
    }
  }
});

test('die erzeugten Dateien sind die eingecheckten', async () => {
  /* Der eigentliche Test. Die JSON-Dateien werden mitversioniert,
     damit die App ohne Build-Schritt auskommt — laufen sie und der
     Katalog auseinander, zeigt die App etwas anderes als die Quelle
     sagt, und es fällt niemandem auf. */
  const { raus } = await baue({ schreiben: false });

  for (const [sprache, erwartet] of raus) {
    const vorhanden = await readFile(join(root, `assets/i18n/${sprache}.json`), 'utf8');
    assert.equal(vorhanden, erwartet,
      `assets/i18n/${sprache}.json ist nicht aus dem Katalog gebaut — `
      + 'node dev/i18n-src/build.mjs ausführen');
  }
});

test('die Wörter, die der Code anfragt, gibt es auch', async () => {
  const de = JSON.parse(await readFile(join(root, 'assets/i18n/de.json'), 'utf8'));

  /* Diese Schlüssel setzt der Code zusammen — grp.<art>.<rolle> und
     termin.art.<gruppenart>.<art>. Ein Tippfehler dort fällt sonst
     erst auf, wenn jemand die Sprache umstellt und deutsche Wörter in
     einer polnischen Oberfläche stehen. */
  for (const art of ['kader', 'org', 'familie']) {
    for (const rolle of ['head', 'staff', 'mitglied', 'mitglieder']) {
      assert.ok(de[`grp.${art}.${rolle}`], `grp.${art}.${rolle} fehlt`);
    }
  }
  for (const gruppenart of ['kader', 'organisation', 'familie']) {
    for (const terminart of ['training', 'lager', 'rennen']) {
      assert.ok(de[`termin.art.${gruppenart}.${terminart}`],
        `termin.art.${gruppenart}.${terminart} fehlt`);
    }
  }
  for (const k of ['nav.gruppe', 'nav.chat', 'brief.deinTag']) {
    assert.ok(de[k], `${k} fehlt`);
  }
});
