/* Gruppen: eigene Reihenfolge, Farben, kein Band (v.35.68.0).

   Michel: "Gruppen pro Nutzer sortieren — Drag-and-drop und Hoch/Runter,
   im Backend gespeichert, überall gleich, neue Gruppen setzen es nicht
   zurück" — "Gruppenfarben = Kalenderfarben aus einer Quelle; Unter-
   kalender- und Kategoriefarben von Berechtigten, die Unterfarbe
   überschreibt die Gruppenfarbe; der Kalender zeigt weiter die
   Gruppenzugehörigkeit" — "den dicken farbigen Balken unter dem
   Gruppenkopf entfernen, stattdessen ein kleines farbiges Symbol neben dem
   Namen". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, starteGruppe, warte } from './gruppe-harness.mjs';
import { nachFolge, verschieben, anStelle, folgeSauber, FOLGE_MAX } from '../assets/js/gruppen-folge.js';
import { teamFarben } from '../assets/js/kalender-teams.js';
import { quellenBaum as baum } from '../assets/js/kalender-quellen.js';
import { vereinigeGruppen } from '../assets/js/uebernahme.js';

const read = p => readFile(join(root, p), 'utf8');
const G = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Club' }];

test('die eigene Folge gilt; eine neue Gruppe setzt sie nicht zurück, sie kommt hinten dazu', () => {
  assert.deepEqual(nachFolge(G, ['c', 'a']).map(g => g.id), ['c', 'a', 'b']);
  const neu = [...G, { id: 'd', name: 'Aaa neu' }];
  assert.deepEqual(nachFolge(neu, ['c', 'a', 'b']).map(g => g.id), ['c', 'a', 'b', 'd'], 'die neue Gruppe warf die Folge um');
  assert.deepEqual(nachFolge(G, []).map(g => g.id), ['a', 'b', 'c'], 'ohne Folge nach dem Namen');
  assert.deepEqual(verschieben(nachFolge(G, ['c', 'a', 'b']), 'b', -1), ['c', 'b', 'a']);
  assert.deepEqual(verschieben(G, 'a', -1), ['a', 'b', 'c'], 'oben bleibt oben');
  assert.deepEqual(anStelle(G, 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(folgeSauber(['a', 'a', '', 7, null]), ['a', '7']);
  assert.equal(folgeSauber(Array.from({ length: 80 }, (_, i) => `g${i}`)).length, FOLGE_MAX);
});

test('Farben hängen an der Kennung, nicht an der Reihenfolge — sortieren färbt nichts um', () => {
  const PALETTE = ['#111111', '#222222', '#333333', '#444444'];
  const eins = teamFarben(G, PALETTE);
  const zwei = teamFarben(nachFolge(G, ['c', 'b', 'a']), PALETTE);
  assert.deepEqual([...eins].sort(), [...zwei].sort());
  /* Der Kalender behält die eigene Folge (bis v.35.67.0 sortierte er nach dem Namen). */
  assert.deepEqual(vereinigeGruppen(nachFolge(G, ['c', 'a']), [{ id: 'f', name: 'Alte Familie' }]).map(g => g.id), ['c', 'a', 'b', 'f']);
});

test('eine Farbe der Art geht der Gruppe vor — in der Quellenliste und im Kalender', async () => {
  const liste = baum({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', artFarben: { rennen: '#d4537e' } }],
    farbeVon: () => '#2f6fd1', arten: () => ['training', 'lager', 'rennen'],
  });
  const flach = JSON.stringify(liste);
  assert.match(flach, /"schluessel":"g:g1:art:rennen","name":"rennen","farbe":"#d4537e"/);
  assert.match(flach, /"schluessel":"g:g1:art:training","name":"training","farbe":"#2f6fd1"/);
  const kal = await read('assets/js/feature/kalender/kalender.js');
  const map = kal.slice(kal.indexOf('const farben = new Map(['), kal.indexOf('const farben = new Map([') + 400);
  /* Reihenfolge der Map = wer gewinnt: der Kalender der Gruppe zuletzt. */
  assert.ok(map.indexOf('artFarben') < map.indexOf('gruppenKalender'), 'die Art überschrieb den Kalender der Gruppe');
  /* Die Gruppe steht weiter in der Zeile. */
  assert.match(await read('assets/js/feature/kalender/eintraege.js'), /quelle: gruppe\?\.name \|\| ''/);
});

