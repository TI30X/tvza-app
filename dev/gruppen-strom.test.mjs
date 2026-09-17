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
import { mitgliedschaftenFolgen, VERSUCHE, NOCHMAL_MS, SPAETER_MS } from '../assets/js/gruppen-strom.js';

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

test('was fehlt, wird weiter gefragt — erst schnell, dann selten (v.35.70.5)', async () => {
  /* Michel: "auf dem PC habe ich 3 Gruppen und nur eine ist auf dem
     Handy … und auf dem Handy 2, davon eine auf dem PC." Bis v.35.70.4
     hörte der Strom nach VERSUCHE Anläufen auf — rund vier Sekunden
     nach dem Start. Wer in diesem Moment kein Netz hatte, behielt die
     halbe Liste für die ganze Sitzung, auf jedem Gerät eine andere.
     Aufgeben gibt es nicht mehr; nur der Abstand wächst. */
  const lesbar = new Set();
  const { laden } = lader(lesbar);
  const abstaende = [];
  const timer = [];
  const folgen = mitgliedschaftenFolgen(laden, () => {},
    { warten: (fn, ms) => { abstaende.push(ms); timer.push(fn); } });

  await folgen(snap('fehlt'));
  for (let i = 0; i < 6 && timer.length; i += 1) await timer.shift()();

  assert.ok(abstaende.length > VERSUCHE, 'nach den schnellen Versuchen ist Schluss — das war der Fehler');
  assert.deepEqual(abstaende.slice(0, VERSUCHE), [NOCHMAL_MS, NOCHMAL_MS * 2, NOCHMAL_MS * 3],
    'die ersten Versuche kommen schnell');
  assert.ok(abstaende.slice(VERSUCHE).every(ms => ms === SPAETER_MS),
    'danach selten, aber weiter');

  /* Sobald die Gruppe lesbar ist, hört es auf. */
  lesbar.add('fehlt');
  const offen = timer.length;
  await timer.shift()();
  assert.equal(timer.length, offen - 1, 'vollständig: kein neuer Versuch');
});

test('von aussen anstossen: das Netz ist zurück, die App ist wieder da', async () => {
  /* Ohne das wartet ein Handy, das beim Start kein Netz hatte, bis zu
     SPAETER_MS — und zeigt so lange die halbe Liste. */
  const lesbar = new Set();
  const { laden } = lader(lesbar);
  const gemeldet = [];
  const folgen = mitgliedschaftenFolgen(laden, g => gemeldet.push(g.map(x => x.id)), { warten: () => {} });

  await folgen(snap('a', 'b'));
  assert.deepEqual(gemeldet.at(-1), [], 'nichts lesbar');

  lesbar.add('a'); lesbar.add('b');
  assert.equal(folgen.nochmal(), true, 'ein Anstoss von aussen wird angenommen');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(gemeldet.at(-1), ['a', 'b'], 'nach dem Anstoss ist die Liste vollständig');

  assert.equal(folgen.nochmal(), false, 'ist nichts offen, kostet der Anstoss keinen Lesezugriff');
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
  /* Seit v.35.70.7 meldet dieselbe Abfrage auch, ob der Server antwortet
     (firn-server-da / firn-server-fern) — der Banner sagt sonst "online",
     während alles aus dem Speicher kommt. */
  assert.match(q, /getDocsFromServer\(eigeneMitgliedschaften\(uid\)\)\s*\.then\(s => \{ serverMelden\(true\); return folgen\(s\); \}, \(\) => serverMelden\(false\)\);/);
  assert.ok(q.includes("'firn-server-fern'") && q.includes("'firn-server-da'"), 'niemand erfährt, dass der Server nicht antwortet');
  /* v.35.70.5: fehlt etwas, wird nachgefragt, sobald es wieder gehen
     könnte — sonst bleibt die halbe Liste die ganze Sitzung stehen. */
  for (const ereignis of ["'online'", "'focus'", "'visibilitychange'"]) {
    assert.ok(q.includes(ereignis), `kein Weg zurück ins Netz: ${ereignis} fehlt`);
  }
  assert.match(q, /folgen\.nochmal\(\);/, 'der Anstoss von aussen wird nicht benutzt');
  assert.match(q, /if \(jetzt - zuletztGefragt < 20000\) return;/, 'ohne Bremse fragt jeder Fokus neu');
  /* "Gibt es nicht" gilt nur vom Server: eine Antwort ohne Herkunft
     (metadata fehlt) ist keine Auskunft. */
  assert.match(q, /if \(!snap\.exists\(\) && snap\.metadata\?\.fromCache !== false\)/,
    'eine Gruppe gilt wieder als gelöscht, ohne dass der Server es sagt');
  assert.match(q, /try \{ snap = await getDoc\(gruppeRef\(gid\)\); \}\s*catch \(fehler\) \{\s*try \{ snap = await getDocFromCache\(gruppeRef\(gid\)\); \}/);
  // Keine lesbare Gruppe ist nicht "keine Gruppe".
  const seite = await readFile(join(root, 'assets/js/feature/gruppe/gruppe.js'), 'utf8');
  assert.match(seite, /if \(!liste\.length && liste\.unvollstaendig\) return;/);
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /'\.\/assets\/js\/gruppen-strom\.js'/);
});
