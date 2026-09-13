/* Der Wochenplan, geprüft an der echten Kadervorlage.

   dev/fixtures/kw31-grid.json ist Timothys Woche, so wie sie aus der
   Excel kommt. Erfundene Daten würden hier nichts beweisen: die Fälle,
   die weh tun, stehen genau darin — zwei Einträge in einem Slot, ein
   Eintrag ohne Blatt ("evtl. Spiel"), ein leerer Sonntag, und dieselbe
   Einheit an zwei Tagen derselben Woche.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseProgram } from '../assets/js/training-parser.js';
import {
  wochenTage, tagFuer, standardTag, nachDatum,
  eintragFortschritt, tagPunkte, wochenKopf, einheitZiel,
  planZusammenfassung, planTitelVorschlag,
} from '../assets/js/wochenplan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
const programm = parseProgram(grid);
const tage = wochenTage(programm);

const tag = key => tage.find(t => t.key === key);

test('die Woche hat sieben Tage mit Datum, in der Reihenfolge der Woche', () => {
  assert.equal(tage.length, 7);
  assert.deepEqual(tage.map(t => t.key), ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']);
  assert.equal(tage[0].datum, '2026-08-03');
  assert.equal(tage[6].datum, '2026-08-09');
});

test('der Slot wird zur Beschriftung des Eintrags, nicht zu einem Behälter', () => {
  /* Der Parser schachtelt Tag → Slot → Eintrag. Zum Zeichnen ist
     "Vormittag" aber ein Wort am Eintrag, kein Kasten drumherum. */
  const di = tag('di');
  assert.deepEqual(di.eintraege.map(e => [e.slot, e.titel]), [
    ['Vormittag', 'Kraft Beine'],
    ['Nachmittag', 'Fußgymnastik'],
    ['Nachmittag', 'Mobi'],
  ]);
});

test('ein Eintrag ohne Blatt bleibt stehen und wird nicht stillschweigend verschluckt', () => {
  /* "evtl. Spiel (Tennis, Volleyball,…)" hat kein Einheitenblatt. Das
     ist keine Lücke im Import, sondern eine Ansage des Trainers — sie
     gehört in die Woche, nur ohne Weg in den Player. */
  const spiel = tag('do').eintraege.find(e => e.titel.startsWith('evtl. Spiel'));
  assert.ok(spiel, 'der Eintrag ohne Blatt fehlt in der Woche');
  assert.equal(spiel.unit, '');

  const koordination = tag('mo').eintraege.find(e => e.titel === 'Koordination');
  assert.ok(koordination);
  assert.equal(koordination.unit, '');
});

test('ein Ruhetag ist ein Tag ohne Einträge, kein fehlender Tag', () => {
  assert.equal(tag('so').eintraege.length, 0);
});

test('beim Öffnen steht heute vorn, wenn die Woche heute enthält', () => {
  assert.equal(standardTag(tage, '2026-08-05'), 'mi');
  assert.equal(tagFuer(tage, '2026-08-05').name, 'Mittwoch');
  assert.equal(tagFuer(tage, '2026-01-01'), null);
});

test('eine fremde Woche öffnet auf dem ersten Tag mit Inhalt, nicht auf einem leeren', () => {
  /* Eine vergangene oder künftige Woche enthält heute nicht. Auf dem
     Sonntag zu landen wäre die schlechteste Antwort — der ist leer. */
  assert.equal(standardTag(tage, '2020-01-01'), 'mo');

  const nurLeerVorn = [
    { key: 'so', name: 'Sonntag', datum: '', eintraege: [] },
    { key: 'mo', name: 'Montag', datum: '', eintraege: [{ titel: 'Kraft', unit: 'kraft' }] },
  ];
  assert.equal(standardTag(nurLeerVorn, '2020-01-01'), 'mo');
  assert.equal(standardTag([], '2020-01-01'), '');
});

