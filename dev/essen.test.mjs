/* Essen in der Gruppe (v.35.72.0) — das Modell und die Regeln.
 *
 * Zwei Dinge werden hier gemessen, und sie gehören zusammen:
 *
 *   1. Was das Modell entscheidet (darfEssen, darfFreigabe). Danach
 *      richtet sich die Oberfläche.
 *   2. Was firestore.rules entscheidet. Das ist die Sicherung.
 *
 * Weichen beide voneinander ab, ist eines falsch — und weil auf dieser
 * Maschine kein Java und damit kein Emulator läuft (CLAUDE.md, offene
 * Punkte), ist dieser Vergleich das Beste, was zu haben ist: die
 * Regeltexte werden gelesen und auf genau die Zweige geprüft, die das
 * Modell behauptet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAHLZEITEN, MAHLZEIT_KEYS, mahlzeitNachUhr, mahlzeitSchluessel,
  naehrwerte, summe, parseMenge, tagPayload, tagId, uidVonTagId,
  zeitraumTage, dashboardZeilen, STATUS, darfEssen, darfFreigabe,
  essenAn, essenMoeglich, sehendePersonen, freigabeGilt, mussFragen,
  EINWILLIGUNG, MAHLZEITEN_MAX, ZUTATEN_MAX, GRAMM_MAX, TAGE_MAX,
} from '../assets/js/essen-modell.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readRules = () => readFile(join(root, 'firestore.rules'), 'utf8');

function block(rules, pfad) {
  const marker = `match ${pfad} {`;
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, `Regelblock fehlt: ${pfad}`);
  let tiefe = 0;
  for (let i = start + marker.length - 1; i < rules.length; i += 1) {
    if (rules[i] === '{') tiefe += 1;
    if (rules[i] === '}') tiefe -= 1;
    if (tiefe === 0) return rules.slice(start, i + 1);
  }
  assert.fail(`Regelblock nicht geschlossen: ${pfad}`);
}

/* ── Rechnen ───────────────────────────────────────────────────────*/

const TABELLE = {
  Haferflocken: { name: 'Haferflocken', kcal: 372, protein: 13.5, carbs: 58.7, fat: 7, fibre: 10, micros: ['Eisen', 'B1'] },
  Vollmilch: { name: 'Vollmilch', kcal: 65, protein: 3.3, carbs: 4.8, fat: 3.6, fibre: 0, micros: ['Calcium', 'B1'] },
};
const finde = name => TABELLE[name] || null;

test('die Nährwerte rechnen auf 100 g und summieren die Mikros ohne Dubletten', () => {
  const s = naehrwerte([{ name: 'Haferflocken', g: 50 }, { name: 'Vollmilch', g: 200 }], finde);
  assert.equal(Math.round(s.kcal), Math.round(372 * 0.5 + 65 * 2));
  assert.equal(Math.round(s.protein * 10) / 10, Math.round((13.5 * 0.5 + 3.3 * 2) * 10) / 10);
  /* B1 steht bei beiden — einmal ist einmal. */
  assert.deepEqual(s.micros, ['Eisen', 'B1', 'Calcium']);
  assert.deepEqual(s.unbekannt, []);
});

test('was die Tabelle nicht kennt, zählt null und wird genannt', () => {
  const s = naehrwerte([{ name: 'Haferflocken', g: 100 }, { name: 'Zaubertrank', g: 50 }], finde);
  assert.equal(Math.round(s.kcal), 372);
  assert.deepEqual(s.unbekannt, ['Zaubertrank']);
});

test('Zeilen ohne Namen oder ohne Gewicht zählen gar nicht', () => {
  const s = naehrwerte([{ name: '', g: 100 }, { name: 'Vollmilch', g: 0 }, { name: 'Vollmilch' }], finde);
  assert.equal(s.kcal, 0);
  assert.deepEqual(s.unbekannt, []);
});

test('summe addiert Mahlzeiten und verträgt fehlende Felder', () => {
  const s = summe([{ kcal: 100, protein: 5 }, { kcal: 50.44, fat: 2 }, null]);
  assert.equal(s.kcal, 150.4);
  assert.equal(s.protein, 5);
  assert.equal(s.fat, 2);
  assert.equal(s.carbs, 0);
});

