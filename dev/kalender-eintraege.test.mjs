/* Die Einträge des Kalenders (assets/js/feature/kalender/eintraege.js,
   v.35.49.0).

   Bis dahin rechnete der Kalender jeden Eintrag in eine Liste je Tag um:
   ein Lager von vier Tagen stand viermal in der Liste und als vier
   Schnipsel im Monat, und zwei Termine um 18:00 lagen in der Woche genau
   übereinander. Diese Tests halten fest, dass ein Eintrag ein Zeitraum
   ist — und was die drei Ansichten daraus machen. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tageZwischen, minutenVon, sammeln, agenda, monatsWochen, zeitRaster,
  ausTeamTermin, ausReise, ausTag, ausErinnerung, ganztaegig, stopsAm,
} from '../assets/js/feature/kalender/eintraege.js';

const KADER = { id: 'g1', name: 'BSV Perspektivkader', art: 'kader' };
const lager = { id: 't2', art: 'lager', titel: 'Herbstlager Saas-Fee', von: '2026-09-18', bis: '2026-09-21', zeit: '08:00', ort: 'Saas-Fee' };
const kondi = { id: 't1', art: 'training', titel: 'Kondi Halle', von: '2026-09-15', zeit: '18:00', ort: 'Malbun' };

function alle(extra = {}) {
  return sammeln({
    tage: [{ id: 'd1', title: 'Konzert', date: '2026-09-15', startTime: '18:30', endTime: '21:00' }],
    erinnerungen: [
      { id: 'r1', title: 'Rechnung', date: '2026-09-14' },
      { id: 'r2', title: 'Erledigt', date: '2026-09-15', completed: true },
    ],
    reisen: [],
    teams: [{ gruppe: KADER, termine: [lager, kondi] }],
    farbePersoenlich: '#7f77dd',
    farbeVon: () => '#1d9e75',
    nameVon: () => 'Familie',
    ...extra,
  });
}

test('Tage und Zeiten', () => {
  assert.equal(tageZwischen('2026-09-18', '2026-09-21'), 3);
  assert.equal(tageZwischen('2026-10-24', '2026-10-26'), 2, 'über die Zeitumstellung');
  assert.equal(tageZwischen('2026-12-31', '2027-01-01'), 1);
  assert.equal(minutenVon('18:30'), 1110);
  assert.equal(minutenVon('7:05'), 425);
  assert.equal(minutenVon(''), null);
  assert.equal(minutenVon('25:00'), null);
});

test('ein Lager ist EIN Eintrag über vier Tage, ohne Uhrzeit', () => {
  const e = ausTeamTermin(lager, KADER, '#1d9e75');
  assert.equal(e.von, '2026-09-18');
  assert.equal(e.bis, '2026-09-21');
  assert.equal(e.zeit, '', 'eine Anreisezeit gehört nicht an jeden Tag');
  assert.equal(e.typ, 'Trainingslager');
  assert.equal(e.quelle, 'BSV Perspektivkader');
  assert.equal(ganztaegig(e), true);
  assert.equal(ausTeamTermin({ von: 'kaputt' }, KADER, 'x'), null, 'ohne gültiges Datum kein Eintrag');
  const abgesagt = ausTeamTermin({ ...kondi, abgesagt: true }, KADER, 'x');
  assert.equal(abgesagt.abgesagt, true, 'abgesagt bleibt stehen — sonst fährt jemand hin');
});

test('ein Programm reicht über sein Von–Bis hinaus, wenn seine Punkte es tun', () => {
  const e = ausReise({
    id: 'p1', name: 'Rom', startDate: '2026-10-03', endDate: '2026-10-04', familyId: 'f',
    itinerary: [{ id: 'a', date: '2026-10-02', time: '07:00', title: 'Abflug' }, { id: 'b', date: '2026-10-05', title: 'Heim' }],
  }, '#2f6fed', 'Familie');
  assert.equal(e.von, '2026-10-02');
  assert.equal(e.bis, '2026-10-05');
  assert.deepEqual(stopsAm(e, '2026-10-02').map(s => s.id), ['a']);
});

test('eigene Termine und Erinnerungen folgen dem Schalter "Persönlich"', () => {
  const mit = alle();
  assert.ok(mit.some(e => e.art === 'tag') && mit.some(e => e.art === 'erinnerung'));
  const ohne = alle({ persoenlich: false });
  assert.equal(ohne.some(e => e.art === 'tag' || e.art === 'erinnerung'), false);
  assert.equal(ohne.length, 2, 'die Gruppe bleibt');
  assert.equal(ausTag({ id: 'x', date: '2026-01-01', endDate: '2025-01-01', title: '' }, 'c', 'P').bis, '2026-01-01',
    'ein Ende vor dem Anfang ist ein eintägiger Termin');
  assert.equal(ausErinnerung({ id: 'x', title: 'Ohne Datum' }, 'c', 'P'), null);
});

test('die Liste: ein Lager steht einmal — und heute noch einmal, solange es läuft', () => {
  const tage = agenda(alle(), { ab: '2026-09-01', heute: '2026-09-19' });
  const titelAm = tag => tage.find(t => t.tag === tag)?.eintraege.map(x => `${x.e.titel}|${x.rolle}|${x.tagNr}/${x.tage}`) || [];
  assert.deepEqual(titelAm('2026-09-18'), ['Herbstlager Saas-Fee|beginn|1/4']);
  assert.deepEqual(titelAm('2026-09-19'), ['Rechnung|ueberfaellig|1/1', 'Herbstlager Saas-Fee|laeuft|2/4'],
    'heute: die offene Erinnerung vom 14. zuerst, dann Tag 2 von 4');
  assert.deepEqual(titelAm('2026-09-20'), [], 'nicht an jedem Tag wieder');
  assert.equal(tage.filter(t => t.eintraege.some(x => x.e.id === 'team:g1:t2')).length, 2);
});

test('die Liste: heute steht immer da, leer oder nicht, und Lücken sind gezählt', () => {
  const ohneErinnerung = alle({ erinnerungen: [{ id: 'r2', title: 'Erledigt', date: '2026-09-15', completed: true }] });
  const tage = agenda(ohneErinnerung, { ab: '2026-09-01', heute: '2026-09-17' });
  const heute = tage.find(t => t.heute);
  assert.ok(heute, 'heute fehlt');
  assert.deepEqual(heute.eintraege, []);
  assert.deepEqual(tage.map(t => t.tag), ['2026-09-15', '2026-09-17', '2026-09-18']);
  assert.equal(tage[1].freiDavor, 1);
  assert.equal(tage[0].vergangen, true);
  // Am 15.: Kondi 18:00 vor Konzert 18:30, die erledigte Erinnerung am Ende.
  assert.deepEqual(tage[0].eintraege.map(x => x.e.titel), ['Kondi Halle', 'Konzert', 'Erledigt']);
});

test('die Liste: eine offene Erinnerung von früher steht bei heute, als überfällig', () => {
  const tage = agenda(alle(), { ab: '2026-09-01', heute: '2026-09-17' });
  assert.equal(tage.some(t => t.tag === '2026-09-14'), false, 'nicht mehr am 14., wo man sie übersieht');
  const heute = tage.find(t => t.heute);
  assert.deepEqual(heute.eintraege.map(x => `${x.e.titel}|${x.rolle}`), ['Rechnung|ueberfaellig']);
  // Erledigt bleibt, wo es war; und ist die Liste in der Zukunft, gibt es kein "heute".
  assert.ok(tage.find(t => t.tag === '2026-09-15').eintraege.some(x => x.e.titel === 'Erledigt'));
  assert.equal(agenda(alle(), { ab: '2026-10-01', heute: '2026-09-17' }).some(t => t.eintraege.some(x => x.rolle === 'ueberfaellig')), false);
});

test('die Liste: was vor ihrem Anfang begann, steht an ihrem ersten Tag als "weiter"', () => {
  const tage = agenda(alle(), { ab: '2026-09-20', heute: '2026-09-10' });
  assert.equal(tage[0].tag, '2026-09-20');
  assert.equal(tage[0].eintraege[0].rolle, 'weiter');
  assert.equal(tage[0].eintraege[0].tagNr, 3);
});

test('die Liste: ein Programm steht an jedem Tag mit seinen Punkten', () => {
  const eintraege = sammeln({
    reisen: [{ id: 'p', name: 'Rom', startDate: '2026-10-01', endDate: '2026-10-05', familyId: 'f',
      itinerary: [{ id: 'a', date: '2026-10-01', title: 'Ankunft' }, { id: 'b', date: '2026-10-03', time: '09:00', title: 'Vatikan' }] }],
    farbeVon: () => '#2f6fed', nameVon: () => 'Familie',
  });
  const tage = agenda(eintraege, { ab: '2026-10-01', heute: '2026-09-01' });
  assert.deepEqual(tage.map(t => `${t.tag}:${t.eintraege[0].rolle}:${t.eintraege[0].stops.map(s => s.id).join()}`),
    ['2026-10-01:beginn:a', '2026-10-03:programm:b']);
});

test('der Monat hat nur die Wochen, die er braucht, und ein Lager ist ein Balken', () => {
  const wochen = monatsWochen('2026-09-14', alle(), { heute: '2026-09-14' });
  assert.equal(wochen.length, 5, 'September 2026: 31.8. bis 4.10.');
  assert.equal(wochen[0].tage[0].tag, '2026-08-31');
  assert.equal(wochen[0].tage[0].imMonat, false);
  assert.equal(wochen.at(-1).tage.at(-1).tag, '2026-10-04');
  assert.equal(monatsWochen('2021-02-01', []).length, 4, 'Februar 2021 beginnt am Montag und hat 28 Tage');
  assert.equal(monatsWochen('2026-03-01', []).length, 6, 'März 2026 braucht sechs');

  const woche3 = wochen[2];                        // 14.–20. Sep
  const balken = woche3.balken.find(b => b.e.id === 'team:g1:t2');
  assert.deepEqual([balken.start, balken.ende, balken.links, balken.rechts], [4, 6, false, true],
    'Fr bis So, und es geht in der nächsten Woche weiter');
  const weiter = wochen[3].balken.find(b => b.e.id === 'team:g1:t2');
  assert.deepEqual([weiter.start, weiter.ende, weiter.links], [0, 0, true]);
  assert.equal(woche3.balken.some(b => b.e.titel === 'Erledigt'), false, 'Abgehaktes steht nicht im Monat');
  assert.ok(woche3.tage.find(t => t.tag === '2026-09-14').heute);
});

test('Balken im Monat liegen in Spuren, nie übereinander', () => {
  const e = (id, von, bis) => ({ id, art: 'tag', von, bis, zeit: '', titel: id, erledigt: false, stops: [] });
  const [woche] = monatsWochen('2026-06-01', [
    e('a', '2026-06-01', '2026-06-03'), e('b', '2026-06-02', '2026-06-02'),
    e('c', '2026-06-04', '2026-06-05'), e('d', '2026-06-01', '2026-06-07'),
  ]);
  const spur = id => woche.balken.find(b => b.e.id === id).spur;
  assert.equal(spur('d'), 0, 'der längste zuoberst');
  assert.equal(spur('a'), 1);
  assert.equal(spur('b'), 2, 'überschneidet a');
  assert.equal(spur('c'), 1, 'passt hinter a in dieselbe Spur');
  assert.equal(woche.spuren, 3);
});

test('im Zeitraster teilen sich Überschneidungen die Breite', () => {
  const e = (id, zeit, bisZeit = '') => ({ id, art: 'tag', von: '2026-09-15', bis: '2026-09-15', zeit, bisZeit, titel: id, erledigt: false, stops: [] });
  const { spalten } = zeitRaster(['2026-09-15'], [e('a', '18:00', '19:30'), e('b', '18:30'), e('c', '20:00'), e('d', '09:00')]);
  const b = id => spalten[0].bloecke.find(x => x.e.id === id);
  assert.deepEqual([b('a').spalte, b('a').spalten], [0, 2]);
  assert.deepEqual([b('b').spalte, b('b').spalten], [1, 2]);
  assert.deepEqual([b('c').spalte, b('c').spalten], [0, 1], 'nach dem Ende der Gruppe wieder volle Breite');
  assert.deepEqual([b('d').spalte, b('d').spalten], [0, 1]);
  assert.equal(b('b').ende, 18 * 60 + 30 + 60, 'ohne Ende eine Stunde');
});

test('im Zeitraster: Ganztägiges oben als Balken, Programmpunkte mit Zeit als Blöcke', () => {
  const eintraege = [
    ...alle(),
    ...sammeln({ reisen: [{ id: 'p', name: 'Lagerprogramm', startDate: '2026-09-19', endDate: '2026-09-19', familyId: 'f',
      itinerary: [{ id: 's', date: '2026-09-19', time: '09:00', title: 'Gletscher' }] }], farbeVon: () => 'x', nameVon: () => 'F' }),
  ];
  const tage = ['2026-09-17', '2026-09-18', '2026-09-19'];
  const { ganztags, spalten } = zeitRaster(tage, eintraege);
  const lagerBalken = ganztags.balken.find(b => b.e.id === 'team:g1:t2');
  assert.deepEqual([lagerBalken.start, lagerBalken.ende, lagerBalken.rechts], [1, 2, true]);
  const stop = spalten[2].bloecke.find(b => b.stop?.id === 's');
  assert.equal(stop.start, 9 * 60);
  assert.equal(spalten[0].bloecke.length, 0);
});
