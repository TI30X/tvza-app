import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Liest index.html samt ihren Modulen — der Code der Startseite
   liegt seit v.35.11.0 in assets/js/feature/start/. */
const read = leserMitStart(root);

const pages = [
  'pages/maturaarbeit.html',
  'pages/maturaarbeit-tracker.html',
];

test('both Maturaarbeit pages use the shared, contrast-safe surface', async () => {
  const [overview, tracker, css] = await Promise.all([
    read(pages[0]),
    read(pages[1]),
    read('assets/css/feature/matura.css'),
  ]);

  for (const html of [overview, tracker]) {
    assert.match(html, /assets\/css\/feature\/matura\.css/);
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

/* Bis v.35.33.0: "classic Maturaarbeit scripts parse" — der Code stand als
   klassisches Inline-Skript in den Seiten. Seit v.35.34.0 liegen die
   Seiten auf der Seiten-Invariante; geprueft wird jetzt, dass die Module
   als Module parsen und dass in den Seiten KEIN Code mehr steht. */
test('die Matura-Seiten tragen keinen Code, ihre Module parsen', async () => {
  const module = [
    'assets/js/feature/matura/uebersicht-ansicht.js',
    'assets/js/feature/matura/uebersicht.js',
    'assets/js/feature/matura/tracker-ansicht.js',
    'assets/js/feature/matura/tracker.js',
  ];
  for (const relative of module) {
    new SourceTextModule(await readFile(join(root, relative), 'utf8'), { identifier: relative });
  }
  for (const relative of pages) {
    const html = await readFile(join(root, relative), 'utf8');
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(match => !/\bsrc\s*=/.test(match[1]));
    assert.deepEqual(inline.map(m => m[2].trim().slice(0, 40)), [], `${relative} traegt wieder Inline-Code`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${relative} hat wieder einen Inline-Handler`);
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

test('Maturaarbeit progress migrates safely and syncs per user', async () => {
  const [overview, tracker, sync, rules] = await Promise.all([
    read(pages[0]),
    read(pages[1]),
    read('assets/js/matura-sync.js'),
    read('firestore.rules'),
  ]);

  for (const html of [overview, tracker]) {
    assert.match(html, /connectMaturaProgress/);
    assert.match(html, /cloudStateWriter/);
  }
  assert.match(overview, /`matura_v3_\$\{uid\}`/);
  assert.match(overview, /legacyOwner===uid/);
  assert.match(tracker, /'matura_tracker_' \+ uid/);
  assert.match(sync, /localValue === true \|\| cloudValue === true/);
  assert.match(sync, /if \(localDone <= cloudDone\) \{[\s\S]*return merged/);
  assert.match(sync, /localStorage\.getItem\(migrationKey\) === '1'/);
  assert.match(sync, /\[`state\.\$\{changedKey\}`\]/);
  assert.match(sync, /reportClientError\('matura-sync-save'/);
  assert.match(rules, /match \/users\/\{uid\}\/maturaProgress\/\{progressId\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
});

test('all production add actions use the same two-pixel plus', async () => {
  const [style, calendar, index, food, ski, watch, planner] = await Promise.all([
    read('assets/css/kit.css'),
    /* Seit v.35.49.0 stehen die Knöpfe des Kalenders in planner.css. */
    read('assets/css/feature/planner.css'),
    read('index.html'),
    /* Seit v.35.72.0 baut das geteilte Bedienelement die Zutatenzeilen
       des Food Trackers — samt seinem Plus (feature/essen/erfassung.js).
       Die Seite selbst hat darum keines mehr. */
    read('assets/js/feature/essen/erfassung.js'),
    read('pages/skitracker.html'),
    read('pages/watchlist.html'),
    read('pages/planner.html'),
  ]);

  // .ui-plus (kit.css) and .calendar-action-icon (feature/planner.css)
  // used to share one fused CSS rule; Phase A split them into two files
  // with duplicated declarations, so each is checked in its own file now.
  assert.match(style, /\.ui-plus \{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
  assert.match(style, /width:\s*75%;[\s\S]*height:\s*12\.5%;/);
  assert.match(calendar, /\.calendar-action-icon \{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
  assert.doesNotMatch(calendar, /height:\s*1\.8px/);

  for (const html of [index, food, ski, watch]) {
    assert.match(html, /class="ui-plus"/);
  }
  const plannerIcons = [...planner.matchAll(/class="([^"]*calendar-action-icon[^"]*)"/g)];
  /* Erstellen (Laptop), der runde Knopf (Handy), neue Erinnerung. */
  assert.ok(plannerIcons.length >= 3);
  plannerIcons.forEach(match => assert.match(match[1], /\bui-plus\b/));
});