test('Packungsangaben werden zu Gramm — und Unsinn zu nichts', () => {
  assert.equal(parseMenge('500 g'), 500);
  assert.equal(parseMenge('1 kg'), 1000);
  assert.equal(parseMenge('250ml'), 250);
  assert.equal(parseMenge('2,5 dl'), 250);
  assert.equal(parseMenge('33 cl'), 330);
  assert.equal(parseMenge('2 g'), null);        // zu klein für eine Packung
  assert.equal(parseMenge('9 kg'), null);       // über GRAMM_MAX
  assert.equal(parseMenge(''), null);
  assert.equal(parseMenge(null), null);
});

/* ── Der Tag als Dokument ──────────────────────────────────────────*/

test('der Tag trägt Kennung, Summe und gekappte Werte', () => {
  const daten = tagPayload('timo', '2026-09-18', [{
    mahlzeit: 'fruehstueck',
    zutaten: [{ name: 'Haferflocken', g: 80 }, { name: 'Vollmilch', g: 250 }],
  }], finde);
  assert.equal(daten.uid, 'timo');
  assert.equal(daten.datum, '2026-09-18');
  assert.equal(daten.mahlzeiten.length, 1);
  assert.equal(daten.mahlzeiten[0].mahlzeit, 'fruehstueck');
  assert.equal(daten.kcal, daten.mahlzeiten[0].kcal);
  assert.ok(daten.stand > 0);
  assert.equal(tagId('timo', '2026-09-18'), 'timo__2026-09-18');
  assert.equal(uidVonTagId('timo__2026-09-18'), 'timo');
});

test('das Dokument bleibt begrenzt: Mahlzeiten, Zutaten, Gramm, Name', () => {
  const viele = Array.from({ length: MAHLZEITEN_MAX + 5 }, (_, i) => ({
    mahlzeit: 'snack', zutaten: [{ name: 'Vollmilch', g: 100 + i }],
  }));
  assert.equal(tagPayload('timo', '2026-09-18', viele, finde).mahlzeiten.length, MAHLZEITEN_MAX);

  const eine = tagPayload('timo', '2026-09-18', [{
    mahlzeit: 'snack',
    zutaten: [
      ...Array.from({ length: ZUTATEN_MAX + 3 }, () => ({ name: 'Vollmilch', g: 10 })),
    ],
  }], finde);
  assert.equal(eine.mahlzeiten[0].zutaten.length, ZUTATEN_MAX);

  const gross = tagPayload('timo', '2026-09-18',
    [{ mahlzeit: 'snack', zutaten: [{ name: 'x'.repeat(200), g: 99999 }] }], finde);
  assert.equal(gross.mahlzeiten[0].zutaten[0].g, GRAMM_MAX);
  assert.equal(gross.mahlzeiten[0].zutaten[0].name.length, 80);
});

test('eine Mahlzeit ohne verwertbare Zutat fällt weg — ein leerer Tag ist kein Tag', () => {
  const daten = tagPayload('timo', '2026-09-18', [{ mahlzeit: 'snack', zutaten: [{ name: '', g: 0 }] }], finde);
  assert.deepEqual(daten.mahlzeiten, []);
});

test('ohne Datum im ISO-Format entsteht kein Dokument', () => {
  assert.throws(() => tagPayload('timo', '18.09.2026', [], finde));
  assert.throws(() => tagPayload('', '2026-09-18', [], finde));
});

test('die Mahlzeit wird als Schlüssel gespeichert, nicht als deutsches Wort', () => {
  assert.equal(mahlzeitSchluessel('🌅 Frühstück'), 'fruehstueck');
  assert.equal(mahlzeitSchluessel('☀️ Mittagessen'), 'mittag');
  assert.equal(mahlzeitSchluessel('abend'), 'abend');
  assert.equal(mahlzeitSchluessel('irgendwas'), 'snack');
  for (const m of MAHLZEITEN) assert.ok(MAHLZEIT_KEYS.includes(m.key));
});