test('der Fortschritt kommt aus dem Protokoll DES TAGES', () => {
  /* Kraft Beine steht am Dienstag und am Samstag. Beides ist dieselbe
     Einheit, aber nicht dasselbe Training — die Protokolle hängen an
     verschiedenen Tagen und dürfen sich nicht vermischen. */
  const items = programm.units['kraft-beine'].items;
  const protokolle = nachDatum([
    { datum: '2026-08-04', units: { 'kraft-beine': { items: Object.fromEntries(
      items.map(i => [i.key, { done: true }])) } } },
  ]);

  const di = tag('di').eintraege[0];
  const sa = tag('sa').eintraege[0];
  assert.equal(di.unit, 'kraft-beine');
  assert.equal(sa.unit, 'kraft-beine');

  const fDi = eintragFortschritt(programm, di, '2026-08-04', protokolle);
  const fSa = eintragFortschritt(programm, sa, '2026-08-08', protokolle);
  assert.equal(fDi.fertig, true);
  assert.equal(fSa.erledigt, 0);
  assert.equal(fSa.fertig, false);
});

test('ein Eintrag ohne Blatt hat keinen Fortschritt, nicht null Prozent', () => {
  /* 0/0 wäre eine Behauptung über etwas, das die App nicht kennt. */
  const spiel = tag('do').eintraege.find(e => e.titel.startsWith('evtl. Spiel'));
  assert.equal(eintragFortschritt(programm, spiel, '2026-08-06', {}), null);
});

test('der Wochenstreifen zeigt einen Punkt je Eintrag mit Blatt', () => {
  const punkte = tagPunkte(programm, tag('do'), {});
  /* Donnerstag: Ausdauer, Neuroathletik, evtl. Spiel — der letzte
     zählt nicht mit, weil es dazu nichts abzuhaken gibt. */
  assert.equal(tag('do').eintraege.length, 3);
  assert.equal(punkte.length, 2);
  assert.deepEqual(punkte.map(p => p.fertig), [false, false]);
  assert.deepEqual(tagPunkte(programm, tag('so'), {}), []);
});

test('der Kopf nennt Woche und Athlet, aber formatiert kein Datum', () => {
  /* Formate laufen über Intl und damit in der Ansicht — ein Modul,
     das keine Sprache kennt, darf keinen Datumssatz bauen. */
  const kopf = wochenKopf(programm);
  assert.equal(kopf.kw, 31);
  assert.equal(kopf.tw, 12);
  assert.equal(kopf.von, '2026-08-03');
  assert.equal(kopf.bis, '2026-08-09');
  assert.equal(kopf.athlet, 'Van Zanten Timothy');
  for (const wert of Object.values(kopf)) {
    assert.doesNotMatch(String(wert), /\d{1,2}\.\d{1,2}\./, 'hier wird formatiert');
  }
});

test('das Ziel trägt den geplanten Tag mit, nicht den Tag des Antippens', () => {
  /* Sonst stünde eine am Mittwoch nachgeholte Dienstagseinheit für
     immer als offen im Dienstag. */
  const di = tag('di').eintraege[0];
  const ziel = einheitZiel('g1', 'p1', di, '2026-08-04');
  const q = new URLSearchParams(ziel.split('?')[1]);
  assert.equal(ziel.startsWith('./einheit.html?'), true);
  assert.equal(q.get('g'), 'g1');
  assert.equal(q.get('p'), 'p1');
  assert.equal(q.get('u'), 'kraft-beine');
  assert.equal(q.get('d'), '2026-08-04');
});

test('Sonderzeichen in Kennungen kommen kodiert im Ziel an', () => {
  const ziel = einheitZiel('g 1&x', 'p/2', { unit: 'kraft beine' }, '2026-08-04');
  assert.doesNotMatch(ziel.split('?')[1].replace(/%../g, ''), /[&][^a-z]|[ /]/);
  const q = new URLSearchParams(ziel.split('?')[1]);
  assert.equal(q.get('g'), 'g 1&x');
  assert.equal(q.get('u'), 'kraft beine');
});

