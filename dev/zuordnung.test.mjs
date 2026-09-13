/* Wem gehört eine Excel? (assets/js/zuordnung.js, v.35.43.0)

   Die Kadervorlage schreibt "Name: Van Zanten Timothy", in Firn heisst
   dasselbe Mitglied "Timothy", "Timothy van Zanten" oder "Timo". Die
   wichtigste Zusage steht im letzten Test: passen zwei gleich gut,
   schlägt Firn niemanden vor. Lieber einmal fragen als einem Athleten
   den Plan eines anderen geben. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { namensTeile, passendesMitglied } from '../assets/js/zuordnung.js';

const KADER = [
  { uid: 'michel', name: 'Michel van Zanten' },
  { uid: 'timo', name: 'Timothy van Zanten' },
  { uid: 'lea', name: 'Lea Müller' },
  { uid: 'noah', name: 'Noah' },
];
const wer = name => passendesMitglied(name, KADER);

test('Namen werden vergleichbar: klein, Umlaute als ae/oe/ue, Akzente weg, Bindestrich trennt', () => {
  assert.deepEqual(namensTeile('Léa-Sophie MÜLLER'), ['lea', 'sophie', 'mueller']);
  assert.deepEqual(namensTeile('  van   Zanten, Timothy '), ['van', 'zanten', 'timothy']);
  assert.deepEqual(namensTeile(''), []);
  assert.deepEqual(namensTeile(null), []);
});

test('Nachname zuerst oder zuletzt — die Reihenfolge zählt nicht', () => {
  assert.deepEqual(wer('Van Zanten Timothy'), { uid: 'timo', grund: 'passt' });
  assert.deepEqual(wer('Timothy van Zanten'), { uid: 'timo', grund: 'passt' });
  assert.deepEqual(wer('Mueller Lea'), { uid: 'lea', grund: 'passt' }, 'ue in der Excel, ü in Firn');
  assert.deepEqual(wer('MÜLLER Léa'), { uid: 'lea', grund: 'passt' });
});

test('ein Teil des Namens reicht, wenn er eindeutig ist — auch als Kurzform', () => {
  assert.deepEqual(wer('Noah Keller'), { uid: 'noah', grund: 'passt' }, 'das Mitglied heisst nur "Noah"');
  assert.deepEqual(wer('Timo'), { uid: 'timo', grund: 'passt' }, '"Timo" ist Timothy');
  assert.deepEqual(wer('Van Zanten Michel'), { uid: 'michel', grund: 'passt' },
    'derselbe Familienname führt nicht zum falschen van Zanten');
});

test('ohne Namen, mit unbekanntem Namen, mit zu kurzer Kurzform: kein Vorschlag', () => {
  assert.deepEqual(wer(''), { uid: null, grund: 'ohneName' });
  assert.deepEqual(wer('Muster Max'), { uid: null, grund: 'unbekannt' });
  assert.deepEqual(passendesMitglied('Le', [{ uid: 'lea', name: 'Lea' }]), { uid: null, grund: 'unbekannt' },
    'zwei Buchstaben wären "Le" in Lea und Leo');
  assert.deepEqual(passendesMitglied('Timothy', [{ uid: 'x', name: '' }]), { uid: null, grund: 'unbekannt' });
});

test('passen zwei gleich gut, schlägt Firn niemanden vor', () => {
  assert.deepEqual(wer('van Zanten'), { uid: null, grund: 'mehrdeutig' }, 'nur der Familienname: Michel oder Timothy?');
  assert.deepEqual(passendesMitglied('Lea', [{ uid: 'a', name: 'Lea Meier' }, { uid: 'b', name: 'Lea Graf' }]),
    { uid: null, grund: 'mehrdeutig' });
  /* Der bessere gewinnt: der ganze Name vor einem Teil. */
  assert.deepEqual(passendesMitglied('Lea Graf', [{ uid: 'a', name: 'Lea' }, { uid: 'b', name: 'Lea Graf' }]),
    { uid: 'b', grund: 'passt' });
});
