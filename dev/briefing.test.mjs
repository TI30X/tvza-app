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
