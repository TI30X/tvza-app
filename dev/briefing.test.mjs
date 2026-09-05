/* Tests für assets/js/briefing.js.
 *
 * briefing.js importiert bewusst weder Firebase noch das DOM in seiner
 * Logik — darum sind das hier ECHTE Tests und keine Quelltextprüfung.
 * Wie bei hints.js liegt das Interessante darin, wann die Karte
 * SCHWEIGT: eine Zusammenfassung, die jeden Tag erscheint, auch wenn
 * sie nichts zu sagen hat, wird nach drei Tagen überblättert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBriefing, tagesSatz, termineHeute, uhrzeit,
  tagesfenster, naechsteTage, ABEND_AB, VORSCHAU_TAGE,
} from '../assets/js/briefing.js';

/* Ein fester Dienstag, damit nichts von der echten Uhr abhängt. */
const NOW = new Date(2026, 8, 8, 7, 30);
const heute = (h, m = 0) => new Date(2026, 8, 8, h, m);
const morgen = (h, m = 0) => new Date(2026, 8, 9, h, m);
const gestern = (h, m = 0) => new Date(2026, 8, 7, h, m);

test('ohne Termin und ohne Hinweis erscheint keine Karte', () => {
  assert.equal(buildBriefing({ termine: [], hint: null, now: NOW }), null);
  assert.equal(buildBriefing({ now: NOW }), null);
  assert.equal(buildBriefing(), null);

  // Auch ein leerer Hinweistext zählt nicht als Inhalt.
  assert.equal(buildBriefing({ termine: [], hint: { text: '   ' }, now: NOW }), null);
});

test('ein Hinweis allein trägt die Karte', () => {
  const b = buildBriefing({
    termine: [],
    hint: { type: 'wetterSki', text: 'In Malbun sind 12 cm gemeldet.' },
    now: NOW,
  });
  assert.deepEqual(b.saetze, ['In Malbun sind 12 cm gemeldet.']);
  assert.equal(b.hinweisTyp, 'wetterSki');
});

test('ein Termin allein trägt die Karte auch', () => {
  const b = buildBriefing({
    termine: [{ titel: 'Kraft Beine', start: heute(14) }],
    hint: null,
    now: NOW,
  });
  assert.deepEqual(b.saetze, ['Heute um 14:00: Kraft Beine.']);
  assert.equal(b.hinweisTyp, null);
});

test('der Tag steht vor dem Hinweis', () => {
  const b = buildBriefing({
    termine: [{ titel: 'Kraft Beine', start: heute(14) }],
    hint: { type: 'wetterSki', text: 'Deine Ski sind seit 12 Tagen ohne Service.' },
    now: NOW,
  });
  assert.equal(b.saetze.length, 2);
  assert.match(b.saetze[0], /Kraft Beine/);
  assert.match(b.saetze[1], /ohne Service/);
});

test('nur der heutige Tag zählt', () => {
  const termine = [
    { titel: 'Gestern', start: gestern(14) },
    { titel: 'Heute',   start: heute(14) },
    { titel: 'Morgen',  start: morgen(9) },
  ];
  assert.deepEqual(termineHeute(termine, NOW).map(t => t.titel), ['Heute']);
});

test('Termine kommen in zeitlicher Reihenfolge, egal wie sie hereinkamen', () => {
  const termine = [
    { titel: 'Spät',  start: heute(18) },
    { titel: 'Früh',  start: heute(8) },
    { titel: 'Mitte', start: heute(12) },
  ];
  assert.deepEqual(termineHeute(termine, NOW).map(t => t.titel), ['Früh', 'Mitte', 'Spät']);
  assert.match(tagesSatz(termine, NOW), /die erste um 08:00: Früh\./);
});

test('unlesbare Termine fallen still heraus statt die Karte zu vergiften', () => {
  const termine = [
    { titel: 'Gut',    start: heute(9) },
    { titel: 'Kaputt', start: 'übermorgen irgendwann' },
    { titel: '',       start: heute(10) },   // ohne Titel
    null,
    { start: heute(11) },                     // ohne Titel
  ];
  const raus = termineHeute(termine, NOW);
  assert.deepEqual(raus.map(t => t.titel), ['Gut']);
  assert.doesNotMatch(tagesSatz(termine, NOW), /Invalid|NaN|undefined/);
});

test('ein Satz, keine Liste — die Liste steht schon darunter auf der Seite', () => {
  const eins = tagesSatz([{ titel: 'A', start: heute(9) }], NOW);
  const zwei = tagesSatz([
    { titel: 'A', start: heute(9) },
    { titel: 'B', start: heute(17) },
  ], NOW);
  const drei = tagesSatz([
    { titel: 'A', start: heute(9) },
    { titel: 'B', start: heute(12) },
    { titel: 'C', start: heute(17) },
  ], NOW);

  assert.equal(eins, 'Heute um 09:00: A.');
  assert.equal(zwei, 'Heute A um 09:00 und B um 17:00.');
  // Ab drei wird gezählt statt aufgezählt — sonst wächst die Karte mit
  // dem Kalender, und genau das soll sie nicht.
  assert.equal(drei, 'Heute stehen 3 Sachen an — die erste um 09:00: A.');
  assert.doesNotMatch(drei, /\bC\b/);
});

