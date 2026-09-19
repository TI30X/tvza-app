/* Team-Termine im Kalender-Tab.

   Bis v.35.30.0 sah der Kalender nur das alte Familienmodell. Wer in
   einem Kader und einem Verein ist, fand deren Termine unter "Gruppe"
   und in "Heute" — im Kalender, wo man nachschaut, was diese Woche
   ansteht, stand nichts davon.

   Die Umrechnung liegt in assets/js/kalender-teams.js und wird hier
   ausgefuehrt; die Anbindung in planner.html wird am Quelltext geprueft,
   weil die Seite ohne Firebase nicht startet. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { teamEintraege, teamFarbe, teamFarben, teamTerminText, tageVon } from '../assets/js/kalender-teams.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = ['#7f77dd', '#2f6fed', '#1d9e75', '#e0b52f', '#d8761d', '#d4537e', '#1d9e9e', '#777674'];

const KADER = { id: 'kader1', name: 'BSV Kader', art: 'kader' };
const VEREIN = { id: 'verein1', name: 'SC Einsiedeln', art: 'organisation', farbe: '#1d9e75' };
const termine = new Map([
  ['kader1', [
    { id: 'r1', art: 'rennen', titel: 'RS Adelboden', von: '2026-12-12', zeit: '09:30', ort: 'Adelboden' },
    { id: 'l1', art: 'lager', titel: 'Lager Saas-Fee', von: '2026-10-03', bis: '2026-10-05', zeit: '08:00' },
    { id: 'x1', art: 'training', titel: 'Kaputt', von: 'irgendwann' },
  ]],
  ['verein1', [
    { id: 't1', art: 'training', von: '2026-12-12', zeit: '18:00' },
    { id: 'a1', art: 'training', titel: 'Hallentraining', von: '2026-12-13', abgesagt: true, absageGrund: 'Halle belegt' },
  ]],
]);

test('jedes Team steht mit seinen Terminen im Kalender, am richtigen Tag', () => {
  const map = teamEintraege([KADER, VEREIN], termine, { palette: PALETTE });
  const am12 = map['2026-12-12'];
  assert.equal(am12.length, 2, 'Kader-Rennen und Vereinstraining am selben Tag');
  const rennen = am12.find(e => e.ref.id === 'r1');
  assert.equal(rennen.kind, 'team');
  assert.equal(rennen.title, 'RS Adelboden');
  assert.equal(rennen.time, '09:30');
  assert.equal(rennen.sourceName, 'BSV Kader');
  assert.equal(rennen.art, 'Rennen');
  assert.equal(rennen.ref.gid, 'kader1', 'ohne gid fuehrt "Zur Gruppe" ins Leere');
  assert.equal(rennen.ref.location, 'Adelboden', 'die Listenansicht liest den Ort aus location');
});

test('ohne Titel steht das Wort der Gruppe da, nicht nichts', () => {
  const map = teamEintraege([VEREIN], termine, { palette: PALETTE });
  const kurs = map['2026-12-12'][0];
  assert.equal(kurs.title, 'Kurs', 'ein Training im Verein heisst Kurs (termine.js)');
});

test('ein Lager steht an jedem seiner Tage, ohne Uhrzeit', () => {
  const map = teamEintraege([KADER], termine, { palette: PALETTE });
  for (const tag of ['2026-10-03', '2026-10-04', '2026-10-05']) {
    const lager = map[tag]?.find(e => e.ref.id === 'l1');
    assert.ok(lager, `Lager fehlt am ${tag}`);
    assert.equal(lager.time, '', 'sonst stuende das Lager an drei Tagen um 08:00');
  }
  assert.equal(map['2026-10-06'], undefined);
});

test('ein Termin ohne gueltiges Datum wird uebergangen statt den Kalender zu brechen', () => {
  const map = teamEintraege([KADER], termine, { palette: PALETTE });
  const alle = Object.values(map).flat();
  assert.ok(!alle.some(e => e.ref.id === 'x1'));
});

test('ein abgesagter Termin bleibt sichtbar — als abgesagt, mit Grund', () => {
  const map = teamEintraege([VEREIN], termine, { palette: PALETTE });
  const halle = map['2026-12-13'][0];
  assert.equal(halle.abgesagt, true);
  assert.equal(halle.title, 'Abgesagt: Hallentraining');
  assert.match(teamTerminText(halle), /Abgesagt: Halle belegt/);
});

test('ein ausgeschaltetes Team verschwindet, das andere bleibt', () => {
  const map = teamEintraege([KADER, VEREIN], termine, { palette: PALETTE, versteckt: new Set(['kader1']) });
  const alle = Object.values(map).flat();
  assert.ok(alle.length > 0);
  assert.ok(alle.every(e => e.ref.gid === 'verein1'));
});

test('die Farbe eines Teams ist die gewaehlte, sonst eine feste aus der Kennung', () => {
  assert.equal(teamFarbe(VEREIN, PALETTE), '#1d9e75');
  const einmal = teamFarbe(KADER, PALETTE);
  assert.ok(PALETTE.includes(einmal));
  assert.equal(teamFarbe({ ...KADER }, PALETTE), einmal, 'bei jedem Laden dieselbe');
  assert.ok(PALETTE.includes(teamFarbe({ id: 'k', farbe: '#000000' }, PALETTE)),
    'eine Farbe ausserhalb der Palette wird nicht uebernommen');
});

test('zwei Teams bekommen nie dieselbe Farbe, solange die Palette reicht', () => {
  /* In der ersten Probe fielen Kader und Verein beide auf Gruen: der eine
     hatte es gewaehlt, der andere traf es ueber die Kennung. */
  const gruppen = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}` }));
  gruppen[3].farbe = '#1d9e75';
  const farben = teamFarben(gruppen, PALETTE);
  assert.equal(new Set(farben.values()).size, 8, [...farben.values()].join(' '));
  assert.equal(farben.get('g3'), '#1d9e75', 'die gewaehlte Farbe gewinnt');
  /* Ausschalten aendert nichts an den Farben der anderen. */
  const map = teamEintraege(gruppen, new Map([['g5', [{ art: 'training', von: '2026-01-01' }]]]),
    { palette: PALETTE, versteckt: new Set(['g0', 'g1']) });
  assert.equal(map['2026-01-01'][0].color, farben.get('g5'));
});

test('die Terminkarte nennt Art, Ort und Gruppe', () => {
  const map = teamEintraege([KADER], termine, { palette: PALETTE });
  const text = teamTerminText(map['2026-12-12'][0]);
  assert.match(text, /^Rennen · .*12.* · Adelboden · BSV Kader$/);
});

test('tageVon ist gedeckelt, auch bei einem verschriebenen Jahr', () => {
  assert.equal(tageVon({ von: '2026-01-01', bis: '2099-01-01' }).length, 400);
  assert.deepEqual(tageVon({ von: '2026-02-28', bis: '2026-03-01' }), ['2026-02-28', '2026-03-01']);
});

/* ── Die Anbindung im Kalender (feature/kalender/kalender.js) ────── */

const kalender = () => readFile(join(root, 'assets/js/feature/kalender/kalender.js'), 'utf8');

test('der Kalender liest die Teams und gibt ihre Termine in alle Ansichten', async () => {
  const quelle = await kalender();
  assert.match(quelle, /import \{[^}]*beobachteMeineGruppen[^}]*beobachteTermine[^}]*\} from '\.\.\/\.\.\/groups\.js'/);
  assert.match(quelle, /from '\.\.\/\.\.\/kalender-teams\.js'/);
  assert.match(quelle, /\bwatchTeams\(\);/, 'watchTeams wird nie aufgerufen');

  /* Bis v.35.48.0 gab es zwei Tabellen (eventMap, dayProgramMap), und
     jede musste die Team-Termine aufnehmen — fehlte eine, fehlten die
     Termine in der halben App. Seit v.35.49.0 zeichnen alle Ansichten
     aus EINER Liste; die Teams gehen in sie hinein. */
  // Seit v.35.59.0 tragen die Teams auch die Einheiten ihrer Pläne mit.
  assert.match(quelle, /groups\.filter\(item => !versteckteTeams\.has\(item\.id\)\)\s*\.map\(gruppe => \(\{ gruppe, termine:teamTermine\.get\(gruppe\.id\) \|\| \[\], trainings:teamTrainings\.get\(gruppe\.id\) \|\| \[\] \}\)\)/);
  /* Seit v.35.74.0 steht daneben der eigene Plan. Er ist keine Gruppe:
     keine Termine, keine Gruppenfarbe — und er haengt am Schalter
     "Persoenlich", weil er persoenlich IST. */
  assert.match(quelle, /showPersonal && \(teamTrainings\.get\(EIGEN\) \|\| \[\]\)\.length/);
  const zeichnen = quelle.match(/function renderCurrentView\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(zeichnen, /const liste = eintraegeJetzt\(\);/);
  for (const ansicht of ['renderListe', 'renderMonat', 'renderZeit']) {
    assert.match(zeichnen, new RegExp(`${ansicht}\\(el, liste\\)`), `${ansicht} zeichnet nicht aus der einen Liste`);
  }
});

test('ein Team-Termin oeffnet die Terminkarte, nie das Formular fuer eigene Termine', async () => {
  const quelle = await kalender();
  /* Alles, was nicht Reise oder Erinnerung ist, landete einmal im
     Formular für eigene Termine — ein Team-Termin wäre dort als eigener
     Termin bearbeitbar erschienen. Der Team-Termin kommt zuerst. */
  /* Seit v.35.50.0: mit Programm das Programm, sonst die Karte — beides
     vor dem Formular für eigene Termine. */
  assert.match(quelle, /function oeffne\(eintrag\) \{\s*if \(eintrag\.art === 'team' \|\| eintrag\.art === 'reise'\) \{[\s\S]*?if \(eintrag\.art === 'team'\) zeigeTeamTermin\(eintrag\); else zeigeReise\(eintrag\);\s*return;\s*\}/);
  // Seit v.35.60.0 ist jede Quelle ein Schlüssel (kalender-quellen.js) —
  // eine Gruppe als Ganzes ('g:<gid>') wie ihre Kalender darunter.
  assert.match(quelle, /const ANTIPPEN = 'data-quelle';/, 'Teams lassen sich nicht einzeln ausschalten');
  assert.match(quelle, /if \(aus\.has\(s\)\) aus\.delete\(s\); else aus\.add\(s\);/);
  assert.match(quelle, /teamsAus:\[\.\.\.versteckteTeams\]/, 'die Wahl wird nicht gemerkt');
  /* Die Karte ist frage() aus dialog.js, kein Browserfenster. */
  const karte = quelle.match(/async function zeigeTeamTermin\(eintrag\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(karte, /await frage\(\{/);
  assert.doesNotMatch(karte, /\bconfirm\(|\balert\(/);
  assert.match(karte, /zumTermin\(eintrag\.ref\.gid, eintrag\.ref\.id\)/, '"Zum Termin" muss die richtige Gruppe und den Termin oeffnen');
});
