/* Tests für den Trainings-Excel-Parser.

   Die Fixture dev/fixtures/kw31-grid.json ist das Zell-Raster der echten
   Wochendatei "Van Zanten Timothy KW 31.xlsx" — verbundene Zellen bereits
   aufgelöst, genau so, wie assets/js/training-import.js es im Browser
   erzeugt. Damit läuft derselbe Parser hier und in der App.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseProgram, matchUnit, weekTag, slug } from '../assets/js/training-parser.js';
import { sheetToGrid } from '../assets/js/training-import.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
const pictures = JSON.parse(await readFile(join(root, 'assets/data/training/images.json'), 'utf8'));
const program = parseProgram(grid, { images: pictures });

const unit = id => {
  const found = program.units[id];
  assert.ok(found, `Einheit ${id} fehlt`);
  return found;
};
const exercise = (id, no) => {
  const found = unit(id).exercises.find(e => e.no === no);
  assert.ok(found, `Übung ${no} in ${id} fehlt`);
  return found;
};

test('Kopfdaten der Woche werden gelesen', () => {
  assert.equal(program.athlete, 'Van Zanten Timothy');
  assert.equal(program.weekLabel, 'KW 31 TW 12');
  assert.equal(program.kw, 31);
  assert.equal(program.trainingWeek, 12);
  assert.equal(program.currentWeek, 'TW12');
  assert.equal(program.dateRange.start, '2026-08-03');
  assert.equal(program.dateRange.end, '2026-08-09');
  assert.equal(program.id, 'kw31-2026');
});

test('alle sieben Tage mit fortlaufendem Datum', () => {
  assert.equal(program.days.length, 7);
  assert.deepEqual(program.days.map(d => d.key), ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']);
  assert.equal(program.days[0].date, '2026-08-03');
  assert.equal(program.days[6].date, '2026-08-09');
});

test('Einträge landen beim richtigen Tag und Tagesabschnitt', () => {
  const titles = (key, slot) => {
    const day = program.days.find(d => d.key === key);
    return (day.slots.find(s => s.key === slot)?.items || []).map(i => i.title);
  };
  assert.deepEqual(titles('mo', 'vormittag'), ['Sprungprogramm', 'Koordination']);
  assert.deepEqual(titles('mo', 'nachmittag'), ['Kraft Oberkörper']);
  assert.deepEqual(titles('di', 'nachmittag'), ['Fußgymnastik', 'Mobi']);
  assert.deepEqual(titles('fr', 'nachmittag'), ['Rumpf', 'Mobi']);
  /* Sonntag ist Ruhetag — kein Eintrag darf dorthin rutschen. */
  assert.equal(program.days[6].slots.flatMap(s => s.items).length, 0);
});

test('Wochenplan-Einträge zeigen auf das passende Blatt', () => {
  const unitOf = (key, title) => program.days.find(d => d.key === key)
    .slots.flatMap(s => s.items).find(i => i.title === title)?.unit;
  assert.equal(unitOf('mo', 'Sprungprogramm'), 'sprungprogramm');
  assert.equal(unitOf('di', 'Kraft Beine'), 'kraft-beine');
  assert.equal(unitOf('mo', 'Kraft Oberkörper'), 'kraft-oberkoerper');
  assert.equal(unitOf('di', 'Fußgymnastik'), 'fussgymnastik');
  /* Freitext im Plan zeigt auf das Ausdauerblatt bzw. auf gar nichts. */
  assert.equal(unitOf('mi', 'Intervall INTENSIV 4x5 min (Joggen)'), 'ausdauer');
  assert.equal(unitOf('do', 'Ausdauer Zone 1'), 'ausdauer');
  assert.equal(unitOf('mo', 'Koordination'), '');
});

test('jedes Blatt wird als eigene Einheit erkannt', () => {
  assert.deepEqual(Object.keys(program.units).sort(), [
    'ausdauer', 'fussgymnastik', 'kraft-beine', 'kraft-oberkoerper',
    'mobi', 'neuroathletik', 'rumpf', 'sprungprogramm',
  ]);
  assert.equal(unit('kraft-beine').kind, 'strength');
  assert.equal(unit('rumpf').kind, 'strength');
  assert.equal(unit('ausdauer').kind, 'endurance');
  assert.equal(unit('fussgymnastik').kind, 'circuit');
  assert.equal(unit('mobi').kind, 'links');
  assert.equal(unit('neuroathletik').kind, 'notes');
});

/* Das Sprungprogramm hat eine Spalte "Wiederholungen", ist aber eine
   Übungstabelle und keine Satz/Gewicht-Struktur. Vor der Korrektur
   wurde daraus eine einzige Kraftübung mit unsinnigen Sätzen. */
