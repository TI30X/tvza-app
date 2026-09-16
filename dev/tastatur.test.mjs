/* Die Bildschirmtastatur am Handy (v.35.69.0).

   Michel, mit einem Bild aus Samsung Internet: "auf dem Handy verschwindet
   die Textbox, wenn man die Tastatur ausfährt." v.35.62.0 löste das für
   den Chat im Rahmen des Routers — aber der Beobachter stand in nav.js,
   und Gruppe, Training, Einheit und Video laden nav.js nicht. Jetzt misst
   jede Seite selbst (tastatur.js), und was unten klebt, rechnet mit. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './gruppe-harness.mjs';
import { schreibfeld, tastaturBeobachten } from '../assets/js/tastatur.js';

const read = p => readFile(join(root, p), 'utf8');

test('ein Schreibfeld erkennt man am Feld, nicht an der Höhe des Fensters', () => {
  const dom = new JSDOM('<textarea id="t"></textarea><input id="text"><input id="haken" type="checkbox"><button id="b"></button>');
  const d = dom.window.document;
  assert.equal(schreibfeld(d.getElementById('t')), true);
  assert.equal(schreibfeld(d.getElementById('text')), true);
  assert.equal(schreibfeld(d.getElementById('haken')), false, 'ein Häkchen ruft keine Tastatur');
  assert.equal(schreibfeld(d.getElementById('b')), false);
  assert.equal(schreibfeld(null), false);
});

test('die Überdeckung steht an <html> — und ist wieder weg, sobald die Tastatur zu ist', () => {
  const dom = new JSDOM('<body><textarea id="t"></textarea></body>', { pretendToBeVisual: true });
  const win = dom.window;
  /* Ein Handy, das die Seite NICHT verkleinert (iPhone, Samsung Internet
     ohne interactive-widget): das Layout bleibt 800, sichtbar sind 500. */
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
  const hoerer = {};
  win.visualViewport = {
    height: 500, offsetTop: 0, scale: 1,
    addEventListener: (art, fn) => { hoerer[art] = fn; },
  };
  const sync = tastaturBeobachten(win);
  const stil = () => win.document.documentElement.style.getPropertyValue('--tastatur');
  assert.equal(stil(), '0px', 'ohne Fokus keine Tastatur');

  win.document.getElementById('t').focus();
  sync();
  assert.equal(stil(), '300px', 'die Tastatur deckt 300 Pixel zu');
  assert.equal(win.document.body.classList.contains('kb-open'), true);
  assert.equal(win.document.documentElement.style.getPropertyValue('--vv-hoehe'), '500px');

  /* Gezoomt ist der Ausschnitt ebenfalls kleiner — das ist keine Tastatur. */
  win.visualViewport.scale = 2;
  sync();
  assert.equal(stil(), '0px', 'Zoomen wurde als Tastatur gelesen');
  win.visualViewport.scale = 1;

  win.document.getElementById('t').blur();
  sync();
  assert.equal(stil(), '0px');
  assert.equal(win.document.body.classList.contains('kb-open'), false);
  /* Zweimal beobachtet wird nicht zweimal gemessen. */
  assert.equal(tastaturBeobachten(win), undefined);
});

test('jede Seite misst: die Hülle und nav.js hängen denselben Beobachter ein', async () => {
  const [shell, nav, kit, einheit] = await Promise.all([
    read('assets/js/shell.js'), read('assets/js/nav.js'),
    read('assets/css/kit.css'), read('assets/css/feature/einheit.css'),
  ]);
  assert.match(shell, /import \{ tastaturBeobachten \} from '\.\/tastatur\.js';/);
  assert.match(shell, /offenesNachtragen\(\);\s*tastaturBeobachten\(\);/);
  assert.match(nav, /import \{ tastaturBeobachten \} from '\.\/tastatur\.js';/);
  assert.doesNotMatch(nav, /function watchKeyboard/, 'der zweite Beobachter ist weg');

  /* Was unten klebt, steht über der Tastatur. */
  assert.match(kit, /bottom: max\(var\(--tvza-shell-bottom, calc\(var\(--nav-hoehe\) \+ env\(safe-area-inset-bottom\)\)\), var\(--tastatur, 0px\)\);/);
  assert.match(kit, /margin-bottom: var\(--tastatur, 0px\);/, 'der Dialog von unten');
  assert.match(kit, /body\.dm-thread\.kb-open \.app \{\s*height: calc\(var\(--vv-hoehe, 100dvh\) - var\(--tastatur, 0px\)\);/);
  assert.match(kit, /\.ki-verlauf \{\s*overscroll-behavior: contain;/, 'kein doppeltes Scrollen');
  assert.match(einheit, /body\.kb-open \.rueckgaengig \{ bottom: calc\(var\(--tastatur, 0px\) \+ var\(--s3\)\); \}/);

  const sw = await read('sw.js');
  assert.match(sw, /'\.\/assets\/js\/tastatur\.js'/);
});
