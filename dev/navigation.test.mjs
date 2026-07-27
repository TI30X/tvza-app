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

test('current area uses the same active band as Start and settings stay above the page', async () => {
  const [nav, shell, settingsLayer, css, dashboard, areas] = await Promise.all([
    read('assets/js/nav.js'),
    read('assets/js/shell.js'),
    read('assets/js/settings-layer.js'),
    read('assets/css/style.css'),
    read('index.html'),
    read('pages/bereiche.html'),
  ]);

  assert.match(nav, /aria-current="page"/);
  assert.doesNotMatch(nav, /nav__current|>Aktuell</);
  assert.doesNotMatch(shell, /nav__current|>Aktuell</);
  assert.doesNotMatch(css, /content:\s*"Aktueller Bereich"/);
  assert.doesNotMatch(css, /\.nav__bereich\.is-active[^}]*box-shadow/s);
  assert.match(css, /\.appbar--bereich \.back-btn,[\s\S]*#shellBack\s*\{\s*display:\s*none/);
  assert.match(css, /\.appbar \.appbar__inner::before/);
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
  const [nav, router, theme, css, sw] = await Promise.all([
    read('assets/js/nav.js'),
    read('assets/js/router.js'),
    read('assets/js/theme.js'),
    read('assets/css/style.css'),
    read('sw.js'),
  ]);

  assert.match(nav, /link\.rel\s*=\s*'prefetch'/);
  assert.match(nav, /link\.as\s*=\s*'document'/);
  assert.match(nav, /mountAppRouter\(nav\)/);
  assert.match(router, /className = 'tvza-route-frame is-entering'/);
  assert.match(router, /history\.pushState/);
  assert.match(router, /window\.parent\.postMessage\(\{ type:'tvza-route-request'/);
  assert.match(router, /window\.tvzaNavigate = requestRoute/);
  assert.match(router, /type:'tvza-header-action'/);
  assert.match(router, /'foodtracker\.html': \{ targetId:'profileBtn'/);
  assert.match(router, /'watchlist\.html': \{ targetId:'settingsBtn'/);
  assert.match(router, /document\.addEventListener\('click'[\s\S]*\{ capture:true \}\)/);
  assert.match(nav, /refreshAreaNavigation\(profile\)/);
  assert.doesNotMatch(nav, /document\.querySelector\('\.nav'\)\?\.remove\(\)/);
  assert.match(theme, /classList\.add\('tvza-content-frame'\)/);
  assert.match(css, /\.tvza-route-frame\.is-entering/);
  assert.match(css, /html\.tvza-content-frame \.appbar/);
  assert.match(sw, /assets\/js\/router\.js/);
  assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('embedded settings can share Firestore and shared rows keep icon plus person', async () => {
  const [firebase, dashboard, css] = await Promise.all([
    read('assets/js/firebase-config.js'),
    read('index.html'),
    read('assets/css/style.css'),
  ]);

  assert.match(firebase, /persistentMultipleTabManager/);
  assert.doesNotMatch(firebase, /persistentSingleTabManager/);
  assert.match(dashboard, /class="shared-identity"/);
  assert.match(dashboard, /class="row__icon"/);
  assert.match(dashboard, /shared-identity__person/);
  assert.match(css, /\.avatar\.avatar--ink/);
  assert.match(css, /\.shared-identity__person/);
});

test('mobile reminders stay thumb-reachable across routes without exposing the base page', async () => {
  const [shell, router, css] = await Promise.all([
    read('assets/js/shell.js'),
    read('assets/js/router.js'),
    read('assets/css/style.css'),
  ]);

  assert.match(shell, /className = 'global-reminder-fab'/);
  assert.match(shell, /planner\.html\?open=reminder-new/);
  assert.match(shell, /aria-label', 'Erinnerung erstellen'/);
  assert.match(router, /reminderFab\.hidden = fileOf\(target\) === 'planner\.html'/);
  assert.match(router, /--tvza-shell-bottom/);
  assert.match(router, /new ResizeObserver\(syncShellBounds\)/);
  assert.match(css, /\.global-reminder-fab:not\(\[hidden\]\)/);
  assert.match(css, /bottom: var\(--tvza-shell-bottom/);
  assert.match(css, /html\.tvza-content-frame \.global-reminder-fab/);
});

test('loaded content only fades in once instead of blinking after updates', async () => {
  const ui = await read('assets/js/ui-fx.js');
  assert.match(ui, /if \(el\.dataset\.fxRevealed\) return/);
  assert.match(ui, /el\.dataset\.fxRevealed = "1"/);
});

test('splash skip hints are immediate and arranging stays on Start', async () => {
  const [watchlist, weather, welcome, css] = await Promise.all([
    read('pages/watchlist.html'),
    read('pages/weather.html'),
    read('assets/js/welcome.js'),
    read('assets/css/style.css'),
  ]);

  assert.doesNotMatch(watchlist, /class="hint">Tippen zum Überspringen/);
  assert.doesNotMatch(weather, /class="hint">Tippen zum Überspringen/);
  assert.match(watchlist, /class="skip-hint">Tippen zum Überspringen/);
  assert.match(weather, /class="skip-hint">Tippen zum Überspringen/);
  assert.match(watchlist, /#wl-splash \.skip-hint[\s\S]*opacity:1/);
  assert.match(weather, /#wx-splash \.skip-hint[\s\S]*opacity:1/);
  assert.match(welcome, /#tvza-welcome \.tvza-hint[\s\S]*opacity:1/);
  assert.match(css, /body:has\(\.tvza-route-frame\) \.reorder-fab,[\s\S]*\.reorder-hint\s*\{\s*display:\s*none/);
});
