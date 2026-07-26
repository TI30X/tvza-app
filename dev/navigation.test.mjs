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

test('current area is explicit and settings stay above the active page', async () => {
  const [nav, shell, settingsLayer, css, dashboard, areas] = await Promise.all([
    read('assets/js/nav.js'),
    read('assets/js/shell.js'),
    read('assets/js/settings-layer.js'),
    read('assets/css/style.css'),
    read('index.html'),
    read('pages/bereiche.html'),
  ]);

  assert.match(nav, /nav__current">Aktuell/);
  assert.match(nav, /aria-current="page"/);
  assert.match(shell, /nav__current">Aktuell/);
  assert.match(css, /\.nav__bereich\.is-active[^}]*box-shadow/s);
  assert.match(settingsLayer, /index\.html\?embed=settings#settings/);
  assert.match(settingsLayer, /tvza-settings-close/);
  assert.doesNotMatch(nav, /location\.href\s*=\s*base\(\)\s*\+\s*'index\.html#settings'/);
  assert.match(dashboard, /classList\.add\('settings-embed'\)/);
  assert.match(dashboard, /function personAvatarStyle\(identity\)/);
  assert.match(dashboard, /personAvatarStyle\(s\.targetUid\|\|s\.targetEmail\)/);
  assert.match(dashboard, /personAvatarStyle\(invite\.email\)/);
  assert.match(areas, /onSettings:\s*openSettingsLayer/);
  assert.match(areas, /manageBtn'\)\.onclick\s*=\s*openSettingsLayer/);
});

test('app destinations are prefetched and use a progressive page transition', async () => {
  const [nav, css] = await Promise.all([
    read('assets/js/nav.js'),
    read('assets/css/style.css'),
  ]);

  assert.match(nav, /link\.rel\s*=\s*'prefetch'/);
  assert.match(nav, /link\.as\s*=\s*'document'/);
  assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