test('ein leeres oder kaputtes Programm ergibt eine leere Woche, keinen Fehler', () => {
  /* Ein Plan aus einer künftigen Schema-Fassung darf die Gruppenseite
     nicht mitreissen — sie zeigt dann nichts, und das ist richtig. */
  for (const murks of [null, undefined, {}, { days: null }, { days: [{}] }]) {
    assert.doesNotThrow(() => wochenTage(murks));
  }
  assert.deepEqual(wochenTage({ days: [{}] }), []);
  assert.deepEqual(wochenKopf(null), {
    kw: null, tw: null, von: '', bis: '', athlet: '', label: '',
  });
});


test('die Vorschau zeigt, was die Datei enthaelt, bevor der Kader sie bekommt', () => {
  const z = planZusammenfassung(programm);
  assert.equal(z.kw, 31);
  assert.equal(z.einheiten, 8);
  assert.ok(z.uebungen > 20, `nur ${z.uebungen} Uebungen gezaehlt`);
  assert.equal(z.tage.length, 7);
  assert.deepEqual(z.tage[1].titel, ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
  assert.deepEqual(z.tage[6].titel, [], 'der Sonntag ist frei');
  /* Was im Wochenplan steht, aber kein Blatt hat — die Stelle, an der
     sich ein Tippfehler in der Vorlage zeigt. */
  assert.ok(z.ohneBlatt.includes('Koordination'));
  assert.ok(z.ohneBlatt.some(t => t.startsWith('evtl. Spiel')));
});

test('der Titel kommt aus der Woche, nicht von der Tastatur', () => {
  assert.equal(planTitelVorschlag(programm), 'KW 31 · TW 12');
  assert.equal(planTitelVorschlag({ kw: 36 }), 'KW 36');
  assert.equal(planTitelVorschlag({ weekLabel: 'Aufbauwoche' }), 'Aufbauwoche');
  assert.equal(planTitelVorschlag(null), '');
});

test('der Player fuehrt zurueck, woher man kam — aber nur an bekannte Orte', async () => {
  const { rueckweg, RUECKWEGE } = await import('../assets/js/wochenplan.js');
  assert.equal(rueckweg('training'), './training.html');
  assert.equal(rueckweg('gruppe'), './gruppe.html');
  /* Die Adresse ist sichtbar und aenderbar. Ein freier Pfad darin waere
     ein Weg, jemanden anderswohin zu schicken. */
  for (const fremd of ['https://boese.example', '../../login.html', 'javascript:alert(1)', '', null, undefined]) {
    assert.equal(rueckweg(fremd), './gruppe.html', String(fremd));
  }
  assert.equal(Object.isFrozen(RUECKWEGE), true);

  const ziel = new URLSearchParams(einheitZiel('g', 'p', { unit: 'u' }, '2026-08-04', 'training').split('?')[1]);
  assert.equal(ziel.get('z'), 'training');
  const fremdZiel = new URLSearchParams(einheitZiel('g', 'p', { unit: 'u' }, '2026-08-04', 'https://x').split('?')[1]);
  assert.equal(fremdZiel.has('z'), false, 'ein unbekannter Rueckweg kommt gar nicht erst in die Adresse');
});

/* ── Die Woche als Kalender (v.35.42.0) ───────────────────────────── */

const W = await import('../assets/js/wochenplan.js');
const quelle = (id, fuer, erstelltAm, prog = programm) => ({ gid: 'g1', plan: { id, fuer, erstelltAm }, programm: prog });

test('Kalenderrechnung: Montag, sieben Tage, ISO-Woche, Jahreswechsel', () => {
  assert.equal(W.montagVon('2026-08-05'), '2026-08-03');
  assert.equal(W.montagVon('2026-08-09'), '2026-08-03', 'der Sonntag gehört zur Woche davor');
  assert.equal(W.montagVon('2026-01-01'), '2025-12-29');
  assert.deepEqual(W.wocheAb('2026-08-03'), ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']);
  assert.equal(W.plusTage('2026-03-28', 2), '2026-03-30', 'die Zeitumstellung verschiebt keinen Tag');
  assert.equal(W.kwVon('2026-08-03'), 32);
  assert.equal(W.kwVon('2027-01-03'), 53);
  assert.equal(W.montagDerKw(2026, 32), '2026-08-03');
});

test('ein Plan ohne Zeitraum liegt in der KW, die er nennt', () => {
  const ohneDatum = { ...programm, dateRange: {}, days: programm.days.map(d => ({ ...d, date: '' })) };
  const tage2 = W.planTageMitDatum(ohneDatum, '2026-05-01');
  assert.equal(tage2[0].datum, W.montagDerKw(2026, 31));
  assert.equal(W.planTageMitDatum({ ...ohneDatum, kw: null }, '2026-05-01').length, 0, 'ohne Datum und KW kein Platz im Kalender');
});

test('die Woche sammelt die Tage aller Pläne und die Termine; mehrtägige an jedem Tag', () => {
  const termine = [
    { id: 'a', von: '2026-08-06', zeit: '18:00', titel: 'spät' },
    { id: 'b', von: '2026-08-06', zeit: '07:00', titel: 'früh' },
    { id: 'l', von: '2026-08-08', bis: '2026-08-10', titel: 'Lager' },
  ];
  const woche = W.agendaTage({ montag: '2026-08-03', quellen: [quelle('p1', 'alle')], termine, heute: '2026-08-05' });
  assert.equal(woche.length, 7);
  assert.equal(woche.find(t => t.heute).datum, '2026-08-05');
  assert.deepEqual(woche[3].termine.map(t => t.titel), ['früh', 'spät'], 'nach Uhrzeit');
  assert.deepEqual(woche.filter(t => t.termine.some(x => x.id === 'l')).map(t => t.datum), ['2026-08-08', '2026-08-09']);
  assert.deepEqual(woche[1].eintraege.map(e => e.titel), ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
  assert.equal(woche[1].eintraege[0].planId, 'p1');
  const naechste = W.agendaTage({ montag: '2026-08-10', quellen: [quelle('p1', 'alle')], termine });
  assert.equal(naechste[0].termine[0]?.id, 'l', 'das Lager läuft in die nächste Woche hinein');
  assert.equal(naechste.every(t => !t.eintraege.length), true);
});

test('dieselbe Woche zweimal eingelesen: der neuere Plan gewinnt — für alle und für Timo stehen beide', () => {
  const alt = quelle('alt', 'alle', { seconds: 100 });
  const neu = quelle('neu', 'alle', { seconds: 200 });
  const timo = quelle('timo', 'timo', { seconds: 50 });
  const mi = W.agendaTage({ montag: '2026-08-03', quellen: [neu, alt, timo] })[2];
  assert.deepEqual([...new Set(mi.eintraege.map(e => e.planId))].sort(), ['neu', 'timo']);
});

test('die Startwoche: heute, wenn darin etwas steht — sonst die Woche des Plans', () => {
  const q = [quelle('p1', 'alle')];
  assert.equal(W.startWoche({ heute: '2026-08-05', quellen: q }), '2026-08-03');
  assert.equal(W.startWoche({ heute: '2026-09-13', quellen: q }), '2026-08-03', 'die vergangene Excel');
  assert.equal(W.startWoche({ heute: '2026-07-01', quellen: q }), '2026-08-03', 'die kommende Excel');
  assert.equal(W.startWoche({ heute: '2026-09-13', quellen: q, termine: [{ von: '2026-09-10' }] }), '2026-09-07',
    'ein Termin diese Woche hält die Woche');
  assert.equal(W.startWoche({ heute: '2026-09-13' }), '2026-09-07');
});

test('"Als Nächstes" ist der erste Termin nach der Woche', () => {
  const termine = [{ id: 'x', von: '2026-08-06' }, { id: 'z', von: '2026-08-30' }, { id: 'y', von: '2026-08-20', zeit: '09:00' }];
  assert.equal(W.naechsterNach(termine, '2026-08-03').id, 'y');
  assert.equal(W.naechsterNach(termine, '2026-08-31'), null);
});
