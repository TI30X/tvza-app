/* Falle 1: eine Datei, die mit ?v= geladen wird, traegt an JEDER Stelle
   dieselbe Zahl — sonst sind es fuer den Browser zwei Dateien, und bei
   Modulen zwei getrennte Zustaende. Bisher prueften Tests das nur fuer
   shell.js und router.js. dev/versionen.mjs zieht die Zahlen samt Kette
   nach; dieser Test prueft die Regel fuer alle Dateien, und dass das
   Werkzeug die Kette findet. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nachziehen, ziel } from './versionen.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('jede Datei mit ?v= traegt ueberall dieselbe Zahl', async () => {
  const dateien = ['sw.js'];
  for (const f of await readdir(root)) if (f.endsWith('.html')) dateien.push(f);
  for (const f of await readdir(join(root, 'pages'))) if (f.endsWith('.html')) dateien.push(`pages/${f}`);
  async function js(v) {
    for (const e of await readdir(join(root, v), { withFileTypes: true })) {
      if (e.isDirectory()) await js(`${v}/${e.name}`);
      else if (e.name.endsWith('.js')) dateien.push(`${v}/${e.name}`);
    }
  }
  await js('assets/js');

  const zahlen = {};
  for (const d of dateien) {
    const text = await readFile(join(root, d), 'utf8');
    for (const m of text.matchAll(/(["'`])((?:\.{1,2}\/)*[\w-][\w./-]*?\.(?:js|css))\?v=(\d+)\1/g)) {
      (zahlen[ziel(d, m[2])] ||= new Set()).add(m[3]);
    }
  }
  const mehrfach = Object.entries(zahlen).filter(([, s]) => s.size > 1).map(([f, s]) => `${f}: ${[...s].join(', ')}`);
  assert.deepEqual(mehrfach, []);
  assert.ok(Object.keys(zahlen).length > 20, 'Muster veraltet? Kaum Verweise gefunden');
});

test('das Werkzeug findet die Kette: shell.js zieht gruppe.js und gruppe.html nach', async () => {
  const aenderungen = await nachziehen(['assets/js/shell.js'], { schreiben: false });
  const wo = von => aenderungen.filter(a => a.von === von).map(a => a.datei);
  assert.ok(wo('assets/js/shell.js').includes('assets/js/feature/gruppe/gruppe.js'));
  assert.ok(wo('assets/js/feature/gruppe/gruppe.js').includes('pages/gruppe.html'), 'das zweite Glied fehlt');
  assert.ok(wo('assets/js/feature/gruppe/gruppe.js').includes('sw.js'), 'der Vorrat des Service Workers fehlt');
  /* Jede Datei wandert genau einmal, auch wenn sie ueber zwei Wege erreicht wird
     (start.js laedt shell.js und nav.js). */
  const start = aenderungen.filter(a => a.von === 'assets/js/feature/start/start.js');
  assert.equal(new Set(start.map(a => a.neu)).size, 1);
});
