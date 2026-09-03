/* Tests für assets/js/fispunkte.js.
 *
 * Eine Formel gehört gerechnet, nicht beteuert. Das Modul hat keinen
 * Firebase- und keinen DOM-Import, also sind das echte Tests.
 *
 * Der wichtigste Teil ist, wo die Rechnung SCHWEIGT: bei unlesbaren
 * Zeiten, bei einer Zeit schneller als der Sieger, bei fehlendem
 * Zuschlag. Eine Zahl, die amtlich aussieht und keine ist, wäre
 * schlimmer als gar keine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  F_FAKTOR, inSekunden, alsZeit, rennpunkte, gesamtpunkte,
  punktestand, standMit, zeitFuerPunkte, standJeDisziplin,
} from '../assets/js/fispunkte.js';

test('der Sieger hat null Punkte', () => {
  // Bei gleicher Zeit wird (F · Tx / To) − F zu F − F = 0.
  assert.equal(rennpunkte('1:23.45', '1:23.45', 'RS'), 0);
  assert.equal(rennpunkte(58.2, 58.2, 'SL'), 0);
});

test('die Formel rechnet, was sie soll', () => {
  // RS, F = 1010. Sieger 60 s, Athlet 63 s → 5 % Rückstand.
  // (1010 · 63 / 60) − 1010 = 1060.5 − 1010 = 50.5
  assert.equal(rennpunkte(63, 60, 'RS'), 50.5);

  // Slalom, F = 730, derselbe prozentuale Rückstand → weniger Punkte.
  // (730 · 63 / 60) − 730 = 766.5 − 730 = 36.5
  assert.equal(rennpunkte(63, 60, 'SL'), 36.5);

  // Abfahrt, F = 1250 → mehr. Das ist der ganze Sinn des Faktors:
  // dieselbe Sekunde wiegt in der Abfahrt schwerer.
  assert.equal(rennpunkte(63, 60, 'DH'), 62.5);
});

test('auf zwei Stellen gerundet, wie die FIS es tut', () => {
  const p = rennpunkte('1:00.37', '59.11', 'SG');
  assert.ok(Number.isFinite(p));
  assert.equal(p, Math.round(p * 100) / 100);
});

test('schneller als der Sieger ergibt keine Punkte, sondern nichts', () => {
  // Das ist ein Tippfehler oder die falsche Siegerzeit. Negative
  // Punkte gibt es nicht, also wird nichts behauptet.
  assert.equal(rennpunkte(59, 60, 'RS'), null);
});

test('unbekannte Disziplin und unlesbare Zeiten rechnen nicht mit', () => {
  assert.equal(rennpunkte(63, 60, 'XX'), null);
  assert.equal(rennpunkte(63, 60, undefined), null);
  assert.equal(rennpunkte('gestern', 60, 'RS'), null);
  assert.equal(rennpunkte(63, '', 'RS'), null);
  assert.equal(rennpunkte(0, 60, 'RS'), null);
});

test('Zeiten werden gelesen, wie sie auf einer Anzeigetafel stehen', () => {
  assert.equal(inSekunden('58.12'), 58.12);
  assert.equal(inSekunden('1:23.45'), 83.45);
  assert.equal(inSekunden('2:01:30.5'), 7290.5);
  // Ein Komma statt Punkt ist in der Schweiz nichts Ungewöhnliches.
  assert.equal(inSekunden('1:23,45'), 83.45);
  assert.equal(inSekunden(83.45), 83.45);
});

test('was keine Zeit ist, wird nicht zu einer gemacht', () => {
  for (const unsinn of ['', '   ', 'schnell', '1:2:3:4.5', '--', null, undefined, -5, 0, NaN]) {
    assert.equal(inSekunden(unsinn), null, `${JSON.stringify(unsinn)} ist keine Zeit`);
  }
});

test('alsZeit ist die Umkehrung für die Anzeige', () => {
  assert.equal(alsZeit(83.45), '1:23.45');
  assert.equal(alsZeit(58.12), '58.12');
  assert.equal(alsZeit(9.5), '9.50');
  assert.equal(alsZeit(-1), '');
  assert.equal(alsZeit(NaN), '');
});

test('ohne Zuschlag gibt es Rennpunkte, aber keine FIS-Punkte', () => {
  // Der Zuschlag entsteht aus den Punkten des ganzen Feldes — dafür
  // bräuchte es die FIS-Datenbank. Er wird nicht geraten.
  assert.equal(gesamtpunkte(50.5, null), null);
  assert.equal(gesamtpunkte(50.5, ''), null);
  assert.equal(gesamtpunkte(50.5, undefined), null);
  assert.equal(gesamtpunkte(50.5, 'keine Ahnung'), null);
  assert.equal(gesamtpunkte(50.5, -3), null);

  // Mit Zuschlag schon.
  assert.equal(gesamtpunkte(50.5, 12.3), 62.8);
  assert.equal(gesamtpunkte(50.5, 0), 50.5);
});

test('der Punktestand ist der Schnitt der zwei besten', () => {
  // Weniger ist besser, die "besten" sind also die kleinsten.
  const stand = punktestand([80, 45, 60, 120]);
  assert.equal(stand.punkte, 52.5);   // (45 + 60) / 2
  assert.equal(stand.aus, 4);
  assert.equal(stand.vorlaeufig, false);
});

test('ein einzelnes Ergebnis ist ausdrücklich vorläufig', () => {
  // Die FIS rechnet hier mit Zuschlägen je Rennkategorie. Die bilden
  // wir nicht nach — stattdessen wird der Wert als vorläufig
  // gekennzeichnet, statt eine halbe Regel zu erfinden.
  const stand = punktestand([45]);
  assert.equal(stand.punkte, 45);
  assert.equal(stand.aus, 1);
  assert.equal(stand.vorlaeufig, true);

  const leer = punktestand([]);
  assert.equal(leer.punkte, null);
  assert.equal(leer.vorlaeufig, true);
});

test('Unsinn in der Ergebnisliste zählt nicht mit', () => {
  const stand = punktestand([45, 'nein', null, -2, 60, NaN, undefined]);
  assert.equal(stand.punkte, 52.5);
  assert.equal(stand.aus, 2);
});

test('standMit beantwortet die Frage vor dem Rennen', () => {
  // "Was muss ich fahren, damit es besser wird?"
  const s = standMit([45, 60], 30);
  assert.equal(s.vorher.punkte, 52.5);
  assert.equal(s.nachher.punkte, 37.5);   // (30 + 45) / 2
  assert.equal(s.verbesserung, 15);

  // Ein schlechteres Ergebnis als die zwei besten ändert nichts.
  const ohne = standMit([45, 60], 90);
  assert.equal(ohne.nachher.punkte, 52.5);
  assert.equal(ohne.verbesserung, 0);
});

test('zeitFuerPunkte rechnet die Formel rückwärts', () => {
  // Aus P = F·Tx/To − F folgt Tx = To · (P + F) / F.
  const zeit = zeitFuerPunkte(50.5, 60, 'RS');
  assert.equal(zeit, 63);

  // Und zurück ergibt wieder denselben Punktwert.
  assert.equal(rennpunkte(zeit, 60, 'RS'), 50.5);

  // Null Punkte heisst: Siegerzeit.
  assert.equal(zeitFuerPunkte(0, 60, 'RS'), 60);

  assert.equal(zeitFuerPunkte(50, 60, 'XX'), null);
  assert.equal(zeitFuerPunkte(-1, 60, 'RS'), null);
});

test('ein Athlet hat einen Stand je Disziplin, nicht einen einzigen', () => {
  // Im Slalom stark und in der Abfahrt schwach zu sein ist der
  // Normalfall — ein zusammengerechneter Wert wäre bedeutungslos.
  const stand = standJeDisziplin([
    { disziplin: 'SL', punkte: 30 },
    { disziplin: 'SL', punkte: 40 },
    { disziplin: 'DH', punkte: 120 },
    { disziplin: 'XX', punkte: 10 },     // keine Disziplin
    { disziplin: 'RS', punkte: 'viel' }, // keine Zahl
  ]);

  assert.equal(stand.SL.punkte, 35);
  assert.equal(stand.SL.vorlaeufig, false);
  assert.equal(stand.DH.punkte, 120);
  assert.equal(stand.DH.vorlaeufig, true);
  assert.ok(!('XX' in stand));
  assert.ok(!('RS' in stand));
});

test('die Disziplinfaktoren stimmen und sind unveränderlich', () => {
  assert.equal(F_FAKTOR.SL, 730);
  assert.equal(F_FAKTOR.RS, 1010);
  assert.equal(F_FAKTOR.SG, 1190);
  assert.equal(F_FAKTOR.DH, 1250);
  assert.throws(() => { F_FAKTOR.SL = 1; }, TypeError);
});
