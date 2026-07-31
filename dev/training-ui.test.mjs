/* Rauchtest für pages/training.html.

   Die Seite ist ein einzelnes Inline-Modul, das ohne Browser nicht läuft:
   sie importiert firebase-config.js (Netz) und erwartet DOM, fetch und
   localStorage. Der Test baut genau diese vier Dinge nach — jsdom für das
   DOM, ein Stub für firebase-config, die echten Programmdaten von der
   Platte — und klickt sich dann durch alle Ansichten.

   Damit wird geprüft, was der Syntaxtest nicht sieht: dass Wochenleiste,
   Einheitenliste und Fokusmodus tatsächlich etwas rendern und das Abhaken
   im Protokoll landet.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const STUB = `
  export const escHtml = str => String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  export const requireAuth = () => Promise.resolve({ uid: 'test', email: 't@example.test' });
  export const wireOfflineBanner = () => {};
`;

/* Statt Firestore ein Mitschreiber: so lässt sich prüfen, dass die Seite
   den Sync überhaupt füttert — und womit. */
const SYNC_STUB = `
  export function connectTraining({ onProgram, onLogs }) {
    const calls = [];
    globalThis.__training = { calls, onProgram, onLogs };
    return {
      saveDay: (date, units) => calls.push({ type: 'day', date, units }),
      saveProgram: async program => calls.push({ type: 'program', id: program.id }),
      stop() {},
    };
  }
`;

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function bootPage() {
  const html = await readFile(join(root, 'pages/training.html'), 'utf8');
  const source = html.match(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/i)[1];

  const dom = new JSDOM(html.replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/i, ''), {
    url: 'https://tvza.test/pages/training.html',
  });
  const { window } = dom;

  const files = {
    'kw31-2026.json': join(root, 'assets/data/training/kw31-2026.json'),
    'images.json': join(root, 'assets/data/training/images.json'),
  };
  const fakeFetch = async url => {
    const name = String(url).split('/').pop();
    if (!files[name]) return { ok: false, status: 404, json: async () => ({}) };
    const body = JSON.parse(await readFile(files[name], 'utf8'));
    return { ok: true, status: 200, json: async () => body };
  };

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;   // jsdom bringt es mit
  globalThis.fetch = fakeFetch;
  globalThis.location = window.location;

  const parserUrl = pathToFileURL(join(root, 'assets/js/training-parser.js')).href;
  const patched = source
    .replace(/from '\.\.\/assets\/js\/firebase-config\.js'/, `from '${dataUrl(STUB)}'`)
    .replace(/from '\.\.\/assets\/js\/training-parser\.js'/, `from '${parserUrl}'`)
    .replace(/'\.\.\/assets\/js\/training-sync\.js'/, `'${dataUrl(SYNC_STUB)}'`);

  await import(dataUrl(patched));

  /* Die Seite wartet auf requireAuth und zwei fetch-Aufrufe, bevor sie
     zeichnet. Warten, bis der Kopf nicht mehr "Lade…" zeigt. */
  for (let i = 0; i < 100; i++) {
    if (window.document.getElementById('topSub').textContent !== 'Lade…' && globalThis.__training) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return window.document;
}

const doc = await bootPage();
/* Alles Wechselnde liegt in #view — der Seitenkopf darüber trägt dieselben
   Klassennamen und würde sonst dazwischenfunken. */
const $ = sel => doc.querySelector(`#view ${sel}`);
const $$ = sel => [...doc.querySelectorAll(`#view ${sel}`)];
const click = el => {
  assert.ok(el, 'Element zum Klicken fehlt');
  el.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
};

test('Wochenansicht zeigt sieben Tage und den Programmkopf', () => {
  assert.equal(doc.getElementById('topSub').textContent, 'KW 31 TW 12 · Van Zanten Timothy');
  assert.equal($$('.tr-day').length, 7);
  assert.equal($$('.tr-day')[0].textContent.includes('Mo'), true);
});

test('ein Tag mit Einheiten zeigt Karten, ein Ruhetag nicht', () => {
  click($$('.tr-day')[1]);                    // Dienstag
  const names = $$('.tr-card__name').map(el => el.textContent);
  assert.deepEqual(names, ['Kraft Beine', 'Fußgymnastik', 'Mobi']);

  click($$('.tr-day')[6]);                    // Sonntag
  assert.equal($('.tr-card__name').textContent, 'Ruhetag');
});

test('Einheitenliste führt alle acht Blätter', () => {
  click($('[data-tab="einheiten"]'));
  assert.equal($$('[data-unit]').length, 8);
});

test('Kraft Beine öffnet sich mit allen Übungen und Sätzen', () => {
  click($('[data-tab="einheiten"]'));
  click($$('[data-unit]').find(el => el.dataset.unit === 'kraft-beine'));
  assert.equal($('.tr-top__title').textContent, 'Kraft Beine');
  assert.equal($$('[data-card]').length, 8);
  /* "Zug eng" hat vier Sätze, also acht Eingabefelder (Gewicht + Wdh.). */
  const card = $$('[data-card]').find(el => el.textContent.includes('Zug eng'));
  assert.equal(card.querySelectorAll('input[data-set]').length, 8);
  assert.ok(card.textContent.includes('TUT: 2010'));
  assert.ok(card.textContent.includes('TW11: 35 · 35 · 37 · 37'));
});

