import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Die Sprachdateien sind die einzige Stelle, an der sich sieben Kopien
   derselben Sache auseinanderleben koennen. Genau davor schuetzt dieser
   Test: gleicher Schluesselsatz ueberall, keine leeren Werte, und kein
   data-i18n im Markup, das ins Leere zeigt.

   Ohne ihn faellt eine vergessene Uebersetzung erst dem Nutzer auf —
   und zwar als deutscher Fetzen mitten in einer spanischen Oberflaeche. */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const LANGS = ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es'];

const load = async lang =>
  JSON.parse(await readFile(join(root, 'assets', 'i18n', `${lang}.json`), 'utf8'));

test('alle Sprachdateien tragen denselben Schluesselsatz', async () => {
  const catalogs = Object.fromEntries(
    await Promise.all(LANGS.map(async lang => [lang, await load(lang)]))
  );
  const base = Object.keys(catalogs.de).sort();
  assert.ok(base.length > 50, 'de.json wirkt leer');

  for (const lang of LANGS.slice(1)) {
    const keys = Object.keys(catalogs[lang]).sort();
    const missing = base.filter(k => !keys.includes(k));
    const extra = keys.filter(k => !base.includes(k));
    assert.deepEqual(missing, [], `${lang}.json fehlen Schluessel`);
    assert.deepEqual(extra, [], `${lang}.json hat Schluessel, die de.json nicht kennt`);
  }
});

test('keine leeren Uebersetzungen', async () => {
  for (const lang of LANGS) {
    const catalog = await load(lang);
    const empty = Object.entries(catalog)
      .filter(([, value]) => typeof value !== 'string' || !value.trim())
      .map(([key]) => key);
    assert.deepEqual(empty, [], `${lang}.json hat leere Werte`);
  }
});

/* Jede Seite der App, gefunden statt aufgezaehlt.
 *
 * Die beiden Listen hier waren fest verdrahtet, und willkommen.html
 * stand in keiner. Die Tests liefen gruen und prueften die neue Seite
 * schlicht nicht. Wer eine Seite anlegt, soll sie nicht auch noch in
 * zwei Testlisten eintragen muessen — das ist genau der Schritt, den
 * man vergisst. */
async function seiten() {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html')).sort();
  const unter = (await readdir(join(root, 'pages')))
    .filter(f => f.endsWith('.html')).map(f => `pages/${f}`).sort();
  return [...wurzel, ...unter];
}

test('jedes data-i18n im Markup hat einen Schluessel', async () => {
  const de = await load('de');
  const files = [...await seiten(), 'assets/js/shell.js', 'assets/js/nav.js'];

  const unknown = new Set();
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    for (const match of text.matchAll(/data-i18n(?:-html)?="([^"${}]+)"/g)) {
      if (!(match[1] in de)) unknown.add(`${file}: ${match[1]}`);
    }
    for (const match of text.matchAll(/data-i18n-attr="([^"${}]+)"/g)) {
      for (const pair of match[1].split(';')) {
        const key = pair.split(':')[1];
        if (key && !(key.trim() in de)) unknown.add(`${file}: ${key.trim()}`);
      }
    }
  }
  assert.deepEqual([...unknown], [], 'unbekannte i18n-Schluessel im Markup');
});

test('die Sprachdateien liegen im Service-Worker-Vorrat', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  for (const lang of LANGS) {
    assert.ok(sw.includes(`assets/i18n/${lang}.json`), `${lang}.json fehlt in sw.js`);
  }
  assert.ok(sw.includes('assets/js/i18n.js'), 'i18n.js fehlt in sw.js');
});

test('i18n.js laeuft auf jeder angemeldeten Seite', async () => {
  const files = await seiten();
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    assert.match(text, /assets\/js\/i18n\.js/, `${file} laedt i18n.js nicht`);
  }
});

/* ── Die Rueckfallebene ────────────────────────────────────────────
   t() gibt bei einem unbekannten Schluessel den SCHLUESSEL zurueck,
   nie undefined. `t(k) ?? deutsch` und `t(k) || deutsch` greifen
   deshalb NIE — der Nutzer sieht "nav.gruppe" statt "Gruppe".

   Sichtbar wird das nur in einem schmalen Fenster: der Katalog wird
   asynchron geholt, und wer vorher zeichnet, zeichnet den Schluessel.
   In sechs Modulen stand genau dieses Muster. */

const blindeStelle = ' nutzt t() mit ?? oder || — das greift nie, weil t() den '
  + 'Schluessel zurueckgibt. Stattdessen tOr(key, fallback) verwenden.';

test('i18n bietet eine Rueckfallebene an, die auch greift', async () => {
  const quelle = await readFile(new URL('../assets/js/i18n.js', import.meta.url), 'utf8');
  assert.match(quelle, /function tOr\(key, fallback, vars\)/, 'tOr fehlt');
  assert.match(quelle, /if \(wert !== key\) return wert;/,
    'tOr prueft nicht auf den durchgereichten Schluessel');
  assert.match(quelle, /t, tOr, applyTo/, 'tOr fehlt in der oeffentlichen API');
});

test('kein Modul verlaesst sich auf ?? oder || nach t()', async () => {
  const dateien = ['assets/js/feature/gruppe/gruppe.js', 'assets/js/nav.js',
                   'assets/js/shell.js', 'assets/js/groups.js',
                   'assets/js/termine.js', 'assets/js/briefing.js'];

  for (const name of dateien) {
    const quelle = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    const kaputt = quelle.match(/TVZAI18n\??\.t\([^)]*\)\s*(\?\?|\|\|)/);
    assert.equal(kaputt, null,
      name + blindeStelle);
  }
});
