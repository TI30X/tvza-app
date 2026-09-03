import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

// The old class names legacy.css keeps rendering for pages that haven't
// been migrated onto kit.css yet. Every Phase-C commit lowers this count;
// it may never rise. When it reaches 0, delete legacy.css (Phase D) and
// delete this test.
// 'spinner' stand bis v.33.2.0 in dieser Liste, obwohl der Kommentar
// unten es selbst als "current convention, not legacy debt" führte. Es
// war damit die einzige Zeile, die eine NEUE Seite den Zähler heben
// liess, wenn sie alles richtig machte — pages/gruppe.html ist genau
// darüber gestolpert. Ein Mass, das korrektes Verhalten bestraft, misst
// das Falsche; also raus aus der Liste statt die Grenze anheben.
const ALT = ['link-row', 'item-card', 'file-row', 'grp-card', 'pending-card', 'page-title',
             'header-top', 'header-title-block', 'header-stats', 'user-chip', 'wx-chip-mini'];

// Set to the real count on first run (2026-08-27, before any Phase-C page
// migration): index.html 10, public.html 2, pages/bereiche.html 1,
// pages/foodtracker.html 6, pages/guest.html 2, pages/messages.html 3,
// pages/planner.html 24, pages/skitracker.html 5, pages/watchlist.html 5,
// pages/weather.html 1. Total 59.
//
// 2026-08-27, pages/skitracker.html migrated onto the Bausatz: its
// item-card (2) and page-title (1) references are gone — the remaining
// 2 are the .spinner skeleton-loading hooks, which are the current
// convention (see pages/bereiche.html), not legacy debt. New total 56.
//
// 2026-09-03, v.33.2.0: 'spinner' aus ALT entfernt (Begründung oben).
// Die verbleibende echte Altlast verteilt sich auf fünf Dateien:
// index.html 6, pages/foodtracker.html 4, pages/guest.html 1,
// pages/planner.html 19, pages/watchlist.html 3. Neuer Stand 33 — und
// jetzt ist die Zahl auch das, was sie zu sein behauptet.
const MAX_REFERENZEN = 33;

async function countAll() {
  const pagesDir = join(root, 'pages');
  const pageFiles = (await readdir(pagesDir)).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  const files = ['index.html', 'login.html', 'public.html', ...pageFiles];

  let total = 0;
  for (const relative of files) {
    const html = await read(relative);
    for (const name of ALT) {
      const re = new RegExp(`\\b${name.replace(/-/g, '\\-')}\\b`, 'g');
      const matches = html.match(re);
      if (matches) total += matches.length;
    }
  }
  return total;
}

test('legacy class-name references never rise above the recorded count', async () => {
  const total = await countAll();
  assert.ok(
    total <= MAX_REFERENZEN,
    `legacy class-name references rose to ${total}, above the recorded MAX_REFERENZEN of ${MAX_REFERENZEN}`
  );
});
