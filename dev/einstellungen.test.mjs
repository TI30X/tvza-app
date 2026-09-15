/* Die Einstellungen (v.35.58.0).

   Michel: "Einstellungen können noch überarbeitet werden — das ist ja wohl
   nicht dein Bestes". Auf seinem Bildschirm: über den Einstellungen stand
   "FIRN", obwohl er im TVZA-Kreis ist; jede Zeile war eine Karte in der
   Karte; der Hinweis zur Sprache stand in Textgrösse (.form-hint hatte gar
   keine Regel); die Sprachwahl trug einen eigenen style="" und ragte am
   Handy hinaus; das Erscheinungsbild war ein Symbol (◐), das man
   durchtippen musste. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');
const dialog = async () => {
  const html = await read('index.html');
  const von = html.indexOf('<div class="modal-backdrop" id="settingsModal">');
  return html.slice(von, html.indexOf('<div id="adminSection"', von));
};

test('über den Einstellungen steht keine Marke — sie hängt an der Person, nicht am Dialog', async () => {
  const d = await dialog();
  assert.doesNotMatch(d, /modal-kicker/);
  assert.doesNotMatch(d, />\s*(Firn|TVZA)\s*</, 'kein fest geschriebenes Zeichen');
});

test('das Erscheinungsbild sind drei Knöpfe, die sagen, was sie tun', async () => {
  const d = await dialog();
  assert.doesNotMatch(d, /◐/);
  const modi = [...d.matchAll(/data-mode="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(modi, ['auto', 'light', 'dark']);
  assert.match(d, /id="themeWahl" role="group"/);
  const start = await read('assets/js/feature/start/start.js');
  assert.match(start, /localStorage\.setItem\('tvza-theme', knopf\.dataset\.mode\)/, 'derselbe Schlüssel wie theme.js');
  assert.match(start, /window\.TVZATheme\.applyTheme\(knopf\.dataset\.mode\)/);
  assert.match(await read('assets/js/theme.js'), /const KEY = 'tvza-theme'/);
});

test('keine Zeile ist eine Karte in der Karte, der Hinweis ist leise', async () => {
  const d = await dialog();
  assert.doesNotMatch(d, /style="/, 'die Sprachwahl bekam ihre Breite inline');
  const kit = await read('assets/css/kit.css');
  assert.match(kit, /#settingsModal \.settings-row \{\s*min-height: 52px;\s*padding: var\(--s3\) 0;\s*background: none;\s*border: 0;/);
  assert.match(kit, /#settingsModal #moduleToggles \{ display: flex; flex-direction: column; gap: 0; \}/, 'eine Spalte');
  assert.match(kit, /#settingsModal #moduleToggles \.row--check \{[^}]*background: none;[^}]*border: 0;/);
  assert.match(kit, /\n\.form-hint \{[^}]*font-size: 12\.5px;/, '.form-hint hat eine Regel');
});
