/* Tests für die Firebase-Deploy-Konfiguration.
 *
 * Diese Dateien fehlten bis v.34.2.0 — und das ist der eigentliche
 * Grund, warum die Regeln historisch von Hand in die Konsole kopiert
 * wurden: ohne firebase.json weiss die CLI nicht, welche Datei sie
 * ausrollen soll. Aus diesem Kopieren ist die Drift entstanden, die
 * schon einmal den ganzen maturaProgress-Block aus den Live-Regeln
 * fallen liess (CLAUDE.md, Falle 1).
 *
 * Der Test hält fest, dass der Weg über die CLI benutzbar BLEIBT: ein
 * Pfad, der ins Leere zeigt, macht `firebase deploy` unbrauchbar, und
 * dann fängt das Kopieren wieder an.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const existiert = async name => access(join(root, name)).then(() => true, () => false);

test('firebase.json zeigt auf Dateien, die es wirklich gibt', async () => {
  const cfg = await lies('firebase.json');

  assert.equal(cfg.firestore?.rules, 'firestore.rules');
  assert.equal(cfg.firestore?.indexes, 'firestore.indexes.json');

  assert.ok(await existiert(cfg.firestore.rules), 'die Regeldatei fehlt');
  assert.ok(await existiert(cfg.firestore.indexes), 'die Indexdatei fehlt');
});

test('kein hosting-Block: die App liegt auf GitHub Pages', async () => {
  const cfg = await lies('firebase.json');

  // Ein hosting-Block hier würde bei einem versehentlichen
  // `firebase deploy` ohne --only die Seite nach Firebase schieben und
  // damit neben GitHub Pages eine zweite, stille Kopie erzeugen.
  assert.ok(!('hosting' in cfg), 'hosting gehört nicht in dieses Projekt');
});

test('die Projekt-ID stimmt mit der App überein', async () => {
  const rc = await lies('.firebaserc');
  const config = await readFile(join(root, 'assets/js/firebase-config.js'), 'utf8');

  const inApp = config.match(/projectId:\s*"([^"]+)"/)?.[1];
  assert.ok(inApp, 'projectId in firebase-config.js nicht gefunden');
  assert.equal(rc.projects?.default, inApp,
    'die CLI würde in ein anderes Projekt ausrollen als die App benutzt');
});

test('der Emulator-Port steht an einer Stelle', async () => {
  const [cfg, alt] = await Promise.all([lies('firebase.json'), lies('validation/firebase.json')]);

  // validation/firebase.json gab es vorher schon. Zwei Konfigurationen
  // mit verschiedenen Ports wären genau die Art Dublette, die man erst
  // bemerkt, wenn ein Test gegen den falschen Emulator läuft.
  assert.equal(cfg.emulators?.firestore?.port, alt.emulators?.firestore?.port);
});