test('Sprungprogramm bleibt eine Tabelle', () => {
  const jump = unit('sprungprogramm');
  assert.equal(jump.kind, 'table');
  assert.deepEqual(jump.columns, ['Übung', 'Serien', 'Wiederholungen', 'Sprünge Total', 'Video']);
  assert.equal(jump.rows.length, 7);
  assert.equal(jump.rows[0].values[0], 'Beidbeinige Hürdensprünge mit Zwischensprung');
  assert.equal(jump.rows[0].links[4], 'https://www.youtube.com/shorts/l0dxQVbwnXU');
});

test('Kraftübung: Sätze, Wiederholungen und Gewicht der aktuellen Woche', () => {
  const zug = exercise('kraft-beine', '2');
  assert.equal(zug.name, 'Zug eng');
  assert.equal(zug.video, 'https://www.youtube.com/watch?v=S5VSETifvoI');
  assert.equal(zug.tut, '2010');
  assert.equal(zug.pause, '120-180 Sec');
  assert.deepEqual(zug.sets.map(s => s.reps), ['9', '9', '7', '7']);
  /* TW12 ist die laufende Woche — TW11 gehört in die Historie. */
  assert.deepEqual(zug.sets.map(s => s.weight), ['37', '37', '40', '40']);
  assert.deepEqual(zug.history.map(h => h.week), ['TW11']);
  assert.deepEqual(zug.history[0].values, ['35', '35', '37', '37']);
});

test('Übungsnummern 3A/3B bleiben getrennt', () => {
  assert.equal(exercise('kraft-beine', '3A').name, 'Kniebeuge hinten');
  assert.equal(exercise('kraft-beine', '3B').name, 'Hürdensprünge');
});

test('zweite Zeile ist der Alternativname, nicht die Übung', () => {
  const curls = exercise('kraft-beine', '5');
  assert.equal(curls.name, 'Hamstring curls einbeinig');
  assert.equal(curls.altName, 'oder hamstring curl ball einbeinig');
  /* Der Videolink steht eine Zeile tiefer, ohne "Gewicht"-Spalte. */
  assert.equal(curls.video, 'https://youtube.com/shorts/XkdOQecjscs?si=JiiBVtwaGifxxlSO');
});

test('Videolink hinter dem Übungsnamen wird gefunden', () => {
  const schulter = exercise('kraft-oberkoerper', '4');
  assert.equal(schulter.name, 'Liegende Schulterübung auf Schrägbank');
  assert.equal(schulter.video, 'https://www.youtube.com/watch?v=rvPefutmJ4g');
});

test('abweichende Einheit (Miniband statt Gewicht) bleibt erhalten', () => {
  assert.equal(exercise('kraft-beine', '7').valueUnit, 'Miniband');
});

/* Im Rumpfblatt steht die Trainingswoche unter der Überschrift "Datum".
   Deshalb wird sie am Wert erkannt und nicht an der Spaltenüberschrift. */
test('Rumpf: Trainingswoche wird trotz falscher Überschrift erkannt', () => {
  const paloff = exercise('rumpf', '1');
  assert.equal(paloff.name, 'Paloff Press am Kabelzug');
  assert.equal(paloff.altName, 'Cable Pallof Press');
  assert.equal(paloff.video, 'https://www.youtube.com/shorts/fI0xAuGP64M');
  assert.equal(paloff.pause, '60-90 sec');
  assert.deepEqual(paloff.sets.map(s => s.reps), ['10/Seite', '10/Seite', '10/Seite']);
  assert.equal(unit('rumpf').exercises.length, 6);
});

test('gleicher Name in beiden Zeilen wird nicht als Alternative doppelt', () => {
  assert.equal(exercise('rumpf', '5').altName, '');
});

test('Aufwärmteil endet vor dem Kraftteil', () => {
  const warmup = unit('kraft-beine').warmup;
  assert.equal(warmup.title, 'Aufwärmen 15-20 min');
  assert.equal(warmup.items.length, 7);
  assert.equal(warmup.items[0].name, 'Mobi/aktivieren');
  assert.deepEqual(warmup.items[0].details, ['Sprunggelenk', 'Hüfte', 'Wirbelsäule', 'Schulter']);
  assert.equal(warmup.items[6].name, 'Weitsprung');
  /* Weder die Pausenangabe noch die Satz-Kopfzeile dürfen hier landen. */
  assert.deepEqual(warmup.items[6].lines, []);
});

test('"Vorher immer aufwärmen!!" ist ein Hinweis, kein Aufwärmprogramm', () => {
  assert.equal(unit('rumpf').warmup, null);
  assert.equal(unit('rumpf').note, 'Vorher immer aufwärmen!!');
});

