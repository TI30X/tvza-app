/* Start ist nie leer — der Überblick (v.35.66.0), dazu die Gruppe, die
   im Assistenten stand, aber nicht unter den Gruppen, und der
   Assistent für Athleten.

   Michel: "Ein Athlet in einer Gruppe sah 'Keine Bereiche aktiviert'" —
   "die wichtigen Infos erscheinen selten" — "Babelek van Zanten erscheint
   im Assistenten, aber nicht unter Gruppen" — "der Gruppenassistent muss
   für Athleten zugänglich sein, ohne Trainerrechte". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import { wichtigeInfos, zustand } from '../assets/js/ueberblick.js';
import { assistenten, werkzeugeFuer, aktionPruefen, kontextBauen } from '../assets/js/ki.js';

const read = p => readFile(join(root, p), 'utf8');
const grid = JSON.parse(await read('dev/fixtures/kw31-grid.json'));
const { parseProgram } = await import('../assets/js/training-parser.js');
const programm = parseProgram(grid);   // KW 31: 3.–9. August 2026

const GRUPPEN = [{ id: 'g1', name: 'BSV', meineRolle: 'mitglied' }];
const um = (tag, stunde = 9) => new Date(`${tag}T${String(stunde).padStart(2, '0')}:00:00`);

test('heute: das Training aus dem Plan mit Fortschritt, der Termin, das Überfällige — nichts Vergangenes', () => {
  const info = wichtigeInfos({
    jetzt: um('2026-08-04'), uid: 'lea', gruppen: GRUPPEN,
    plaene: [{ gid: 'g1', plan: { id: 'p1', titel: 'KW 31', fuer: 'alle' }, programm }],
    termine: [
      { id: 't1', gid: 'g1', titel: 'Konditionstest', von: '2026-08-04', zeit: '17:00', notiz: 'Turnschuhe mitnehmen' },
      { id: 't0', gid: 'g1', titel: 'Vorbei', von: '2026-08-01' },
      { id: 't2', gid: 'g1', titel: 'Rennen', von: '2026-08-10' },
      { id: 't3', gid: 'g1', titel: 'Abgesagt morgen', von: '2026-08-05', abgesagt: true },
    ],
    erinnerungen: [{ title: 'Lizenz zahlen', date: '2026-08-01' }, { title: 'Erledigt', date: '2026-08-04', completed: true }],
  });
  const titel = info.jetzt.map(x => x.titel);
  assert.ok(info.jetzt.some(x => x.art === 'training' && x.fortschritt && x.fortschritt.gesamt > 0), 'das Training von heute fehlt');
  assert.ok(titel.includes('Konditionstest'));
  assert.equal(info.jetzt.find(x => x.titel === 'Konditionstest').notiz, 'Turnschuhe mitnehmen');
  assert.ok(info.jetzt.some(x => x.art === 'erinnerung' && x.ueberfaellig), 'die überfällige Erinnerung fehlt');
  assert.ok(!titel.includes('Vorbei') && !titel.includes('Erledigt'), 'Vergangenes oder Erledigtes steht da');
  /* Demnächst: das Rennen und die Absage — die Karte schweigt nicht mehr,
     nur weil heute nichts ansteht. */
  assert.ok(info.demnaechst.some(x => x.titel === 'Rennen') || info.demnaechst.length === 3);
  assert.ok([...info.jetzt, ...info.demnaechst].some(x => x.art === 'absage'), 'eine Absage im Fenster wird nicht genannt');
});

test('am Abend: morgen — und das offene Training von heute bleibt', () => {
  const info = wichtigeInfos({
    jetzt: um('2026-08-04', 20), uid: 'lea', gruppen: GRUPPEN,
    plaene: [{ gid: 'g1', plan: { id: 'p1', titel: 'KW 31', fuer: 'alle' }, programm }],
  });
  assert.equal(info.abend, true);
  assert.equal(info.stichtag, '2026-08-05');
  assert.ok(info.jetzt.some(x => x.art === 'training' && x.datum === '2026-08-04'), 'das unerledigte Training von heute fehlt');
  assert.ok(info.jetzt.some(x => x.datum === '2026-08-05'));
});

test('nur die eigenen Pläne und die für alle — ein neuer Plan drei Tage lang', () => {
  const jetzt = um('2026-08-04');
  const info = wichtigeInfos({
    jetzt, uid: 'lea', gruppen: GRUPPEN,
    plaene: [
      { gid: 'g1', plan: { id: 'p2', titel: 'KW 31 Max', fuer: 'max', erstelltAm: jetzt.toISOString() }, programm },
      { gid: 'g1', plan: { id: 'p3', titel: 'KW 31 Lea', fuer: 'lea', erstelltAm: new Date(jetzt - 86400000).toISOString() }, programm },
      { gid: 'g1', plan: { id: 'p4', titel: 'Alt', fuer: 'lea', erstelltAm: new Date(jetzt - 10 * 86400000).toISOString() }, programm },
    ],
  });
  const neu = info.jetzt.filter(x => x.art === 'plan').map(x => x.titel);
  assert.deepEqual(neu, ['KW 31 Lea'], 'fremde oder alte Pläne als neu gemeldet');
  assert.ok(!info.jetzt.some(x => x.planId === 'p2'), 'das Training eines anderen steht auf Start');
});