test('die Leitung wählt die Farben der Arten; die Regel prüft sie', async () => {
  const g = await read('assets/js/groups.js');
  assert.match(g, /const erlaubt = \['name', 'farbe', 'artFarben', 'bereiche', 'inviteToken', 'icsToken'\];/);
  const regeln = await read('firestore.rules');
  assert.match(regeln, /\.hasOnly\(\['name', 'farbe', 'artFarben', 'bereiche', 'inviteToken', 'icsToken', 'assistent'\]\)/);
  assert.match(regeln, /&& artFarbenGueltig\(request\.resource\.data\)/);
  assert.match(regeln, /m\[art\]\.matches\('\^#\[0-9a-fA-F\]\{6\}\$'\)/);
  /* Die eigene Reihenfolge: nur die Person selbst. */
  assert.match(regeln, /match \/users\/\{uid\}\/einstellungen\/\{name\} \{\s*allow read, delete: if isMember\(\) && request\.auth\.uid == uid;/);
});

test('die gemeinsame Liste ordnet nach der eigenen Folge — vom Gerät, vom Server, von anderen Seiten', async () => {
  const g = await read('assets/js/groups.js');
  assert.match(g, /const melden = liste => \{\s*roh = liste;\s*letzte = geordnet\(liste\);/);
  assert.match(g, /onSnapshot\(folgeRef\(uid\), snap => \{/);
  assert.match(g, /window\.addEventListener\('storage', e => \{ if \(e\.key === FOLGE_SPEICHER\) neuOrdnen\(\); \}\);/);
  assert.match(g, /return geordnet\(await zuGruppen\(/, 'meineGruppen ordnet nicht');
  /* Die leere, unvollständige Liste bleibt es auch nach dem Ordnen. */
  assert.match(g, /Object\.defineProperty\(neu, 'unvollstaendig', \{ value: !!liste\?\.unvollstaendig \}\);/);
  const start = await read('assets/js/feature/start/start.js');
  for (const k of ['data-folge-griff', 'data-folge-hoch', 'data-folge-runter']) assert.match(start, new RegExp(k));
  assert.match(start, /liste\.addEventListener\('pointerdown'/, 'ziehen mit Finger und Maus');
  assert.match(start, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/, 'ordnen mit der Tastatur');
  assert.match(start, /set\.folgeNurHier/, 'scheitert der Server, steht es da');
});

test('kein Band über der Gruppe — ein Farbpunkt am Namen im Kopf', async () => {
  const css = await read('assets/css/feature/gruppe.css');
  assert.doesNotMatch(css, /\.main \{ border-top: 4px solid var\(--gruppe-farbe/);
  const kit = await read('assets/css/kit.css');
  assert.match(kit, /\.appbar__title--punkt::before \{/);
  const router = await read('assets/js/router.js');
  assert.match(router, /export function titelFarbeSetzen\(el, farbe = ''\)/);
  assert.match(router, /else if \(typ === 'tvza-titel-farbe'\) eintrag\.kopf\.farbe = /);
  const shell = await read('assets/js/shell.js');
  assert.match(shell, /window\.parent\.postMessage\(\{ type:'tvza-titel-farbe', farbe \}, location\.origin\);/);

  const { doc, zurueck } = await starteGruppe({ gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', meineRolle: 'head', farbe: '#d4537e' }] });
  try {
    assert.ok(await warte(() => doc.querySelector('.appbar__title--punkt')), 'kein Farbpunkt am Namen');
    assert.equal(doc.querySelector('.appbar__title').style.getPropertyValue('--titel-punkt'), '#d4537e');
  } finally { zurueck(); }
});
