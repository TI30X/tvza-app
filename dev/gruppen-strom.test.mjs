/* Die Leiste nach "Neue Gruppe" (v.35.59.0).

   Michel: "wenn du eine neue Gruppe erstellst, wirst du direkt
   reingebracht, aber sie wird nicht direkt in der Leiste aktualisiert".
   Die Mitgliedschaft kam als Meldung, bevor der Server den Stapel
   bestätigt hatte; die Gruppe liess sich in dem Moment nicht lesen und
   fiel aus der Liste. Die Bestätigung danach ist nur eine Änderung der
   Metadaten — die kam ohne includeMetadataChanges nie an. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import { mitgliedschaftenFolgen, VERSUCHE } from '../assets/js/gruppen-strom.js';

const snap = (...gids) => ({
  docs: gids.map(gid => ({ ref: { parent: { parent: { id: gid } } }, data: () => ({ rolle: 'head' }) })),
});

/* Wie zuGruppen in groups.js: eine nicht lesbare Gruppe fehlt, und die
   Liste sagt es. */
function lader(lesbar) {
  const aufrufe = [];
  const laden = async liste => {
    aufrufe.push(liste.map(m => m.gid));
    const gruppen = liste.filter(m => lesbar.has(m.gid)).map(m => ({ id: m.gid }));
    Object.defineProperty(gruppen, 'unvollstaendig', { value: gruppen.length < liste.length });
    return gruppen;
  };
  return { laden, aufrufe };
}

test('die neue Gruppe erscheint, sobald der Server sie bestätigt — auch wenn nur die Metadaten sich ändern', async () => {
  const lesbar = new Set(['alt']);
  const { laden, aufrufe } = lader(lesbar);
  const gemeldet = [];
  const timer = [];
  const folgen = mitgliedschaftenFolgen(laden, g => gemeldet.push(g.map(x => x.id)), { warten: fn => timer.push(fn) });

  await folgen(snap('alt'));
  assert.deepEqual(gemeldet.at(-1), ['alt']);

  // Die neue Mitgliedschaft, noch nicht bestätigt: die Gruppe ist nicht lesbar.
  await folgen(snap('alt', 'neu'));
  assert.deepEqual(gemeldet.at(-1), ['alt'], 'noch ohne die neue');

  // Bestätigt: dieselben Mitgliedschaften, nur die Metadaten sind anders.
  lesbar.add('neu');
  await folgen(snap('alt', 'neu'));
  assert.deepEqual(gemeldet.at(-1), ['alt', 'neu'], 'jetzt steht sie in der Leiste');

  // Danach lädt eine gleiche, vollständige Liste nichts mehr.
  const vorher = aufrufe.length;
  await folgen(snap('alt', 'neu'));
  assert.equal(aufrufe.length, vorher);
});

test('kommt keine Meldung mehr, versucht es der Strom noch ein paar Mal nach der Uhr', async () => {
  const lesbar = new Set();
  const { laden } = lader(lesbar);
  const gemeldet = [];
  const timer = [];
  const folgen = mitgliedschaftenFolgen(laden, g => gemeldet.push(g.map(x => x.id)), { warten: fn => timer.push(fn) });

  await folgen(snap('neu'));
  assert.deepEqual(gemeldet.at(-1), []);
  assert.equal(timer.length, 1, 'ein neuer Versuch ist geplant');
  lesbar.add('neu');
  await timer.shift()();
  assert.deepEqual(gemeldet.at(-1), ['neu']);
  assert.equal(timer.length, 0, 'vollständig: kein weiterer Versuch');
});

test('eine Gruppe, die es nie mehr gibt, wird nicht endlos nachgefragt', async () => {
  const { laden } = lader(new Set());
  const timer = [];
  const folgen = mitgliedschaftenFolgen(laden, () => {}, { warten: fn => timer.push(fn) });
  await folgen(snap('weg'));
  let n = 0;
  while (timer.length && n < 10) { await timer.shift()(); n += 1; }
  assert.equal(n, VERSUCHE, 'höchstens so viele Versuche');
});

test('groups.js hört mit den Metadaten und nimmt den Strom', async () => {
  const q = await readFile(join(root, 'assets/js/groups.js'), 'utf8');
  // v.35.63.0: EIN Zuhörer in der obersten Seite, die Rahmen hängen sich an.
  assert.match(q, /const folgen = mitgliedschaftenFolgen\(zuGruppen, melden\);\s*onSnapshot\(eigeneMitgliedschaften\(uid\), \{ includeMetadataChanges: true \}, folgen,/);
  assert.match(q, /if \(quelle\?\.uid === uid\) \{\s*const weg = quelle\.abonnieren\(cb\);/);
  assert.match(q, /if \(oben === window\) window\.__firnGruppenQuelle = quelle;/, 'nur die oberste Seite legt die Quelle ab');
  assert.match(q, /\(\) => \{ if \(!letzte\) melden\(\[\]\); \}\);/, 'ein Fehler leert eine bekannte Liste nicht');
  // v.35.62.0: und einmal direkt beim Server — ein veralteter Speicher
  // (mehrere Rahmen, ein gemeinsamer Speicher) hielt am Laptop eine Gruppe
  // zurück, die das Handy zeigte.
  assert.match(q, /getDocsFromServer\(eigeneMitgliedschaften\(uid\)\)\.then\(folgen, \(\) => \{\}\);/);
  assert.match(q, /try \{ snap = await getDoc\(gruppeRef\(gid\)\); \}\s*catch \(fehler\) \{\s*try \{ snap = await getDocFromCache\(gruppeRef\(gid\)\); \}/);
  // Keine lesbare Gruppe ist nicht "keine Gruppe".
  const seite = await readFile(join(root, 'assets/js/feature/gruppe/gruppe.js'), 'utf8');
  assert.match(seite, /if \(!liste\.length && liste\.unvollstaendig\) return;/);
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /'\.\/assets\/js\/gruppen-strom\.js'/);
});
