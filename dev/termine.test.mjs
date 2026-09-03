/* Tests für assets/js/termine.js.
 *
 * Reines Modul, kein Firebase, kein DOM — also echte Tests. Geprüft
 * wird vor allem das, was ein Lager von einem Training unterscheidet:
 * es läuft an mehreren Tagen, und jede Ansicht muss das wissen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTEN, DISZIPLINEN, BEREICH_DER_ART,
  isoTag, istIsoTag, istMehrtaegig, laeuftAm,
  sortiere, kommende, zeitraum, alsBriefingTermine, pruefe,
} from '../assets/js/termine.js';

const training = { art: 'training', titel: 'Kraft Beine', von: '2026-09-08', zeit: '14:00' };
const lager = { art: 'lager', titel: 'Schneelager Saas-Fee', von: '2026-10-03', bis: '2026-10-10' };
const rennen = { art: 'rennen', titel: 'FIS RS Lenzerheide', von: '2026-12-14', bis: '2026-12-15', disziplin: 'RS' };

test('drei Arten, drei Farben, keine Überschneidung', () => {
  assert.deepEqual([...ARTEN], ['training', 'lager', 'rennen']);
  const bereiche = ARTEN.map(a => BEREICH_DER_ART[a]);
  assert.equal(new Set(bereiche).size, 3, 'jede Art braucht ihre eigene Farbe');
  assert.ok(bereiche.every(Boolean), 'jede Art braucht überhaupt eine Farbe');
});

test('jede Terminart hat eine Farbe, die es in kit.css wirklich gibt', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = await readFile(join(root, 'assets/css/kit.css'), 'utf8');

  // Ohne diese Prüfung fällt eine umbenannte Regel erst im Browser auf —
  // und zwar als farblose Zeile, nicht als Fehler.
  for (const art of ARTEN) {
    const bereich = BEREICH_DER_ART[art];
    assert.match(
      css,
      new RegExp(`\\[data-bereich="${bereich}"\\]`),
      `kit.css kennt data-bereich="${bereich}" nicht`,
    );
  }
});

test('ein Lager läuft an jedem Tag dazwischen, ein Training nur an einem', () => {
  assert.ok(istMehrtaegig(lager));
  assert.ok(!istMehrtaegig(training));

  assert.ok(laeuftAm(lager, '2026-10-03'), 'erster Tag');
  assert.ok(laeuftAm(lager, '2026-10-07'), 'mittendrin');
  assert.ok(laeuftAm(lager, '2026-10-10'), 'letzter Tag');
  assert.ok(!laeuftAm(lager, '2026-10-02'));
  assert.ok(!laeuftAm(lager, '2026-10-11'));

  assert.ok(laeuftAm(training, '2026-09-08'));
  assert.ok(!laeuftAm(training, '2026-09-09'));
});

test('ein bis-Datum gleich dem von-Datum ist kein Lager', () => {
  const eintaegig = { ...training, bis: training.von };
  assert.ok(!istMehrtaegig(eintaegig));
  assert.ok(!laeuftAm(eintaegig, '2026-09-09'));
});

test('Reihenfolge: nach Tag, Mehrtägiges zuerst, dann nach Uhrzeit', () => {
  const tag = '2026-09-08';
  const raus = sortiere([
    { titel: 'Spät', von: tag, zeit: '18:00' },
    { titel: 'Früh', von: tag, zeit: '08:00' },
    { titel: 'Lager', von: tag, bis: '2026-09-12' },
    { titel: 'Ohne Zeit', von: tag },
    { titel: 'Später Tag', von: '2026-09-20', zeit: '06:00' },
  ]);
  assert.deepEqual(
    raus.map(t => t.titel),
    ['Lager', 'Ohne Zeit', 'Früh', 'Spät', 'Später Tag'],
  );
});

test('Termine ohne brauchbares Datum fallen still heraus', () => {
  const raus = sortiere([
    training,
    { titel: 'Kaputt', von: 'irgendwann' },
    { titel: 'Fehlt' },
    null,
  ]);
  assert.deepEqual(raus.map(t => t.titel), ['Kraft Beine']);
});

test('kommende zeigt ein laufendes Lager weiter an', () => {
  // Mitten im Lager: es ist noch nicht vorbei, also gehört es dazu.
  const mittendrin = kommende([lager, training], '2026-10-07');
  assert.deepEqual(mittendrin.map(t => t.titel), ['Schneelager Saas-Fee']);

  // Einen Tag nach dem Ende ist es weg.
  assert.deepEqual(kommende([lager], '2026-10-11'), []);

  // Und ein vergangenes Training taucht nicht mehr auf.
  assert.deepEqual(kommende([training], '2026-09-09'), []);
});

test('kommende hält die Grenze ein', () => {
  const viele = Array.from({ length: 8 }, (_, i) => ({
    titel: `T${i}`, von: `2026-09-${String(10 + i).padStart(2, '0')}`,
  }));
  assert.equal(kommende(viele, '2026-09-01', 3).length, 3);
  assert.equal(kommende(viele, '2026-09-01').length, 8);
});

test('zeitraum unterscheidet Spanne von Einzeltag', () => {
  const spanne = zeitraum(rennen, 'de-CH');
  const einzel = zeitraum(training, 'de-CH');

  // Beide Tage müssen in der Spanne vorkommen, im Einzeltag nur einer.
  assert.match(spanne, /14/);
  assert.match(spanne, /15/);
  assert.match(spanne, /–/, 'eine Spanne braucht einen Bis-Strich');

  assert.match(einzel, /8/);
  assert.doesNotMatch(einzel, /–/);
  // Eine Uhrzeit gehört an einen Einzeltag, nicht an eine Spanne.
  assert.match(einzel, /14:00/);
  assert.doesNotMatch(spanne, /\d\d:\d\d/);
});

test('zeitraum kippt nicht bei fehlendem Datum', () => {
  assert.equal(zeitraum(null, 'de-CH'), '');
  assert.equal(zeitraum({ von: 'kaputt' }, 'de-CH'), '');
});

test('die Brücke zur Zusammenfassung erfindet keine Uhrzeit', () => {
  // Ein Lager gilt für den ganzen Tag …
  const imLager = alsBriefingTermine([lager], '2026-10-07');
  assert.equal(imLager.length, 1);
  assert.equal(imLager[0].ganztags, true);
  assert.equal(imLager[0].titel, 'Schneelager Saas-Fee');

  // … ein Training mit Uhrzeit nicht.
  const beimTraining = alsBriefingTermine([training], '2026-09-08');
  assert.equal(beimTraining[0].ganztags, false);
  assert.equal(beimTraining[0].start.getHours(), 14);

  // Ein Termin ohne Uhrzeit ist ganztägig, statt Mitternacht zu behaupten.
  const ohneZeit = alsBriefingTermine([{ art: 'training', titel: 'X', von: '2026-09-08' }], '2026-09-08');
  assert.equal(ohneZeit[0].ganztags, true);

  // Was an dem Tag nicht läuft, kommt gar nicht erst mit.
  assert.deepEqual(alsBriefingTermine([training], '2026-09-09'), []);
});

test('pruefe fängt genau das ab, was die Regeln ablehnen würden', () => {
  assert.deepEqual(pruefe(training), []);
  assert.deepEqual(pruefe(lager), []);
  assert.deepEqual(pruefe(rennen), []);

  assert.match(pruefe({ ...training, art: 'ausflug' })[0], /Terminart/);
  assert.match(pruefe({ ...training, titel: '  ' })[0], /Titel/);
  assert.match(pruefe({ ...training, titel: 'x'.repeat(121) })[0], /zu lang/);
  assert.match(pruefe({ ...training, von: '8.9.2026' })[0], /Datum/);
  assert.match(pruefe({ ...lager, bis: '2026-10-01' })[0], /Ende liegt vor/);
  assert.match(pruefe({ ...training, zeit: '14 Uhr' })[0], /Uhrzeit/);
  assert.match(pruefe({ ...rennen, disziplin: 'XX' })[0], /Disziplin/);

  // Eine Disziplin an einem Krafttraining wäre nur verwirrend.
  assert.match(pruefe({ ...training, disziplin: 'RS' })[0], /gehört zu einem Rennen/);

  // Ein leeres bis ist erlaubt — die meisten Termine haben keins.
  assert.deepEqual(pruefe({ ...training, bis: '' }), []);
  assert.deepEqual(pruefe({ ...training, bis: null }), []);
});

test('nur die vier alpinen Disziplinen, in der Reihenfolge der Fahrtlänge', () => {
  assert.deepEqual([...DISZIPLINEN], ['SL', 'RS', 'SG', 'DH']);
});

test('isoTag rechnet in lokaler Zeit, nicht in UTC', () => {
  // Spät am Abend darf das Datum nicht schon auf morgen springen —
  // genau das passiert mit toISOString() östlich von Greenwich.
  const spaet = new Date(2026, 8, 8, 23, 30);
  assert.equal(isoTag(spaet), '2026-09-08');

  const frueh = new Date(2026, 0, 1, 0, 15);
  assert.equal(isoTag(frueh), '2026-01-01');

  assert.equal(isoTag('kein Datum'), '');
  assert.ok(istIsoTag('2026-09-08'));
  assert.ok(!istIsoTag('2026-9-8'));
  assert.ok(!istIsoTag(20260908));
});