test('tagesSatz schweigt an einem leeren Tag', () => {
  assert.equal(tagesSatz([], NOW), null);
  assert.equal(tagesSatz([{ titel: 'Morgen', start: morgen(9) }], NOW), null);
  assert.equal(tagesSatz(null, NOW), null);
  assert.equal(tagesSatz(undefined, NOW), null);
});

test('ganztägige Termine bekommen keine erfundene Uhrzeit', () => {
  // Erinnerungen und Reisen tragen auf der Startseite nur ein Datum. Als
  // Date sind sie Mitternacht — "Heute um 00:00: Versicherung bezahlen"
  // wäre schlicht falsch.
  const eins = tagesSatz([
    { titel: 'Versicherung bezahlen', start: heute(0), ganztags: true },
  ], NOW);
  assert.equal(eins, 'Heute: Versicherung bezahlen.');
  assert.doesNotMatch(eins, /00:00/);

  const gemischt = tagesSatz([
    { titel: 'Sommerferien', start: heute(0), ganztags: true },
    { titel: 'Kraft Beine', start: heute(14) },
  ], NOW);
  assert.equal(gemischt, 'Heute Sommerferien und Kraft Beine um 14:00.');

  const viele = tagesSatz([
    { titel: 'Sommerferien', start: heute(0), ganztags: true },
    { titel: 'Kraft Beine', start: heute(14) },
    { titel: 'Znacht', start: heute(18) },
  ], NOW);
  assert.equal(viele, 'Heute stehen 3 Sachen an, zuerst Sommerferien.');
});

test('Ganztägiges steht vor den Uhrzeiten — es ist der Rahmen, nicht ein Punkt darin', () => {
  const raus = termineHeute([
    { titel: 'Früh am Tag', start: heute(6) },
    { titel: 'Ganzer Tag', start: heute(9), ganztags: true },
  ], NOW);
  assert.deepEqual(raus.map(t => t.titel), ['Ganzer Tag', 'Früh am Tag']);
});

test('uhrzeit ist zweistellig und kippt nicht bei Unsinn', () => {
  assert.equal(uhrzeit(heute(9, 5)), '09:05');
  assert.equal(uhrzeit(heute(14, 0)), '14:00');
  assert.equal(uhrzeit('kein Datum'), '');
});

test('der Hinweistyp wandert mit, damit Wegklicken die Regeln aus hints.js trifft', () => {
  // Ohne den Typ könnte "nicht mehr anzeigen" nicht auf die richtige
  // Hinweisart wirken — und Regel 4 (zweimal weggeklickt heisst nie
  // wieder) liefe ins Leere.
  const b = buildBriefing({
    termine: [{ titel: 'X', start: heute(9) }],
    hint: { type: 'maturaTempo', text: 'Zwei Tage hinter dem Tempo.' },
    now: NOW,
  });
  assert.equal(b.hinweisTyp, 'maturaTempo');

  // Ohne Hinweis gibt es auch nichts zu unterdrücken.
  const ohne = buildBriefing({ termine: [{ titel: 'X', start: heute(9) }], now: NOW });
  assert.equal(ohne.hinweisTyp, null);
});

/* ── Heute oder morgen ─────────────────────────────────────────────
   Die Schul-Mail, an der sich die Karte orientiert, heisst "Morgen"
   und kommt am Vorabend. Wer um sieben abends draufschaut, will nicht
   mehr wissen, was heute anstand. */

test('vor dem Abend zeigt die Karte heute, danach morgen', () => {
  const morgens = tagesfenster(new Date(2026, 8, 3, 7, 0));
  assert.equal(morgens.id, 'heute');
  assert.equal(morgens.tag.getDate(), 3);

  const abends = tagesfenster(new Date(2026, 8, 3, 18, 0));
  assert.equal(abends.id, 'morgen');
  assert.equal(abends.tag.getDate(), 4);
});

test('die Grenze kippt ueber den Monat und ueber das Jahr', () => {
  assert.equal(tagesfenster(new Date(2026, 8, 30, 20, 0)).tag.getMonth(), 9);
  const silvester = tagesfenster(new Date(2026, 11, 31, 20, 0)).tag;
  assert.equal(silvester.getFullYear(), 2027);
  assert.equal(silvester.getMonth(), 0);
  assert.equal(silvester.getDate(), 1);
});

test('die Abendgrenze ist ein Parameter, keine feste Zahl', () => {
  /* Sonst muesste ein Test die Uhr stellen. */
  assert.equal(tagesfenster(new Date(2026, 8, 3, 15, 0), 14).id, 'morgen');
  assert.equal(tagesfenster(new Date(2026, 8, 3, 15, 0), 20).id, 'heute');
  assert.equal(ABEND_AB, 17);
});

/* ── Die naechsten vierzehn Tage ───────────────────────────────── */

