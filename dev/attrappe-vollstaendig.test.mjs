/* Die Attrappe muss alles kennen, was die App importiert (v.35.70.0).
 *
 * Gefunden im Rundgang: login.html importierte seit einer Stunde
 * sendPasswordResetEmail aus firebase-auth, und dev/attrappe/
 * firebase-auth.js kannte den Namen nicht. Ein fehlender Export ist
 * kein stiller Fehler, sondern der lauteste, den es gibt — der Browser
 * fuehrt das Modul GAR NICHT aus. Sichtbar war nur: die Anmeldeseite
 * stand im falschen Modus, kein Knopf tat etwas (Falle 14).
 *
 * Der Test liest jede Seite und jedes Modul, sammelt die Namen, die
 * aus dem Firebase-SDK importiert werden, und vergleicht sie mit dem,
 * was die Attrappe anbietet. Er ersetzt keinen Rundgang, aber diesen
 * einen Fehler findet er, bevor jemand klickt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const lies = p => readFile(join(root, p), 'utf8');

/* Welche SDK-Datei auf welche Attrappe zeigt (dev/server.mjs baut die
   Import-Map genauso). */
const ATTRAPPEN = {
  'firebase-app.js': 'dev/attrappe/firebase-app.js',
  'firebase-auth.js': 'dev/attrappe/firebase-auth.js',
  'firebase-firestore.js': 'dev/attrappe/firebase-firestore.js',
  'firebase-app-check.js': 'dev/attrappe/firebase-app-check.js',
};

async function dateien() {
  const raus = [];
  for (const f of await readdir(root)) if (f.endsWith('.html')) raus.push(f);
  for (const f of await readdir(join(root, 'pages'))) if (f.endsWith('.html')) raus.push(`pages/${f}`);
  async function js(verzeichnis) {
    for (const e of await readdir(join(root, verzeichnis), { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${e.name}`;
      if (e.isDirectory()) await js(pfad);
      else if (e.name.endsWith('.js')) raus.push(pfad);
    }
  }
  await js('assets/js');
  return raus;
}

/** Was eine Attrappe nach aussen gibt. */
function exporte(quelle) {
  const namen = new Set();
  for (const m of quelle.matchAll(/export\s+(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/g)) namen.add(m[1]);
  for (const m of quelle.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) namen.add(m[1]);
  for (const m of quelle.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const teil of m[1].split(',')) {
      const name = teil.trim().split(/\s+as\s+/).pop().trim();
      if (name) namen.add(name);
    }
  }
  return namen;
}

test('die Attrappe kennt jeden Namen, den die App aus dem SDK holt', async () => {
  const angeboten = {};
  for (const [sdk, pfad] of Object.entries(ATTRAPPEN)) {
    angeboten[sdk] = exporte(await lies(pfad));
  }

  const fehlt = new Set();
  for (const datei of await dateien()) {
    const text = await lies(datei);
    /* import { a, b as c } from 'https://…/firebase-xyz.js' */
    const muster = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*firebasejs\/[^'"]*\/(firebase-[\w-]+\.js)['"]/g;
    for (const m of text.matchAll(muster)) {
      const sdk = m[2];
      if (!angeboten[sdk]) continue;   // eine Datei, die die Attrappe nicht umlenkt
      for (const teil of m[1].split(',')) {
        const name = teil.trim().split(/\s+as\s+/)[0].trim();
        if (name && !angeboten[sdk].has(name)) fehlt.add(`${datei}: ${name} aus ${sdk}`);
      }
    }
  }

  assert.deepEqual([...fehlt], [],
    'die Attrappe kennt diese Namen nicht — im Attrappen-Modus bricht das ganze Modul');
});