test('Abhaken landet im Protokoll und zieht den Fortschritt nach', () => {
  const done = $$('[data-done]');
  assert.equal($('.tr-top__sub').textContent.includes('0/8'), true);
  click(done[0]);
  assert.equal(done[0].getAttribute('aria-pressed'), 'true');
  assert.equal($('.tr-top__sub').textContent.includes('1/8'), true);

  const logs = JSON.parse(localStorage.getItem('tvza-training-logs-v1-test'));
  const entry = Object.values(logs).find(e => Object.keys(e.items || {}).length);
  assert.ok(entry, 'kein Protokolleintrag geschrieben');
});

test('das Abhaken geht auch an den Sync — als Tagesdokument', () => {
  const calls = globalThis.__training.calls.filter(c => c.type === 'day');
  assert.ok(calls.length, 'nichts an den Sync gegeben');
  const last = calls[calls.length - 1];
  assert.match(last.date, /^\d{4}-\d{2}-\d{2}$/);
  const items = last.units['kraft-beine']?.items || {};
  assert.ok(Object.values(items).some(i => i.done === true));
});

test('Gewichtseingabe wird gespeichert', () => {
  const card = $$('[data-card]').find(el => el.textContent.includes('Zug eng'));
  const input = card.querySelector('input[data-field="weight"]');
  input.value = '42';
  input.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  const logs = JSON.parse(localStorage.getItem('tvza-training-logs-v1-test'));
  const sets = Object.values(logs).flatMap(e => Object.values(e.items || {})).flatMap(i => i.sets || []);
  assert.ok(sets.some(s => s.weight === '42'), 'Gewicht nicht im Protokoll');
});

test('Fokusmodus läuft von Übung zu Übung', () => {
  click($('[data-focus]'));
  assert.equal($('.tr-focus__count').textContent, '2/8');   // die erste ist erledigt
  const name = $('.tr-focus__name').textContent;
  click($('[data-next]'));
  assert.equal($('.tr-focus__count').textContent, '3/8');
  assert.notEqual($('.tr-focus__name').textContent, name);
  click($('[data-prev]'));
  assert.equal($('.tr-focus__count').textContent, '2/8');
});

test('Fußgymnastik zeigt Bilder und Zeitvorgaben statt Sätzen', () => {
  click($('[data-back]'));      // Fokus → Liste
  click($('[data-back]'));      // Liste → Wochenplan
  click($('[data-tab="einheiten"]'));
  click($$('[data-unit]').find(el => el.dataset.unit === 'fussgymnastik'));
  assert.equal($$('[data-card]').length, 9);
  assert.equal($$('[data-card] input[data-set]').length, 0);
  const first = $$('[data-card]')[0];
  assert.ok(first.textContent.includes('Zeit: 30 sec pro Seite'));
  assert.equal(first.querySelector('img').getAttribute('src'),
    '../assets/img/training/fussgymnastik-zehen-spreitzen-1.webp');
});

test('Neuroathletik zeigt Anleitung mit Bild', () => {
  click($('[data-back]'));      // zurück zur Einheitenliste
  click($('[data-tab="einheiten"]'));
  click($$('[data-unit]').find(el => el.dataset.unit === 'neuroathletik'));
  assert.equal($$('[data-card]').length, 9);
  assert.ok($$('[data-card]')[0].textContent.includes('Schienbeinnerv'));
  assert.ok($$('[data-card] img').length >= 9);
});

test('Ausdauer zeigt die Intervallabschnitte', () => {
  click($('[data-back]'));
  click($('[data-tab="einheiten"]'));
  click($$('[data-unit]').find(el => el.dataset.unit === 'ausdauer'));
  assert.equal($$('[data-card]').length, 9);
  assert.ok($$('[data-card]')[0].textContent.includes('20 Minuten einlaufen'));
  assert.ok($$('[data-card]')[0].textContent.includes('Puls: < 139'));
});

test('Importansicht ist erreichbar und nennt die Quelle', () => {
  click($('[data-back]'));
  click($('[data-tab="import"]'));
  assert.ok(doc.getElementById('drop'), 'kein Ablagefeld');
  assert.ok($('.tr-card').textContent.includes('Excel einlesen'));
  assert.ok(doc.getElementById('view').textContent.includes('mitgeliefert'));
});

/* Ein zweites Gerät hakt etwas ab — die Seite muss es übernehmen, ohne
   dass jemand neu lädt. Steht am Ende, weil es den Stand überschreibt. */
test('Änderungen aus der Cloud kommen in der Ansicht an', () => {
  click($('[data-tab="einheiten"]'));
  click($$('[data-unit]').find(el => el.dataset.unit === 'kraft-beine'));
  const day = globalThis.__training.calls.filter(c => c.type === 'day').pop();
  const keys = $$('[data-card]').map(el => el.dataset.card).slice(0, 3);

  globalThis.__training.onLogs({
    [`${day.date}|kraft-beine`]: {
      items: Object.fromEntries(keys.map(key => [key, { done: true, sets: [], note: '' }])),
    },
  });

  assert.equal($$('[data-done][aria-pressed="true"]').length, 3);
  assert.ok($('.tr-top__sub').textContent.includes('3/8'));
});
