/* Kontakte und Verteiler — die Logik, ohne DOM und ohne Firebase. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kontaktSauber, pruefeKontakt, verteiler, ohneAdresse, mailtoAdresse,
  istEmail, ELTERN_MAX, GRENZEN,
} from '../assets/js/kontakte.js';

test('ein Kontakt wird getrimmt, gekuerzt und ohne leere Felder gespeichert', () => {
  const k = kontaktSauber({
    geburt: '2009-03-14', telefon: '  +41 79 123 45 67 ', email: ' Timo@Example.CH ',
    adresse: '', notiz: 'Allergie: Nüsse\nNotfall: Mutter',
    eltern: [
      { name: ' Anna van Zanten ', beziehung: 'Mutter', email: 'ANNA@example.ch', telefon: '' },
      { name: '', beziehung: '', email: '', telefon: '' },     // leere Formularzeile
    ],
  });
  assert.deepEqual(k, {
    geburt: '2009-03-14',
    telefon: '+41 79 123 45 67',
    email: 'timo@example.ch',
    notiz: 'Allergie: Nüsse\nNotfall: Mutter',
    eltern: [{ name: 'Anna van Zanten', beziehung: 'Mutter', email: 'anna@example.ch' }],
  });
});

test('hoechstens vier Eltern, und jedes Feld hat seine Grenze', () => {
  const viele = Array.from({ length: 7 }, (_, i) => ({ name: `Person ${i}` }));
  assert.equal(kontaktSauber({ eltern: viele }).eltern.length, ELTERN_MAX);
  assert.equal(kontaktSauber({ notiz: 'x'.repeat(900) }).notiz.length, GRENZEN.notiz);
  assert.equal(kontaktSauber({ geburt: '14.03.2009' }).geburt, undefined, 'nur JJJJ-MM-TT');
  assert.deepEqual(kontaktSauber({}), {});
  assert.deepEqual(kontaktSauber(), {});
});

test('eine vertippte Adresse faellt auf, bevor sie im Verteiler landet', () => {
  assert.equal(istEmail('anna@example.ch'), true);
  assert.equal(istEmail('anna.muster@gmail'), false, 'ohne Endung');
  assert.equal(istEmail('anna muster@gmail.com'), false);
  assert.equal(istEmail('a@b.c'), false);
  const fehler = pruefeKontakt(kontaktSauber({ email: 'timo@', eltern: [{ name: 'A', email: 'a@b' }] }));
  assert.equal(fehler.length, 2);
  assert.equal(pruefeKontakt(kontaktSauber({ geburt: '2099-01-01' })).length, 1);
});

const kader = [
  { uid: 'timo', email: 'timo@example.ch', eltern: [{ email: 'anna@example.ch' }, { email: 'MICHEL@example.ch' }] },
  { uid: 'lena', eltern: [{ email: 'papa.lena@example.ch' }, { email: 'kaputt@' }] },
  { uid: 'noah', email: 'noah@example.ch' },
  { uid: 'mia' },
];

test('der Verteiler an alle, nur an die Eltern, nur an die Athleten', () => {
  assert.deepEqual(verteiler(kader, 'alle'),
    ['anna@example.ch', 'michel@example.ch', 'noah@example.ch', 'papa.lena@example.ch', 'timo@example.ch']);
  assert.deepEqual(verteiler(kader, 'eltern'), ['anna@example.ch', 'michel@example.ch', 'papa.lena@example.ch']);
  assert.deepEqual(verteiler(kader, 'athleten'), ['noah@example.ch', 'timo@example.ch']);
  /* Dieselbe Adresse zweimal (ein Elternteil mit zwei Kindern im Kader)
     bekommt die Mail einmal. */
  assert.deepEqual(verteiler([{ eltern: [{ email: 'a@x.ch' }] }, { eltern: [{ email: 'A@x.ch' }] }]), ['a@x.ch']);
});

test('wer im Verteiler fehlt, wird genannt — damit man die Daten nachtraegt', () => {
  const mitglieder = kader.map(k => ({ uid: k.uid }));
  assert.deepEqual(ohneAdresse(mitglieder, kader, 'alle').map(m => m.uid), ['mia']);
  assert.deepEqual(ohneAdresse(mitglieder, kader, 'eltern').map(m => m.uid), ['noah', 'mia']);
  assert.deepEqual(ohneAdresse([{ uid: 'neu' }], kader, 'alle').map(m => m.uid), ['neu'],
    'wer noch gar keine Kontaktkarte hat, fehlt auch');
});

test('die Mail geht an alle im BCC — die Eltern sehen einander nicht', () => {
  const adresse = mailtoAdresse(['anna@example.ch', 'papa+lena@example.ch'], { betreff: 'Lager Saas-Fee' });
  assert.match(adresse, /^mailto:\?bcc=/);
  assert.doesNotMatch(adresse, /[?&]to=/, 'niemand steht offen im An-Feld');
  const q = new URLSearchParams(adresse.slice('mailto:?'.length));
  assert.deepEqual(q.get('bcc').split(','), ['anna@example.ch', 'papa+lena@example.ch']);
  assert.equal(q.get('subject'), 'Lager Saas-Fee');
  assert.equal(mailtoAdresse([]), 'mailto:?');
});