test('die Mahlzeit nach der Uhr ist eine Vorauswahl über den ganzen Tag', () => {
  assert.equal(mahlzeitNachUhr(7), 'fruehstueck');
  assert.equal(mahlzeitNachUhr(12), 'mittag');
  assert.equal(mahlzeitNachUhr(19), 'abend');
  assert.equal(mahlzeitNachUhr(3), 'snack');
  assert.equal(mahlzeitNachUhr(16), 'snack');
});

/* ── Zeitraum ──────────────────────────────────────────────────────*/

test('ein Zeitraum ist eine Liste von Tagen, einschliesslich, und endlich', () => {
  assert.deepEqual(zeitraumTage('2026-09-16', '2026-09-18'),
    ['2026-09-16', '2026-09-17', '2026-09-18']);
  assert.deepEqual(zeitraumTage('2026-09-18', '2026-09-16'), []);
  assert.deepEqual(zeitraumTage('kaputt', '2026-09-16'), []);
  assert.equal(zeitraumTage('2026-01-01', '2026-12-31').length, TAGE_MAX);
});

/* ── Die Übersicht ─────────────────────────────────────────────────*/

const KADER = [
  { uid: 'michel', name: 'Michel', rolle: 'head' },
  { uid: 'timo', name: 'Timothy', rolle: 'mitglied' },
  { uid: 'lea', name: 'Lea', rolle: 'mitglied' },
];

test('die Übersicht trennt „kein Eintrag" von „teilt nicht"', () => {
  const zeilen = dashboardZeilen({
    mitglieder: KADER,
    freigaben: { timo: true, lea: false, michel: true },
    tage: [{ uid: 'timo', datum: '2026-09-17', mahlzeiten: [{ mahlzeit: 'mittag', kcal: 700, zutaten: [] }], kcal: 700 }],
    von: '2026-09-16', bis: '2026-09-18',
  });
  const nach = uid => zeilen.find(z => z.uid === uid);
  assert.equal(nach('timo').status, STATUS.geteilt);
  assert.equal(nach('michel').status, STATUS.leer);
  assert.equal(nach('lea').status, STATUS.nichtGeteilt);
  /* Wer teilt, steht oben. */
  assert.equal(zeilen[0].uid, 'timo');
  assert.equal(zeilen[2].uid, 'lea');
});

test('wer nicht teilt, hat in der Übersicht weder Tage noch Zahlen', () => {
  const zeilen = dashboardZeilen({
    mitglieder: KADER,
    freigaben: { lea: false },
    /* Ein Tag von Lea, der noch aus der Zeit vor dem Widerruf stammt:
       er darf nirgends auftauchen, solange sie nicht teilt. */
    tage: [{ uid: 'lea', datum: '2026-09-17', mahlzeiten: [{ kcal: 900 }], kcal: 900 }],
    von: '2026-09-16', bis: '2026-09-18',
  });
  const lea = zeilen.find(z => z.uid === 'lea');
  assert.equal(lea.status, STATUS.nichtGeteilt);
  assert.deepEqual(lea.tage, []);
  assert.equal(lea.kcal, 0);
});

test('Tage ausserhalb des Zeitraums zählen nicht mit', () => {
  const zeilen = dashboardZeilen({
    mitglieder: [{ uid: 'timo', name: 'Timothy' }],
    freigaben: { timo: true },
    tage: [
      { uid: 'timo', datum: '2026-09-10', mahlzeiten: [{ kcal: 500 }], kcal: 500 },
      { uid: 'timo', datum: '2026-09-17', mahlzeiten: [{ kcal: 700 }], kcal: 700 },
    ],
    von: '2026-09-16', bis: '2026-09-18',
  });
  assert.equal(zeilen[0].tage.length, 1);
  assert.equal(zeilen[0].kcal, 700);
});

