/* Der Rueckfall von t(), wenn i18n.js (noch) nicht da ist.

   Fuenf Module tragen dieselbe Zeile:

     const t = (key, fallback, vars) => window.TVZAI18n?.tOr(…) ?? fallback;

   Bis v.35.25.0 setzte der Rueckfall keine Platzhalter ein. Aus "Die
   Datei liess sich nicht lesen. {grund}" wurde dann nicht der Grund,
   sondern das Wort {grund} selbst. Beim Reparieren hat die Shell die
   Backslashes aus dem regulaeren Ausdruck gefressen — /{(w+)}/ statt
   /\{(\w+)\}/, das nur ein woertliches "w" findet. Darum wird die Zeile
   hier AUSGEFUEHRT, nicht gelesen. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = [
  'assets/js/dialog.js',
  'assets/js/feature/einheit/einheit.js',
  'assets/js/feature/gruppe/gruppe.js',
  'assets/js/feature/start/start.js',
  'assets/js/feature/video/video.js',
];

for (const pfad of MODULE) {
  test(`${pfad}: der Rueckfall setzt Platzhalter ein`, async () => {
    const q = await readFile(join(root, pfad), 'utf8');
    const zeile = q.match(/const t = \(key, fallback, vars\) => [\s\S]*?;\n/)?.[0];
    assert.ok(zeile, 'der t()-Helfer fehlt');
    const t = vm.runInNewContext(`${zeile.replace('const t =', 'globalThis.t =')} t`, { window: {} });
    assert.equal(t('x', 'Die Datei. {grund}', { grund: 'Kein Blatt.' }), 'Die Datei. Kein Blatt.');
    assert.equal(t('x', 'Nur {wer}', { wer: 'Timo' }), 'Nur Timo');
    /* Was nicht uebergeben wurde, bleibt stehen — lieber sichtbar als
       ein leerer Satz. */
    assert.equal(t('x', 'Ohne {was}'), 'Ohne {was}');
    assert.equal(t('x', 'Kein Platzhalter'), 'Kein Platzhalter');
  });
}
