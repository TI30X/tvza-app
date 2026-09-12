/* Firn ist das Produkt, TVZA der Absender.

   Der Umbenennung sind Reste zweimal durchgerutscht: "TvZ" oben links
   stand als content: in kit.css (v.35.19.0 gefunden), und bis v.35.23.0
   hiessen neun Seiten im Browsertab noch "— TVZA", der Homescreen am
   iPhone ebenfalls, der Bereich "TVZA Watchlist" und der Kalender-Knopf
   "TVZA exportieren". Jedes Mal hat die Suche an der falschen Stelle
   gesucht.

   Dieser Test sucht an den Stellen, die ein Mensch SIEHT: Tab-Titel,
   Homescreen-Name, und jede Beschriftung im Katalog. TVZA darf dort
   genau als Absender stehen — "Firn — ein Projekt von TVZA". Die
   oeffentliche Projektseite (public.html) ist TVZAs eigene Seite und
   bleibt aussen vor. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUSNAHMEN = new Set(['public.html']);

async function seiten() {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html')).map(f => f);
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  return [...wurzel, ...unter].filter(f => !AUSNAHMEN.has(f.split('/').pop()));
}

test('kein Tab-Titel heisst noch TVZA', async () => {
  const funde = [];
  for (const f of await seiten()) {
    const html = await readFile(join(root, f), 'utf8');
    const titel = html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] || '';
    if (/TVZA|TvZ/.test(titel)) funde.push(`${f}: ${titel}`);
  }
  assert.deepEqual(funde, []);
});

test('der Homescreen heisst Firn', async () => {
  for (const f of await seiten()) {
    const html = await readFile(join(root, f), 'utf8');
    const name = html.match(/name="apple-mobile-web-app-title" content="([^"]*)"/)?.[1];
    if (name !== undefined) assert.equal(name, 'Firn', `${f}: apple-mobile-web-app-title`);
  }
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert.doesNotMatch(`${manifest.name} ${manifest.short_name}`, /TVZA|TvZ/);
});

test('keine Beschriftung im Katalog nennt TVZA, ausser als Absender', async () => {
  const ABSENDER = new Set(['fuss.absender', 'wk.fuss']);
  for (const sprache of ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es']) {
    const katalog = JSON.parse(await readFile(join(root, `assets/i18n/${sprache}.json`), 'utf8'));
    const funde = Object.entries(katalog)
      .filter(([k, v]) => !ABSENDER.has(k) && /TVZA|TvZ/.test(String(v)))
      .map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(funde, [], `${sprache}.json`);
  }
});
