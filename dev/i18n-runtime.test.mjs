import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

/* Rauchtest für assets/js/i18n.js.

   Der Katalogtest daneben prüft die Dateien, dieser prüft die Mechanik:
   Fällt der Katalog aus, muss die deutsche Beschriftung stehen bleiben —
   genau das ist die Zusage, auf der die schrittweise Umstellung ruht.
   Eine Seite, die noch keine Schlüssel trägt, darf nie leer werden. */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PAGE = `<!DOCTYPE html><html lang="de"><head><title>t</title></head><body>
  <h2 data-i18n="home.schnellzugriff">Schnellzugriff</h2>
  <button data-i18n-attr="title:a11y.zurueck" title="Zurück">x</button>
  <p data-i18n="gibt.es.nicht">Unübersetzt</p>
  <span>Ganz ohne Schlüssel</span>
</body></html>`;

async function boot({ lang, offline = false } = {}) {
  const [script, es] = await Promise.all([
    readFile(join(root, 'assets/js/i18n.js'), 'utf8'),
    readFile(join(root, 'assets/i18n/es.json'), 'utf8'),
  ]);

  const dom = new JSDOM(PAGE, { url: 'https://tvza.test/index.html', runScripts: 'outside-only' });
  const { window } = dom;
  if (lang) window.localStorage.setItem('tvza-lang', lang);
  window.fetch = async url => {
    if (offline) throw new Error('offline');
    if (String(url).endsWith('/es.json')) {
      return { ok: true, status: 200, json: async () => JSON.parse(es) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.eval(script);
  await window.TVZAI18n.ready;
  return window;
}

test('ohne eigene Wahl bleibt das deutsche Markup stehen', async () => {
  const window = await boot();
  assert.equal(window.document.querySelector('h2').textContent, 'Schnellzugriff');
  assert.equal(window.document.documentElement.lang, 'de');
  assert.equal(window.TVZAI18n.activeLang, 'de');
});

test('eine gewählte Sprache beschriftet Text und Attribute um', async () => {
  const window = await boot({ lang: 'es' });
  assert.equal(window.document.querySelector('h2').textContent, 'Acceso rápido');
  assert.equal(window.document.querySelector('button').getAttribute('title'), 'Atrás');
  assert.equal(window.document.documentElement.lang, 'es');
});

test('ein unbekannter Schlüssel lässt den vorhandenen Text stehen', async () => {
  const window = await boot({ lang: 'es' });
  assert.equal(window.document.querySelector('p').textContent, 'Unübersetzt');
  assert.equal(window.document.querySelector('span').textContent, 'Ganz ohne Schlüssel');
});

test('ohne Netz und ohne Cache bleibt alles deutsch statt leer', async () => {
  const window = await boot({ lang: 'es', offline: true });
  assert.equal(window.document.querySelector('h2').textContent, 'Schnellzugriff');
  assert.equal(window.document.querySelector('button').getAttribute('title'), 'Zurück');
  /* Kein <html lang="es"> ueber deutschem Text: das Attribut beschreibt,
     was zu sehen ist, nicht was gewuenscht war. */
  assert.equal(window.document.documentElement.lang, 'de');
});

test('der zweite Besuch kommt ohne Netz aus', async () => {
  const first = await boot({ lang: 'es' });
  const cached = first.localStorage.getItem('tvza-lang-cache-es');
  assert.ok(cached && JSON.parse(cached)['home.schnellzugriff'] === 'Acceso rápido',
    'der Katalog liegt nach dem ersten Laden im Cache');
});

test('Intl liefert die Formate zur gewählten Sprache', async () => {
  const window = await boot({ lang: 'es' });
  const date = new window.Date(Date.UTC(2026, 7, 20));
  assert.match(window.TVZAI18n.format.date(date, { month: 'long' }), /agosto/);
  assert.equal(window.TVZAI18n.locale, 'es-ES');
});
