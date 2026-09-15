/* Die Trainings aus der Excel im Kalender und beim Assistenten (v.35.59.0).

   Michel: "wenn ich eine Excel-Datei hochlade und daraus das Training
   exportiere — zum Beispiel steht hier am Dienstag, 8. September
   Sprungprogramm —, hat der Assistent keine Ahnung von diesem
   Sprungprogramm … also müsste es in den Kalender eingetragen werden".
   Die Pläne standen nur in der Woche der Gruppe und im Bereich Training;
   der Kalender zeigte sie nie, und die Pille schickte nur Termine mit. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import { planEinheiten, RUECKWEGE, einheitZiel } from '../assets/js/wochenplan.js';
import { ausTraining, uhrzeitenAus, sammeln } from '../assets/js/feature/kalender/eintraege.js';
import { kontextBauen } from '../assets/js/ki.js';

const read = p => readFile(join(root, p), 'utf8');

const programm = (tage) => ({
  days: tage.map(([key, date, slots]) => ({
    key, name: key, date,
    slots: slots.map(([name, items]) => ({ key: name.toLowerCase(), name, items })),
  })),
});
const KW37 = programm([
  ['di', '2026-09-08', [['Vormittag', [{ title: 'Sprungprogramm', unit: 'u1' }]], ['Nachmittag', [{ title: 'Skiteppich Glarus', unit: '', time: '9-11 Uhr' }]]]],
  ['mi', '2026-09-09', [['Vormittag', [{ title: 'Kraft Beine', unit: 'u2' }]]]],
]);

test('aus den Plänen wird eine Liste von Einheiten mit Datum — der neuere Plan gewinnt', () => {
  const alt = { gid: 'g1', gruppe: 'BSV', plan: { id: 'p1', fuer: 'alle', erstelltAm: '2026-09-01' }, programm: KW37 };
  const neu = { gid: 'g1', gruppe: 'BSV', plan: { id: 'p2', fuer: 'alle', erstelltAm: '2026-09-02' },
    programm: programm([['di', '2026-09-08', [['Vormittag', [{ title: 'Sprungprogramm neu', unit: 'u1' }]]]]]) };
  const liste = planEinheiten([alt, neu], '2026-09-07');
  const dienstag = liste.filter(e => e.datum === '2026-09-08');
  assert.deepEqual(dienstag.map(e => e.titel), ['Sprungprogramm neu'], 'derselbe Tag zweimal: der neuere');
  assert.deepEqual(liste.filter(e => e.datum === '2026-09-09').map(e => e.titel), ['Kraft Beine'], 'den anderen Tag behält der alte');
  assert.equal(dienstag[0].planId, 'p2');
  assert.equal(dienstag[0].slot, 'Vormittag');

  // Vormittag vor Nachmittag, nicht nach dem Alphabet.
  const nurAlt = planEinheiten([alt], '2026-09-07').filter(e => e.datum === '2026-09-08');
  assert.deepEqual(nurAlt.map(e => e.slot), ['Vormittag', 'Nachmittag']);
});

test('im Kalender steht die Einheit am Tag, mit Uhrzeit nur, wenn der Plan eine nennt', () => {
  const [spr, teppich] = planEinheiten([{ gid: 'g1', gruppe: 'BSV', plan: { id: 'p1', fuer: 'alle' }, programm: KW37 }], '2026-09-07');
  const e = ausTraining(spr, '#2f6fed');
  assert.equal(e.art, 'training');
  assert.equal(e.von, '2026-09-08');
  assert.equal(e.zeit, '', 'ohne Uhrzeit: ganztägig, der Teil des Tages sagt wann');
  assert.equal(e.typ, 'Vormittag');
  assert.equal(e.quelle, 'BSV');
  const t = ausTraining(teppich, '#2f6fed');
  assert.deepEqual([t.zeit, t.bisZeit], ['09:00', '11:00']);
  assert.deepEqual(uhrzeitenAus('18.30 – 20 Uhr'), ['18:30', '20:00']);
  assert.deepEqual(uhrzeitenAus('abends'), ['', '']);

  const liste = sammeln({ teams: [{ gruppe: { id: 'g1', name: 'BSV' }, termine: [], trainings: [spr, teppich] }], persoenlich: false });
  assert.deepEqual(liste.map(x => x.titel), ['Sprungprogramm', 'Skiteppich Glarus']);

  // Ein Tipp öffnet den Player am geplanten Tag, "Zurück" führt in den Kalender.
  assert.equal(RUECKWEGE.kalender, './planner.html');
  assert.match(einheitZiel('g1', 'p1', spr, spr.datum, 'kalender'), /einheit\.html\?g=g1&p=p1&u=u1&d=2026-09-08&z=kalender$/);
});

test('der Kalender lädt die Pläne jeder Gruppe — die für alle und die eigenen', async () => {
  const k = await read('assets/js/feature/kalender/kalender.js');
  assert.match(k, /const plaene = await ladePlaene\(gruppe\.id, user\.uid, false\);/);
  assert.match(k, /teamTrainings\.set\(gruppe\.id, planEinheiten\(quellen, isoTag\(\)\)\)/);
  assert.match(k, /if \(eintrag\.art === 'training'\) \{ zeigeTraining\(eintrag\); return; \}/);
});

test('der Assistent kennt die Trainings — ohne Namen, nur die seiner Gruppe', () => {
  const einheiten = planEinheiten([{ gid: 'g1', gruppe: 'BSV', plan: { id: 'p1', fuer: 'alle' }, programm: KW37 }], '2026-09-07');
  const gruppen = [{ id: 'g1', name: 'BSV', meineRolle: 'head' }, { id: 'g2', name: 'Familie', meineRolle: 'mitglied' }];
  const jetzt = new Date('2026-09-07T10:00:00');
  const fremd = { datum: '2026-09-08', titel: 'Familienwanderung', gid: 'g2', fuer: 'alle' };
  const k = kontextBauen({ jetzt, gruppen, trainings: [...einheiten.map(e => ({ ...e, fuer: 'alle' })), fremd] });
  assert.ok(k.trainings.some(t => t.titel === 'Sprungprogramm' && t.datum === '2026-09-08' && t.teil === 'Vormittag'),
    'das Sprungprogramm vom Dienstag ist im Kontext');
  const inGruppe = kontextBauen({ jetzt, gruppen, wer: 'g1', trainings: [...einheiten.map(e => ({ ...e, fuer: 'alle' })), fremd] });
  assert.ok(!inGruppe.trainings.some(t => t.gruppe === 'g2'), 'der Assistent der Gruppe kennt nur sie');

  // Die Leitung sieht Einzelpläne: zusammengefasst, ohne Namen.
  const je = ['timo', 'lea', 'max'].map(uid => ({ datum: '2026-09-08', titel: 'Kraft', slot: 'Vormittag', gid: 'g1', fuer: 'athlet', uid }));
  const leitung = kontextBauen({ jetzt, gruppen, wer: 'g1', trainings: je });
  assert.deepEqual(leitung.trainings, [{ gruppe: 'g1', datum: '2026-09-08', titel: 'Kraft', teil: 'Vormittag', fuer: '3 Athleten' }]);
  assert.doesNotMatch(JSON.stringify(leitung), /timo|lea|max/);
});

test('die Pille lädt die Pläne mit — die Leitung im Assistenten der Gruppe alle', async () => {
  const p = await read('assets/js/ki-pille.js');
  assert.match(p, /trainingsQuellen\(groups, gruppen, uid, !a\.persoenlich\)/);
  assert.match(p, /const alsLeitung = alsGruppe && groups\.leitet\(g\.meineRolle\);/);
  assert.match(p, /trainings, leitet: groups\.leitet,/);
});
