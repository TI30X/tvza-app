import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

test('areas page and sidebar share one module ordering source', async () => {
  const [shell, areas] = await Promise.all([
    read('assets/js/shell.js'),
    read('pages/bereiche.html'),
  ]);

  assert.match(shell, /export function areaModuleKeys\(profile\)/);
  assert.match(areas, /areaModuleKeys\(profile\)/);
  assert.doesNotMatch(areas, /quick_access_order/);
});

test('desktop hides the redundant areas tab while mobile keeps its nav marker', async () => {
  const [css, nav, shell] = await Promise.all([
    read('assets/css/style.css'),
    read('assets/js/nav.js'),
    read('assets/js/shell.js'),
  ]);

  assert.match(css, /@media \(min-width: 900px\)[\s\S]*\.nav__item\[data-nav-tab="bereiche"\]\s*\{\s*display:\s*none/);
  assert.match(nav, /data-nav-tab="\$\{t\.id\}"/);
  assert.match(shell, /data-nav-tab="\$\{t\.id\}"/);
});