const T = (tag, stunde, titel, ganztags = false) =>
  ({ titel, start: new Date(2026, 8, tag, stunde, 0), ganztags });

test('die Vorschau beginnt NACH dem Fenster, damit sich nichts doppelt', () => {
  const now = new Date(2026, 8, 3, 7, 0);          // morgens am 3.
  const liste = naechsteTage([
    T(3, 14, 'heute'), T(4, 8, 'morgen'), T(10, 9, 'in einer Woche'),
  ], { now });

  assert.deepEqual(liste.map(t => t.titel), ['morgen', 'in einer Woche'],
    'was schon oben im Tagessatz steht, gehoert nicht noch einmal darunter');
});

test('am Abend rutscht auch die Vorschau einen Tag weiter', () => {
  const now = new Date(2026, 8, 3, 19, 0);         // abends am 3.
  const liste = naechsteTage([T(4, 8, 'morgen'), T(5, 8, 'uebermorgen')], { now });
  assert.deepEqual(liste.map(t => t.titel), ['uebermorgen'],
    'der 4. steht abends schon oben als "Morgen"');
});

test('vierzehn Tage heisst vierzehn Tage', () => {
  const now = new Date(2026, 8, 3, 7, 0);
  const liste = naechsteTage([T(17, 9, 'gerade noch'), T(18, 9, 'zu spaet')], { now });
  assert.deepEqual(liste.map(t => t.titel), ['gerade noch']);
  assert.equal(VORSCHAU_TAGE, 14);
});

test('die Vorschau steht in zeitlicher Reihenfolge, Ganztaegiges zuerst', () => {
  const now = new Date(2026, 8, 3, 7, 0);
  const liste = naechsteTage([
    T(6, 9, 'spaeter am Tag'), T(6, 12, 'ganztaegig', true), T(5, 9, 'frueher'),
  ], { now });
  assert.deepEqual(liste.map(t => t.titel), ['frueher', 'ganztaegig', 'spaeter am Tag']);
});

test('unlesbare Termine fallen auch hier still heraus', () => {
  const now = new Date(2026, 8, 3, 7, 0);
  const liste = naechsteTage([
    { titel: 'ohne Datum' },
    { titel: 'Unsinn', start: 'gestern' },
    { start: new Date(2026, 8, 6, 9, 0) },          // ohne Titel
    T(6, 9, 'gut'),
  ], { now });
  assert.deepEqual(liste.map(t => t.titel), ['gut']);
});

/* ── Zusammenspiel ─────────────────────────────────────────────── */

test('ohne abendAb bleibt alles wie vorher — immer heute, keine Vorschau', () => {
  /* Die additive Regel: wer buildBriefing wie bisher aufruft, bekommt
     wie bisher. */
  const now = new Date(2026, 8, 3, 19, 0);
  const alt = buildBriefing({ termine: [T(3, 20, 'heute Abend')], now });
  assert.ok(alt.saetze.length, 'der heutige Termin faellt weg');
  assert.deepEqual(alt.kommende, []);
  assert.equal(alt.fenster, 'heute');
});

test('eine Vorschau allein traegt die Karte nicht', () => {
  /* Regel 2: lieber nichts sagen. Eine Karte, die nur "in neun Tagen
     ist etwas" meldet, ist der Grund, warum man wegschaut. */
  const now = new Date(2026, 8, 3, 7, 0);
  const leer = buildBriefing({ termine: [T(12, 9, 'weit weg')], now, abendAb: ABEND_AB });
  assert.equal(leer, null);
});

test('am Abend zeigt die Karte den morgigen Tagessatz', () => {
  const now = new Date(2026, 8, 3, 19, 0);
  const brief = buildBriefing({
    termine: [T(3, 14, 'heute gewesen'), T(4, 8, 'Spielsporttag')],
    now, abendAb: ABEND_AB,
  });
  assert.equal(brief.fenster, 'morgen');
  assert.match(brief.saetze[0], /Spielsporttag/);
  assert.doesNotMatch(brief.saetze[0], /heute gewesen/,
    'was heute war, gehoert am Abend nicht mehr in die Karte');
});

test('am Abend faengt der Satz mit "Morgen" an, nicht mit "Heute"', () => {
  /* Die Karte trug den Titel "Morgen" und der Satz darunter fing mit
     "Heute" an — das Wort steckte fest in tagesSatz. */
  const brief = buildBriefing({
    termine: [{ titel: 'Spielsporttag', start: new Date(2026, 8, 4, 8, 0) }],
    now: new Date(2026, 8, 3, 19, 0),
    abendAb: ABEND_AB,
  });
  assert.match(brief.saetze[0], /^Morgen /);
  assert.doesNotMatch(brief.saetze[0], /Heute/);
});

test('tagsueber bleibt es bei "Heute"', () => {
  const brief = buildBriefing({
    termine: [{ titel: 'Kraft Beine', start: new Date(2026, 8, 3, 14, 0) }],
    now: new Date(2026, 8, 3, 7, 0),
    abendAb: ABEND_AB,
  });
  assert.match(brief.saetze[0], /^Heute /);
});
