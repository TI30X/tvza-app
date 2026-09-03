/* Tests für worker/ics.js.
 *
 * Reines Modul, also echte Tests. Geprüft wird vor allem das, woran
 * ICS-Erzeugung regelmässig scheitert und was man erst merkt, wenn ein
 * Elternteil sich beschwert:
 *
 *   - DTEND ist AUSSCHLIESSEND. Ein Lager wäre sonst immer einen Tag
 *     zu kurz.
 *   - Zeilen über 75 OKTETTE müssen gefaltet werden, und Umlaute
 *     zählen doppelt.
 *   - Komma, Semikolon und Backslash im Titel müssen maskiert werden,
 *     sonst zerreisst das Feld.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE, maskiere, falte, tagDanach, alsUtcStempel, alsVEvent, alsKalender,
} from '../worker/ics.js';

const JETZT = new Date('2026-09-03T12:00:00Z');

const training = {
  id: 'e1', art: 'training', titel: 'Kraft Beine',
  von: '2026-09-08', zeit: '14:00', ort: 'Kraftraum',
};
const lager = {
  id: 'e2', art: 'lager', titel: 'Schneelager Saas-Fee',
  von: '2026-10-03', bis: '2026-10-10', ort: 'Saas-Fee',
};

const zeilen = text => text.split('\r\n');
const feld = (text, name) => zeilen(text).find(z => z.startsWith(name));

test('ein Lager endet in ICS am Tag NACH dem letzten Tag', () => {
  // Der klassische Fehler: DTEND ist ausschliessend. Ein Lager vom 3.
  // bis 10. Oktober endet am 11. — sonst fehlt im Kalender der letzte
  // Tag, und zwar jedes Mal.
  const ev = alsVEvent(lager, { gid: 'g1', jetzt: JETZT }).join('\r\n');

  assert.match(ev, /DTSTART;VALUE=DATE:20261003/);
  assert.match(ev, /DTEND;VALUE=DATE:20261011/);
});

test('tagDanach rechnet über Monats- und Jahresgrenzen', () => {
  assert.equal(tagDanach('2026-10-03'), '2026-10-04');
  assert.equal(tagDanach('2026-10-31'), '2026-11-01');
  assert.equal(tagDanach('2026-12-31'), '2027-01-01');
  // Schaltjahr.
  assert.equal(tagDanach('2028-02-28'), '2028-02-29');
  assert.equal(tagDanach('2028-02-29'), '2028-03-01');
  assert.equal(tagDanach('kein Datum'), '');
});

test('ein eintägiger Termin ohne Uhrzeit ist ganztägig, nicht mitternächtlich', () => {
  const ohneZeit = { id: 'e3', titel: 'Ruhetag', von: '2026-09-09' };
  const ev = alsVEvent(ohneZeit, { jetzt: JETZT }).join('\r\n');

  assert.match(ev, /DTSTART;VALUE=DATE:20260909/);
  assert.match(ev, /DTEND;VALUE=DATE:20260910/);
  assert.doesNotMatch(ev, /T000000/);
});

test('ein Training mit Uhrzeit bekommt eine Zeitzone', () => {
  // Das Modell speichert 'HH:MM' ohne Zone. Ohne TZID rutscht ein
  // Training um eine oder zwei Stunden, je nach Sommerzeit.
  const ev = alsVEvent(training, { gid: 'g1', jetzt: JETZT }).join('\r\n');

  assert.match(ev, new RegExp(`DTSTART;TZID=${ZONE}:20260908T140000`));
  // Ohne Endzeit im Modell: zwei Stunden. Besser als ein Termin ohne
  // Dauer, den manche Kalender als ganztägig zeichnen.
  assert.match(ev, new RegExp(`DTEND;TZID=${ZONE}:20260908T160000`));
});

test('die UID bleibt über Aktualisierungen dieselbe', () => {
  // Sonst legt der Kalender bei jedem Abruf neue Termine an, statt die
  // alten zu ändern — und der Abonnent hat den Plan dreifach.
  const a = alsVEvent(training, { gid: 'g1', jetzt: JETZT }).join('\r\n');
  const b = alsVEvent(training, { gid: 'g1', jetzt: new Date('2027-01-01T00:00:00Z') }).join('\r\n');

  assert.match(a, /UID:e1@g1/);
  assert.equal(feld(a, 'UID:'), feld(b, 'UID:'));
  // DTSTAMP darf sich ändern, die UID nicht.
  assert.notEqual(feld(a, 'DTSTAMP:'), feld(b, 'DTSTAMP:'));
});

test('Sonderzeichen im Titel zerreissen das Feld nicht', () => {
  const heikel = {
    id: 'e4', titel: 'Kraft, Rumpf; Mobi \\ Test',
    von: '2026-09-08', notiz: 'Zeile eins\nZeile zwei',
  };
  const ev = alsVEvent(heikel, { jetzt: JETZT }).join('\r\n');

  assert.match(ev, /SUMMARY:Kraft\\, Rumpf\\; Mobi \\\\ Test/);
  assert.match(ev, /DESCRIPTION:Zeile eins\\nZeile zwei/);
  // Und kein echter Umbruch mitten im Feld.
  assert.equal(maskiere('a\nb'), 'a\\nb');
  assert.equal(maskiere('a\r\nb'), 'a\\nb');
});

test('Zeilen werden nach Oktetten gefaltet, nicht nach Zeichen', () => {
  // Ein Umlaut braucht zwei Oktette. Wer nach Zeichen faltet,
  // produziert bei einem Titel voller Umlaute zu lange Zeilen — und
  // ein strenger Parser zeigt dann gar nichts an.
  const kurz = 'SUMMARY:kurz';
  assert.equal(falte(kurz), kurz);

  const lang = `SUMMARY:${'ä'.repeat(60)}`;   // 8 + 120 Oktette
  const gefaltet = falte(lang);
  const teile = gefaltet.split('\r\n');

  assert.ok(teile.length > 1, 'muss gefaltet werden');
  for (const t of teile) {
    assert.ok(new TextEncoder().encode(t).length <= 75,
      `Zeile zu lang: ${new TextEncoder().encode(t).length} Oktette`);
  }
  // Jede Folgezeile beginnt mit genau einem Leerzeichen.
  for (const t of teile.slice(1)) assert.match(t, /^ [^ ]/);
  // Und zusammengesetzt ergibt es wieder das Original.
  assert.equal(teile.map((t, i) => (i ? t.slice(1) : t)).join(''), lang);
});

test('kein Mehrbyte-Zeichen wird in der Mitte getrennt', () => {
  const lang = `SUMMARY:${'ö'.repeat(80)}`;
  for (const t of falte(lang).split('\r\n')) {
    // Ein zerschnittenes UTF-8-Zeichen ergäbe ein Ersatzzeichen.
    assert.doesNotMatch(t, /�/);
  }
});

test('unbrauchbare Termine kommen nicht in den Kalender', () => {
  assert.equal(alsVEvent(null, {}), null);
  assert.equal(alsVEvent({ titel: 'ohne id', von: '2026-09-08' }, {}), null);
  assert.equal(alsVEvent({ id: 'x', von: '2026-09-08' }, {}), null, 'ohne Titel');
  assert.equal(alsVEvent({ id: 'x', titel: 'y', von: '8.9.2026' }, {}), null, 'unlesbares Datum');
  assert.equal(alsVEvent({ id: 'x', titel: '   ', von: '2026-09-08' }, {}), null);
});

test('der Kalender hat Kopf, Zone und CRLF', () => {
  const text = alsKalender({ name: 'Ski Team Malbun', gid: 'g1', termine: [training, lager], jetzt: JETZT });

  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /VERSION:2\.0/);
  assert.match(text, /X-WR-CALNAME:Ski Team Malbun/);
  assert.match(text, /END:VCALENDAR\r\n$/);

  // Nur CRLF, nie ein einzelnes LF.
  assert.doesNotMatch(text.replace(/\r\n/g, ''), /\n/);

  // Die Zone muss mitgeliefert werden, sonst rät der Client.
  assert.match(text, /BEGIN:VTIMEZONE/);
  assert.match(text, new RegExp(`TZID:${ZONE}`));
  assert.match(text, /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU/);
  assert.match(text, /RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU/);
});

test('jedes VEVENT ist geschlossen, und die Zahl stimmt', () => {
  const text = alsKalender({ termine: [training, lager, { id: 'x' }], jetzt: JETZT });

  const auf = (text.match(/BEGIN:VEVENT/g) || []).length;
  const zu = (text.match(/END:VEVENT/g) || []).length;
  assert.equal(auf, zu);
  assert.equal(auf, 2, 'der unbrauchbare Termin fällt heraus');
});

test('die Wortwahl der Gruppenart kommt von aussen', () => {
  // Der Worker soll termine.js nicht importieren müssen: ein Gym-Kurs
  // heisst "Kurs", ein Kader-Training "Training", und ics.js weiss von
  // beidem nichts.
  const text = alsKalender({
    termine: [training],
    artWort: art => (art === 'training' ? 'Kurs' : ''),
    jetzt: JETZT,
  });
  assert.match(text, /SUMMARY:Kraft Beine \(Kurs\)/);

  // Ohne Wortgeber steht nur der Titel da.
  assert.match(alsKalender({ termine: [training], jetzt: JETZT }), /SUMMARY:Kraft Beine\r\n/);
});

test('ein leerer Kalender ist gültig, nicht leer', () => {
  // Eine Gruppe ohne Termine muss trotzdem eine abonnierbare Adresse
  // haben — sonst bricht das Abo, sobald der letzte Termin vorbei ist.
  const text = alsKalender({ name: 'Neu', termine: [], jetzt: JETZT });
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.match(text, /END:VCALENDAR/);
  assert.doesNotMatch(text, /BEGIN:VEVENT/);
});

test('alsUtcStempel liefert die Form, die RFC 5545 verlangt', () => {
  assert.equal(alsUtcStempel(JETZT), '20260903T120000Z');
  assert.match(alsUtcStempel(new Date()), /^\d{8}T\d{6}Z$/);
});