test('vier Zustände: lädt, gescheitert, offline, nichts geplant', () => {
  assert.equal(zustand({ laedt: true }), 'laedt');
  assert.equal(zustand({ quellen: 5, fehler: 5 }), 'fehler');
  assert.equal(zustand({ quellen: 5, fehler: 5, offline: true }), 'offline');
  assert.equal(zustand({ quellen: 5, fehler: 1, nichts: true }), 'leer', 'eine gescheiterte Quelle ist nicht "alles gescheitert"');
  assert.equal(zustand({ quellen: 5, fehler: 0, nichts: false }), 'daten');
  const leer = wichtigeInfos({ jetzt: um('2026-08-04'), uid: 'neu' });
  assert.equal(leer.nichts, true);
});

test('Start zeigt den Überblick für jedes Konto — ohne Gruppe mit den zwei Wegen hinein', async () => {
  const [html, js, css] = await Promise.all([read('index.html'), read('assets/js/feature/start/ueberblick.js'), read('assets/css/feature/start.css')]);
  assert.match(html, /<section class="section ueberblick" id="ueberblick"/);
  assert.match(html, /<script type="module" src="\.\/assets\/js\/feature\/start\/ueberblick\.js\?v=\d+"><\/script>/);
  assert.ok(html.indexOf('id="ueberblick"') < html.indexOf('id="trackerGrid"'), 'der Überblick steht nicht oben');
  assert.match(js, /href="pages\/gruppe\.html\?anlegen=1"/);
  assert.match(js, /href="pages\/gruppe\.html\?beitreten=1"/);
  /* Eine leere, unvollständige Gruppenliste ist "lädt", nicht "keine Gruppe". */
  assert.match(js, /if \(!neu\.length && liste\?\.unvollstaendig\) return;/);
  assert.match(css, /\.wichtig \{/);
  const gruppe = await read('assets/js/feature/gruppe/gruppe.js');
  assert.match(gruppe, /const EINMAL = \['anlegen', 'neu', 'termin', 'g', 'einst', 'beitreten'\];/);
  assert.match(gruppe, /if \(beitretenAusAdresse\) \{\s*beitretenAusAdresse = false;\s*void codeEinloesen\(\);/);
  /* Das orange "n" ist weg (Michel: "dezent, passend zum blauen Design"). */
  const briefing = await read('assets/js/briefing.js');
  assert.doesNotMatch(briefing, /marke\.textContent = 'n';/);
  const kit = await read('assets/css/kit.css');
  assert.doesNotMatch(kit.slice(kit.indexOf('.hint__marke {'), kit.indexOf('.hint__marke {') + 250), /var\(--brand\)/);
});

test('"gibt es nicht" aus dem Speicher des Geräts macht eine Gruppe nicht zur gelöschten', async () => {
  const g = await read('assets/js/groups.js');
  /* Seit v.35.70.5 strenger: nachgefragt wird auch dann, wenn die
     Antwort gar nicht sagt, woher sie kommt (metadata fehlt). Gelöscht
     ist eine Gruppe nur, wenn der Server es sagt. */
  assert.match(g, /if \(!snap\.exists\(\) && snap\.metadata\?\.fromCache !== false\) \{\s*try \{ snap = await getDocFromServer\(gruppeRef\(gid\)\); \}\s*catch \{ return undefined; \}/);
  assert.match(g, /if \(g === undefined\) return null;\s*return g \? \{ \.\.\.g, meineRolle: m\.rolle \} : GELOESCHT;/);
});

test('ein Athlet ohne eigenen Assistenten hat den der freigeschalteten Gruppe — ohne Rechte der Leitung', () => {
  const gruppen = [{ id: 'g1', name: 'BSV', ki: true, meineRolle: 'mitglied', assistent: { name: 'Coach Maxi' } },
                   { id: 'g2', name: 'Verein', meineRolle: 'mitglied' }];
  const liste = assistenten({ profil: { displayName: 'Lea' }, gruppen });
  assert.deepEqual(liste.map(a => a.wer), ['g1'], 'nur die freigeschaltete Gruppe, kein persönlicher');
  assert.equal(liste[0].name, 'Coach Maxi');
  /* Er darf erinnern und fragen, aber keinen Gruppentermin eintragen. */
  assert.ok(werkzeugeFuer('g1').includes('gruppentermin_eintragen'));
  const kontext = { wer: 'g1', heute: '2026-08-04', gruppen: [{ id: 'g1', name: 'BSV', leite: false }] };
  const r = aktionPruefen({ name: 'gruppentermin_eintragen', args: { gruppe_id: 'g1', titel: 'Training', datum: '2026-08-06' } }, kontext);
  assert.equal(r.ok, false);
  assert.match(r.grund || r.fehler || JSON.stringify(r), /nur die Leitung/);
  /* Der Kontext nennt keine anderen Gruppen und keine eigenen Termine. */
  const k = kontextBauen({ wer: 'g1', gruppen, eigene: [{ title: 'Privat', date: '2026-08-05' }], erinnerungen: [{ title: 'x', date: '2026-08-05' }] });
  assert.doesNotMatch(JSON.stringify(k), /Verein|Privat/);
});

test('Start öffnet den Assistenten über die Pille — dieselbe Liste, kein zweiter Zugang', async () => {
  const pille = await read('assets/js/ki-pille.js');
  assert.match(pille, /window\.addEventListener\('firn-ki-oeffnen', event => \{/);
  assert.match(pille, /window\.__firnAssistenten = liste\.map\(/);
  const js = await read('assets/js/feature/start/ueberblick.js');
  assert.match(js, /new CustomEvent\('firn-ki-oeffnen', \{ detail: \{ wer: ki\.dataset\.ki \} \}\)/);
});