test('Ausdauer: Zonen, Dauer und Intervalle', () => {
  const a = unit('ausdauer');
  assert.deepEqual(a.zoneColumns, ['HF Velo', 'HF Joggen', 'HF Wandern']);
  assert.equal(a.zones.length, 5);
  assert.equal(a.zones[1].name, 'GA 1');
  assert.deepEqual(a.zones[1].values, ['129-146', '139-155', '129-146']);
  /* Verbundene Zellen dürfen den Hinweis nicht dreifach wiederholen. */
  assert.equal(a.zones[1].hint, 'man sollte noch problemlos sprechen können');
  assert.deepEqual(a.durations, [
    { mode: 'Velo', value: '90-150' },
    { mode: 'Joggen', value: '60-75' },
    { mode: 'Wandern', value: '90-180' },
  ]);
  assert.equal(a.intervals.length, 1);
  assert.equal(a.intervals[0].title, 'Intensiv · Joggen');
  assert.equal(a.intervals[0].steps.length, 9);
  assert.deepEqual(a.intervals[0].steps[0], { duration: '20 Minuten einlaufen', zone: 'Zone 1', hf: '< 139' });
});

test('Fußgymnastik: nummerierte Übungen mit Zeit und Sätzen', () => {
  const f = unit('fussgymnastik');
  assert.equal(f.duration, 'ca. 20 min');
  assert.equal(f.exercises.length, 9);
  assert.equal(f.exercises[0].name, 'Zehen spreitzen');
  assert.deepEqual(f.exercises[0].params, [
    { label: 'Zeit', value: '30 sec pro Seite' },
    { label: 'Sätze', value: '2' },
  ]);
});

test('Mobi: Videoliste mit Dauer', () => {
  const m = unit('mobi');
  assert.equal(m.links.length, 7);
  assert.equal(m.links[0].url, 'https://www.youtube.com/watch?v=qti526J8YXY');
  assert.equal(m.links[0].meta, 'Dauer 25 min');
});

test('jede Einheit behält die Originaltabelle', () => {
  Object.values(program.units).forEach(u => {
    assert.ok(Array.isArray(u.raw?.rows) && u.raw.rows.length > 0, `${u.id} ohne Rohdaten`);
  });
});

/* Die Seite behandelt jede Einheit gleich — Kraft, Zirkel, Tabelle, Ausdauer,
   Videos, Anleitung. Dafür muss jedes Blatt dieselbe items-Liste liefern. */
test('jede Einheit liefert eine einheitliche items-Liste', () => {
  const counts = Object.fromEntries(
    Object.values(program.units).map(u => [u.id, u.items.length]));
  assert.deepEqual(counts, {
    'kraft-beine': 8, 'kraft-oberkoerper': 7, ausdauer: 9, rumpf: 6,
    sprungprogramm: 7, fussgymnastik: 9, mobi: 7, neuroathletik: 9,
  });
  Object.values(program.units).forEach(u => u.items.forEach(item => {
    assert.ok(item.key, `${u.id}: Übung ohne Schlüssel`);
    assert.ok(item.name, `${u.id}: Übung ohne Namen`);
    assert.ok(['sets', 'rounds', 'timed', 'block', 'video', 'note'].includes(item.mode),
      `${u.id}: unbekannter Modus ${item.mode}`);
  }));
});

test('Schlüssel sind über alle Einheiten eindeutig', () => {
  const keys = Object.values(program.units).flatMap(u => u.items.map(i => i.key));
  assert.equal(new Set(keys).size, keys.length);
  /* Das Intervall hat viermal "5 Minuten" — die dürfen sich im Protokoll
     nicht denselben Eintrag teilen. */
  const ausdauer = unit('ausdauer').items.map(i => i.key);
  assert.ok(ausdauer.includes('ausdauer-5-minuten'));
  assert.ok(ausdauer.includes('ausdauer-5-minuten-4'));
});

test('Kraftübung wird zu einem Item mit Sätzen', () => {
  const zug = unit('kraft-beine').items.find(i => i.name === 'Zug eng');
  assert.equal(zug.mode, 'sets');
  assert.equal(zug.sets.length, 4);
  assert.equal(zug.pause, '120-180 Sec');
  assert.deepEqual(zug.params, [{ label: 'TUT', value: '2010' }]);
});

test('Sprungprogramm wird zu Items mit Kennzahlen', () => {
  const first = unit('sprungprogramm').items[0];
  assert.equal(first.mode, 'rounds');
  assert.equal(first.video, 'https://www.youtube.com/shorts/l0dxQVbwnXU');
  assert.deepEqual(first.params, [
    { label: 'Serien', value: '3' },
    { label: 'Wiederholungen', value: '6' },
    { label: 'Sprünge Total', value: '18' },
  ]);
});

test('Ausdauer wird zu abhakbaren Intervallabschnitten', () => {
  const items = unit('ausdauer').items;
  assert.equal(items[0].mode, 'block');
  assert.equal(items[0].name, '20 Minuten einlaufen');
  assert.deepEqual(items[0].params, [
    { label: 'Intensität', value: 'Zone 1' },
    { label: 'Puls', value: '< 139' },
  ]);
  assert.deepEqual(items[0].lines, ['Intensiv · Joggen']);
});