test('ein Tag ohne Mahlzeit ist kein Eintrag', () => {
  const zeilen = dashboardZeilen({
    mitglieder: [{ uid: 'timo', name: 'Timothy' }],
    freigaben: { timo: true },
    tage: [{ uid: 'timo', datum: '2026-09-17', mahlzeiten: [], kcal: 0 }],
    von: '2026-09-16', bis: '2026-09-18',
  });
  assert.equal(zeilen[0].status, STATUS.leer);
});

/* ── Die Zusage ────────────────────────────────────────────────────*/

test('ohne gültige Zusage wird gefragt — auch nach einer alten Fassung', () => {
  assert.equal(mussFragen(null), true);
  assert.equal(mussFragen({ an: false, fassung: EINWILLIGUNG }), true);
  assert.equal(mussFragen({ an: true, fassung: 0 }), true);
  assert.equal(mussFragen({ an: true, fassung: EINWILLIGUNG }), false);
  assert.equal(freigabeGilt({ an: true, fassung: EINWILLIGUNG + 1 }), true);
});

test('die Zusage nennt die Leitung mit Namen, nicht „die Gruppe"', () => {
  const namen = sehendePersonen([
    { uid: 'michel', name: 'Michel', rolle: 'head' },
    { uid: 'anna', name: 'Anna', rolle: 'staff' },
    { uid: 'timo', name: 'Timothy', rolle: 'mitglied' },
  ]);
  assert.deepEqual(namen, ['Michel', 'Anna']);
});

/* ── Der Bereich ───────────────────────────────────────────────────*/

test('Essen gibt es nur im Kader und im Verein, und nur eingeschaltet', () => {
  assert.equal(essenMoeglich('kader'), true);
  assert.equal(essenMoeglich('organisation'), true);
  assert.equal(essenMoeglich('familie'), false);
  assert.equal(essenAn({ art: 'kader', bereiche: { essen: true } }), true);
  assert.equal(essenAn({ art: 'kader', bereiche: {} }), false);
  assert.equal(essenAn({ art: 'kader' }), false);
  assert.equal(essenAn({ art: 'familie', bereiche: { essen: true } }), false);
  assert.equal(essenAn(null), false);
});

/* ── Wer darf was ──────────────────────────────────────────────────
   Die neun Fälle, die für jeden neuen Zugriffsweg gelten. */

const fall = (o) => darfEssen({ angemeldet: true, ...o });

test('der Eigentümer darf lesen, schreiben und löschen', () => {
  const ich = { rolle: 'mitglied', uid: 'timo', zielUid: 'timo' };
  for (const aktion of ['get', 'list', 'create', 'update', 'delete']) {
    assert.equal(fall({ ...ich, aktion }), true, aktion);
  }
});

test('die Leitung liest — und schreibt und löscht NICHT', () => {
  for (const rolle of ['head', 'staff']) {
    const trainer = { rolle, uid: 'michel', zielUid: 'timo' };
    assert.equal(fall({ ...trainer, aktion: 'get' }), true);
    assert.equal(fall({ ...trainer, aktion: 'list' }), true);
    assert.equal(fall({ ...trainer, aktion: 'create' }), false);
    assert.equal(fall({ ...trainer, aktion: 'update' }), false);
    assert.equal(fall({ ...trainer, aktion: 'delete' }), false);
  }
});

test('ein gewöhnliches Mitglied sieht die Daten anderer nicht — weder einzeln noch als Liste', () => {
  const lea = { rolle: 'mitglied', uid: 'lea', zielUid: 'timo' };
  for (const aktion of ['get', 'list', 'create', 'update', 'delete']) {
    assert.equal(fall({ ...lea, aktion }), false, aktion);
  }
});

test('wer aus der Gruppe entfernt wurde, hat keine Rolle und damit keinen Zugang', () => {
  /* Das ist der ganze Mechanismus: das Mitgliedsdokument ist weg,
     inGroup() ist falsch, jeder Zweig faellt. Auch beim eigenen Tag. */
  for (const ziel of ['timo', 'michel']) {
    for (const aktion of ['get', 'list', 'create', 'update', 'delete']) {
      assert.equal(fall({ rolle: '', uid: 'timo', zielUid: ziel, aktion }), false);
    }
  }
});

