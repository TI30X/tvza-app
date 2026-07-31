import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'index.html',
  'pages/planner.html',
  'pages/bereiche.html',
  'pages/foodtracker.html',
  'pages/messages.html',
  'pages/weather.html',
  'pages/watchlist.html',
  'pages/maturaarbeit-tracker.html',
  'pages/training.html',
];

for (const relative of files) {
  test(`${relative} inline modules parse`, async () => {
    const html = await readFile(join(root, relative), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, `${relative} has no inline module`);
    scripts.forEach((match, index) => {
      new SourceTextModule(match[1], { identifier: `${relative}:${index + 1}` });
    });
  });
}