test('Mobi-Videos bekommen Namen aus ihrer Überschrift', () => {
  const items = unit('mobi').items;
  assert.equal(items[0].mode, 'video');
  assert.equal(items[0].name, 'Mobi 1');
  assert.equal(items[0].video, 'https://www.youtube.com/watch?v=qti526J8YXY');
  /* Unter "NEUROATHLETIK" steht nur ein Link — der braucht keine Nummer. */
  assert.equal(items[6].name, 'NEUROATHLETIK');
});

/* Ohne Bilder wären "Zungenkreisen" und Co. leere Abschnitte und würden als
   Überschrift weggefiltert. Deshalb kennt der Parser die Bildzuordnung. */
test('Neuroathletik: Überschriften werden von Übungen getrennt', () => {
  const neuro = unit('neuroathletik');
  assert.equal(neuro.note, 'Wichtig: nicht bei Schwellungen oder Entzündungen durchführen');
  assert.equal(neuro.items.length, 9);
  assert.equal(neuro.items[0].name, 'Schienbeinnerv');
  assert.equal(neuro.items[0].group, 'Nervdehnung der Beine');
  assert.equal(neuro.items[8].group, 'Zunge');
  /* "Für?" ist eine Spaltenüberschrift, kein Inhalt. */
  assert.deepEqual(neuro.items[0].lines, [
    'verbessert Streckfähigkeit, für schwache/schmerzende Beinbeuger- und Wadenmuskulatur, positiv für Plantarfaszien und Fersensporn',
  ]);
});

test('jedes hinterlegte Bild findet seine Übung', () => {
  Object.entries(pictures).forEach(([unitId, byExercise]) => {
    const slugs = new Set(unit(unitId).items.map(i => i.slug));
    Object.keys(byExercise).forEach(key => {
      assert.ok(slugs.has(key), `${unitId}: kein Item für Bild "${key}"`);
    });
  });
});

test('Hilfsfunktionen', () => {
  assert.equal(weekTag('TW 12'), 'TW12');
  assert.equal(weekTag('TW12'), 'TW12');
  assert.equal(weekTag('Datum'), '');
  assert.equal(slug('Kraft Oberkörper'), 'kraft-oberkoerper');
  assert.equal(slug('Fußgymnastik'), 'fussgymnastik');
  const ids = ['ausdauer', 'kraft-beine', 'rumpf'];
  assert.equal(matchUnit('Intervall INTENSIV 4x5 min (Joggen)', ids), 'ausdauer');
  assert.equal(matchUnit('Kraft Beine', ids), 'kraft-beine');
  assert.equal(matchUnit('Koordination', ids), '');
});

/* SheetJS selbst wird nicht installiert (die App lädt es im Browser vom CDN).
   Getestet wird deshalb nur unsere Umwandlung Blatt → Raster: verbundene
   Zellen füllen, Hyperlinks mitnehmen, leere Ränder abschneiden. Genau das
   unterscheidet das Browser-Raster von der Fixture oben. */
const fakeXlsx = {
  utils: {
    decode_range: ref => {
      const [, c1, r1, c2, r2] = ref.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      const col = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      return { s: { r: Number(r1) - 1, c: col(c1) }, e: { r: Number(r2) - 1, c: col(c2) } };
    },
    encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`,
  },
};

test('sheetToGrid füllt verbundene Zellen und behält Hyperlinks', () => {
  const worksheet = {
    '!ref': 'A1:C3',
    '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
    A1: { v: 'Montag' },
    A2: { v: 'Kniebeuge', l: { Target: 'https://example.test/video' } },
    B2: { v: 50 },
    C2: { v: true },
  };
  const grid = sheetToGrid(fakeXlsx, worksheet, 'Test');
  assert.equal(grid.name, 'Test');
  assert.deepEqual(grid.rows[0], ['Montag', 'Montag', 'Montag']);
  assert.deepEqual(grid.rows[1], ['Kniebeuge', 50, 'ja']);
  assert.equal(grid.links['1_0'], 'https://example.test/video');
  /* Die dritte, leere Zeile fällt weg. */
  assert.equal(grid.rows.length, 2);
});

test('sheetToGrid verträgt ein leeres Blatt', () => {
  assert.deepEqual(sheetToGrid(fakeXlsx, {}, 'Leer'), { name: 'Leer', rows: [], links: {} });
});

test('leere oder fremde Dateien werden abgewiesen', () => {
  assert.throws(() => parseProgram({ sheets: [] }), /Tabellenblätter/);
  assert.throws(() => parseProgram({ sheets: [{ name: 'Blatt1', rows: [['a']] }] }), /Wochenplan/);
});
