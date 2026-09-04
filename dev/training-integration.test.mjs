/* Der Trainingsbereich ist an neun Stellen registriert — Modulliste,
   vier Kopien der Bereich-Farbzuordnung, Icon, Router, Service Worker,
   Dashboard. Genau diese Kopien sind in diesem Projekt schon einmal
   auseinandergelaufen (siehe firestore.rules), deshalb prüft dieser Test
   sie gemeinsam statt sie einzeln zu glauben.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Liest index.html samt ihren Modulen — der Code der Startseite
   liegt seit v.35.11.0 in assets/js/feature/start/. */
const read = leserMitStart(root);

test('Modul ist in firebase-config eingetragen und standardmässig gesperrt', async () => {
  const config = await read('assets/js/firebase-config.js');
  assert.match(config, /training: \{ key:'training'.*page:'pages\/training\.html'/);
  assert.match(config, /training: \{[^}]*perUser:true/);
  /* Wie Ski und Maturaarbeit: erst nach Freigabe durch den Admin. */
  assert.match(config, /DEFAULT_MODULES = \{[^}]*training:false/);
  assert.match(config, /DEFAULT_VISIBLE_MODULES = \{[\s\S]*?training:false/);
});

test('alle vier Kopien der Bereich-Zuordnung kennen training', async () => {
  const files = ['assets/js/nav.js', 'assets/js/shell.js', 'assets/js/feature/bereiche/bereiche.js', 'index.html'];
  for (const file of files) {
    assert.match(await read(file), /training: 'training'/, `${file} ohne Bereich-Zuordnung`);
  }
});

test('Icon und Farbton existieren', async () => {
  assert.match(await read('assets/js/shell.js'), /^\s*training: '<path/m);
  const css = await read('assets/css/kit.css');
  assert.match(css, /\[data-bereich="training"\]/);
  assert.match(css, /--tint-training:/);
  assert.match(css, /--training-deep:/);
  /* Der Ton muss in beiden Modi gesetzt sein, sonst wird die Kachel im
     Dark Mode unlesbar. */
  assert.equal((css.match(/--tint-training:/g) || []).length, 2);
});

test('Router kennt die Seite als App-Seite mit Titel', async () => {
  const router = await read('assets/js/router.js');
  assert.match(router, /APP_FILES = new Set\(\[[\s\S]*'training\.html',[\s\S]*\]\)/);
  assert.match(router, /'training\.html':'Training'/);
});

test('Service Worker legt Seite und Programmdaten in den Shell-Cache', async () => {
  const sw = await read('sw.js');
  ['./pages/training.html',
   './assets/js/training-parser.js',
   './assets/js/training-sync.js',
   './assets/data/training/kw31-2026.json',
   './assets/data/training/images.json'].forEach(entry => {
    assert.ok(sw.includes(`'${entry}'`), `sw.js ohne ${entry}`);
  });
});

test('Dashboard hat eine Kachel, die am Modul hängt', async () => {
  const html = await read('index.html');
  assert.match(html, /data-tracker-tile="training"/);
  assert.match(html, /href="pages\/training\.html"/);
  assert.match(html, /trackerTileDefaults = \[[^\]]*'training'\]/);
  assert.match(html, /setTrackerTile\('training', mods\.training\)/);
  /* Ohne diese Ergänzung bliebe der Bereichskopf verborgen, wenn Training
     das einzige freigeschaltete Modul ist. */
  assert.match(html, /const anyTracker = [^;]*mods\.training/);
});

test('die Seite lädt theme.js, damit sie den Rahmen erkennt', async () => {
  const page = await read('pages/training.html');
  assert.match(page, /<script src="\.\.\/assets\/js\/theme\.js"><\/script>/);
  assert.match(page, /html\.tvza-content-frame \.tr-top__title \{ display: none; \}/);
});

test('Sync schreibt nur, was die Regeln erlauben', async () => {
  const sync = await read('assets/js/training-sync.js');
  /* Programm als Zeichenkette — Firestore kann keine Arrays in Arrays,
     und unit.raw.rows ist genau das. */
  assert.match(sync, /json: JSON\.stringify|const json = JSON\.stringify\(program\)/);
  assert.match(sync, /MAX_PROGRAM_BYTES = 900000/);
  assert.match(sync, /schema: SYNC_SCHEMA/);
  /* Ein Dokument je Tag statt eines je Übung: der Spark-Tarif zählt
     jeden Schreibvorgang. */
  assert.match(sync, /doc\(logs, date\)/);
});

test('Seite und Sync sind sich über den Speicherort einig', async () => {
  const page = await read('pages/training.html');
  const sync = await read('assets/js/training-sync.js');
  assert.match(sync, /'users', user\.uid, 'trainingPrograms'/);
  assert.match(sync, /'users', user\.uid, 'trainingLogs'/);
  const rules = await read('firestore.rules');
  assert.ok(rules.includes('/users/{uid}/trainingPrograms/{programId}'));
  assert.ok(rules.includes('/users/{uid}/trainingLogs/{trainingDate}'));
  /* Der Sync darf die Seite nicht blockieren: erst zeichnen, dann laden. */
  assert.ok(page.indexOf('render();') < page.indexOf("import('../assets/js/training-sync.js')"));
});
