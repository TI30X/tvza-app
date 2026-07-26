import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

const pages = [
  'pages/maturaarbeit.html',
  'pages/maturaarbeit-tracker.html',
];

test('both Maturaarbeit pages use the shared, contrast-safe surface', async () => {
  const [overview, tracker, css] = await Promise.all([
    read(pages[0]),
    read(pages[1]),
    read('assets/css/matura.css'),
  ]);

  for (const html of [overview, tracker]) {
    assert.match(html, /assets\/css\/matura\.css/);
    assert.match(html, /class="matura-page [^"]+"/);
    assert.match(html, /class="matura-hero/);
    assert.match(html, /class="matura-section-card"/);
  }

  assert.match(css, /color:\s*var\(--ink\)/);
  assert.match(css, /background:\s*var\(--surface\)/);
  assert.match(css, /background:\s*var\(--matura-deep\)/);
  assert.match(css, /:root\[data-theme="dark"\]\s+body\.matura-page/);
  assert.match(css, /@media \(max-width:\s*899px\)/);
  const shadows = [...css.matchAll(/box-shadow:\s*([^;]+);/g)].map(match => match[1].trim());
  assert.ok(shadows.every(value => value === 'none'));
});

test('the detailed tracker derives the active phase from the current date', async () => {
  const overview = await read(pages[0]);
  assert.match(overview, /const currentPhase=phases\.find\(p=>p\.phaseEnd>=TODAY\)/);
  assert.doesNotMatch(overview, /isCurrent:\s*true/);
  assert.doesNotMatch(overview, /Du bist hier\s*[–-]\s*KW 21/);
});

test('classic Maturaarbeit scripts parse', async () => {
  for (const relative of pages) {
    const html = await read(relative);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(match => !/\bsrc\s*=/.test(match[1]) && !/\btype=["']module["']/.test(match[1]));
    assert.ok(scripts.length > 0, `${relative} has no classic inline script`);
    scripts.forEach((match, index) => {
      new Script(match[2], { filename: `${relative}:${index + 1}` });
    });
  }
});

test('Maturaarbeit pages do not expose raw backend or storage errors', async () => {
  const html = (await Promise.all(pages.map(read))).join('\n');
  const visibleRawError = /(?:alert\s*\(|textContent\s*=|innerHTML\s*=)[^\n]*(?:error|err|e)\.(?:message|code)/i;
  const rawConsoleError = /console\.(?:warn|error)\(\s*(?:error|err|e)\s*\)/i;
  assert.doesNotMatch(html, visibleRawError);
  assert.doesNotMatch(html, rawConsoleError);
  assert.match(html, /\[matura-tracker-storage\] invalid-local-state/);
});

test('all production add actions use the same two-pixel plus', async () => {
  const [style, calendar, index, food, ski, watch, planner] = await Promise.all([
    read('assets/css/style.css'),
    read('assets/css/calendar.css'),
    read('index.html'),
    read('pages/foodtracker.html'),
    read('pages/skitracker.html'),
    read('pages/watchlist.html'),
    read('pages/planner.html'),
  ]);

  assert.match(style, /\.ui-plus,[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
  assert.match(style, /width:\s*75%;[\s\S]*height:\s*12\.5%;/);
  assert.doesNotMatch(calendar, /height:\s*1\.8px/);

  for (const html of [index, food, ski, watch]) {
    assert.match(html, /class="ui-plus"/);
  }
  const plannerIcons = [...planner.matchAll(/class="([^"]*calendar-action-icon[^"]*)"/g)];
  assert.ok(plannerIcons.length >= 7);
  plannerIcons.forEach(match => assert.match(match[1], /\bui-plus\b/));
});
