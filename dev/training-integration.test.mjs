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

test('alle drei Kopien der Bereich-Zuordnung kennen training', async () => {
  const files = ['assets/js/nav.js', 'assets/js/shell.js', 'index.html'];
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

test('Service Worker legt Seite, Baustein und Parser in den Shell-Cache', async () => {
  const [sw, seite] = await Promise.all([read('sw.js'), read('pages/training.html')]);
  /* Die Fassung, die die Seite laedt — nicht eine hier festgeschriebene
     Zahl. Bis v.35.31.0 stand hier ?v=1 woertlich; jeder Bump brach den
     Test, ohne dass etwas falsch war. */
  const modul = seite.match(/feature\/training\/training\.js\?v=\d+/)?.[0];
  assert.ok(modul, 'training.html laedt kein versioniertes Modul');
  ['./pages/training.html',
   `./assets/js/${modul}`,
   './assets/js/feature/woche/woche.js',
   './assets/css/feature/woche.css?v=1',
   './assets/js/training-parser.js',
   './assets/data/training/images.json'].forEach(entry => {
    assert.ok(sw.includes(`'${entry}'`), `sw.js ohne ${entry}`);
  });
  /* Die alte Seite hatte ihren eigenen Speicher und ein mitgeliefertes
     Programm. Beides gibt es nicht mehr — und was nicht mehr existiert,
     darf der Service Worker nicht vorladen wollen. */
  for (const weg of ['training-sync.js', 'kw31-2026.json']) {
    assert.ok(!sw.includes(weg), `sw.js laedt noch ${weg}`);
  }
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

test('die Seite haelt die Seiten-Invariante und laedt theme.js', async () => {
  const page = await read('pages/training.html');
  assert.match(page, /<script src="\.\.\/assets\/js\/theme\.js"><\/script>/);
  /* Die alte Seite trug 900 Zeilen in einem Inline-Modul und einen
     eigenen Style-Block. */
  assert.doesNotMatch(page, /<style/);
  assert.doesNotMatch(page, /<script type="module">/);
  assert.equal((page.match(/<script type="module" src=/g) || []).length, 1);
  assert.match(page, /feature\/training\/training\.js\?v=\d+/);
});

test('der Bereich Training liest die Plaene der Gruppen, keinen eigenen Speicher', async () => {
  const js = await read('assets/js/feature/training/training.js');
  /* Dieselbe Woche, derselbe Baustein, derselbe Player wie die Gruppe.
     Die alte Seite hatte ihren eigenen Import und schrieb nach
     users/{uid}/trainingLogs — was ein Athlet dort abhakte, sah sein
     Trainer nie. */
  assert.match(js, /from '\.\.\/\.\.\/groups\.js'/);
  assert.match(js, /ladePlaene\(/);
  assert.match(js, /wochenAnsicht\(\{[\s\S]*zurueck: 'training'/);
  assert.doesNotMatch(js, /trainingLogs|trainingPrograms|training-sync/);
  /* Eingelesen wird in der Gruppe, nicht hier. */
  assert.doesNotMatch(js, /gridFromFile|training-import/);
  /* Die Leitung liest ungefiltert; hier zaehlt nur, was fuer einen
     selbst bestimmt ist. */
  assert.match(js, /plan\.fuer === PLAN_FUER_ALLE \|\| plan\.fuer === user\.uid/);
});

test('die alten Speicherorte bleiben lesbar, auch wenn niemand mehr hineinschreibt', async () => {
  /* Wer auf der alten Seite trainiert hat, verliert nichts: die Regeln
     fuer users/{uid}/trainingPrograms und trainingLogs bleiben, und die
     Gruppe bietet frueher Eingelesenes weiter zur Auswahl an. */
  const rules = await read('firestore.rules');
  assert.ok(rules.includes('/users/{uid}/trainingPrograms/{programId}'));
  assert.ok(rules.includes('/users/{uid}/trainingLogs/{trainingDate}'));
  assert.match(await read('assets/js/groups.js'), /export async function eigeneProgramme\(uid\)/);
});