test('ein Trainer einer anderen Gruppe hat hier keine Rolle', () => {
  /* Der Pfad traegt die Gruppe: groups/{gid}/essen. Wer in DIESER
     Gruppe nicht steht, hat rolle '' — ganz gleich, was er anderswo
     leitet. */
  assert.equal(fall({ rolle: '', uid: 'fremderTrainer', zielUid: 'timo', aktion: 'get' }), false);
  assert.equal(fall({ rolle: '', uid: 'fremderTrainer', zielUid: 'timo', aktion: 'list' }), false);
});

test('ohne Anmeldung gar nichts', () => {
  assert.equal(darfEssen({ angemeldet: false, rolle: 'head', uid: 'michel', zielUid: 'timo', aktion: 'get' }), false);
  assert.equal(darfFreigabe({ angemeldet: false, rolle: 'head', uid: 'michel', zielUid: 'timo', aktion: 'get' }), false);
});

test('eine unbekannte Aktion ist verboten, nicht erlaubt', () => {
  assert.equal(fall({ rolle: 'head', uid: 'michel', zielUid: 'timo', aktion: 'alles' }), false);
});

test('die Freigabe: lesen Leitung und man selbst, auflisten nur die Leitung, schreiben nur man selbst', () => {
  const ich = { angemeldet: true, rolle: 'mitglied', uid: 'timo', zielUid: 'timo' };
  const trainer = { angemeldet: true, rolle: 'head', uid: 'michel', zielUid: 'timo' };
  const andere = { angemeldet: true, rolle: 'mitglied', uid: 'lea', zielUid: 'timo' };

  assert.equal(darfFreigabe({ ...ich, aktion: 'get' }), true);
  assert.equal(darfFreigabe({ ...ich, aktion: 'list' }), false);
  assert.equal(darfFreigabe({ ...ich, aktion: 'update' }), true);

  assert.equal(darfFreigabe({ ...trainer, aktion: 'get' }), true);
  assert.equal(darfFreigabe({ ...trainer, aktion: 'list' }), true);
  assert.equal(darfFreigabe({ ...trainer, aktion: 'update' }), false);

  assert.equal(darfFreigabe({ ...andere, aktion: 'get' }), false);
  assert.equal(darfFreigabe({ ...andere, aktion: 'update' }), false);
});

/* ══ Die Regeln ═══════════════════════════════════════════════════
   Jede Behauptung des Modells muss sich im Regeltext wiederfinden.
   Ohne Emulator ist das die einzige Klammer zwischen beiden. */

test('die Regeln kennen beide Sammlungen', async () => {
  const rules = await readRules();
  block(rules, '/groups/{gid}/essen/{id}');
  block(rules, '/groups/{gid}/essenFreigabe/{uid}');
});

test('Regel: ein Tag wird über die Kennung gelesen und über das Feld aufgelistet', async () => {
  const b = block(await readRules(), '/groups/{gid}/essen/{id}');
  /* get über die Kennung — sonst kann ein Athlet einen Tag ohne
     Dokument gar nicht erst anfragen (dieselbe Falle wie beim
     Trainingsprotokoll, v.35.50.0). */
  assert.match(b, /allow get: if inGroup\(gid\)\s*&&\s*\(id\.split\('__'\)\[0\] == request\.auth\.uid \|\| leadsGroup\(gid\)\)/);
  assert.match(b, /allow list: if inGroup\(gid\)/);
  assert.match(b, /resource\.data\.get\('uid', ''\) == request\.auth\.uid \|\| leadsGroup\(gid\)/);
});

test('Regel: die Leitung darf ein Essensprotokoll weder schreiben noch löschen', async () => {
  const b = block(await readRules(), '/groups/{gid}/essen/{id}');
  const schreiben = b.slice(b.indexOf('allow create, update:'), b.indexOf('allow delete:'));
  assert.doesNotMatch(schreiben, /leadsGroup/);
  assert.match(schreiben, /request\.resource\.data/);

  const loeschen = b.slice(b.indexOf('allow delete:'));
  assert.doesNotMatch(loeschen, /leadsGroup/);
  assert.match(loeschen, /resource\.data\.get\('uid', ''\) == request\.auth\.uid/);
});

test('Regel: geschrieben wird nur, solange die Freigabe steht', async () => {
  const b = block(await readRules(), '/groups/{gid}/essen/{id}');
  assert.match(b, /function teiltMit\(\)/);
  assert.match(b, /essenFreigabe\/\$\(request\.auth\.uid\)\)\.data\.an == true/);
  assert.match(b, /allow create, update: if inGroup\(gid\)\s*&&\s*teiltMit\(\)/);
});

test('Regel: die Kennung muss zur uid und zum Datum passen, und das Dokument bleibt begrenzt', async () => {
  const b = block(await readRules(), '/groups/{gid}/essen/{id}');
  assert.match(b, /id == request\.auth\.uid \+ '__' \+ d\.datum/);
  assert.match(b, /d\.uid == request\.auth\.uid/);
  assert.match(b, /d\.datum\.matches\('\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}'\)/);
  assert.match(b, /d\.mahlzeiten\.size\(\) <= 40/);
  assert.match(b, /hasOnly\(\[[\s\S]*?'uid', 'datum', 'mahlzeiten'/);
});

test(`Regel: das Dokument der Gruppe kennt kein Feld ausser den erlaubten (${MAHLZEITEN_MAX} Mahlzeiten)`, async () => {
  const b = block(await readRules(), '/groups/{gid}/essen/{id}');
  const erlaubt = b.slice(b.indexOf('hasOnly(['), b.indexOf('hasOnly([') + 400);
  for (const feld of ['uid', 'datum', 'mahlzeiten', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'stand', 'aktualisiert']) {
    assert.ok(erlaubt.includes(`'${feld}'`), `Feld fehlt in hasOnly: ${feld}`);
  }
  /* Gewicht und Ziel haben hier nichts verloren. */
  for (const verboten of ['weight', 'gewicht', 'goal', 'ziel']) {
    assert.ok(!erlaubt.includes(`'${verboten}'`), `Feld darf nicht erlaubt sein: ${verboten}`);
  }
});

test('Regel: die Freigabe schreibt nur die Person selbst, auflisten darf nur die Leitung', async () => {
  const b = block(await readRules(), '/groups/{gid}/essenFreigabe/{uid}');
  assert.match(b, /allow get: if inGroup\(gid\) && \(request\.auth\.uid == uid \|\| leadsGroup\(gid\)\)/);
  assert.match(b, /allow list: if leadsGroup\(gid\)/);
  const schreiben = b.slice(b.indexOf('allow create, update:'), b.indexOf('allow delete:'));
  assert.match(schreiben, /request\.auth\.uid == uid/);
  assert.doesNotMatch(schreiben, /leadsGroup/);
  assert.match(schreiben, /hasOnly\(\['uid', 'an', 'fassung', 'seit'\]\)/);
});

test('der persönliche Food Tracker bleibt, wie er war — die Gruppe hat auf ihn keinen Weg', async () => {
  const rules = await readRules();
  const b = block(rules, '/foodlog/{ownerUid}/{p=**}');
  /* Kein Zweig für eine Gruppe, keine Leitung, kein inGroup: der
     persoenliche Ordner traegt Gewicht und Ziel, und die bleiben
     persoenlich. Dass er unveraendert ist, ist hier das Ergebnis. */
  assert.doesNotMatch(b, /inGroup|leadsGroup|essen/);
  assert.match(b, /request\.auth\.uid == ownerUid/);
  assert.match(b, /hasModuleShare\(ownerUid, 'food'\)/);
});

test('essen.js schreibt nichts unter foodlog — die Trennung steht auch im Code', async () => {
  /* Ohne Kommentare: dort steht foodlog absichtlich, als Erklaerung. */
  const quelle = (await readFile(join(root, 'assets/js/essen.js'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(quelle, /foodlog/);
  assert.match(quelle, /'groups', gid, 'essen'/);
  assert.match(quelle, /'groups', gid, 'essenFreigabe'/);
});
