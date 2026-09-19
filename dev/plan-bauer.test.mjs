/* Eigene Trainingsplaene (v.35.74.0) — das Modell und die Regeln.
 *
 * Der Kern: was der Bauer erzeugt, muss GENAU die Form haben, die der
 * Parser aus der Excel des Kaders macht. Darum laeuft hier beides
 * nebeneinander — die echte KW 31 aus dev/fixtures und ein selbst
 * gebauter Plan —, und dieselben Funktionen lesen beide.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SCHEMA, SLOTS, SLOT_KEYS, slotGueltig, EINHEIT_MAX, UEBUNG_MAX, SAETZE_MAX, PLAN_MAX,
  leererPlan, einheitAnlegen, einheitAendern, einheitVerschieben, einheitDuplizieren,
  einheitLoeschen, findeEinheit, zaehleEinheiten,
  uebungHinzufuegen, uebungLoeschen, uebungVerschieben, uebungAendern, alsItem,
  wocheKopieren, alsVorlage, ausVorlage, planSauber, planText, planLesen,
  istEigenerPlan, montagVon, plusTage, neueKennung,
} from '../assets/js/plan-bauer.js';
import {
  BIBLIOTHEK, MODI, KATEGORIE_KEYS, bibliothek, suche, uebungSauber,
  videoSicher, modusGueltig, kategorieGueltig,
} from '../assets/js/uebungen-bibliothek.js';
import { wochenTage, planTageMitDatum, planEinheiten, agendaTage } from '../assets/js/wochenplan.js';
import { uebungen, einheiten, zeigtSaetze, videoUrl, einheitTitel } from '../assets/js/einheit.js';
import { parseProgram } from '../assets/js/training-parser.js';

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

const MONTAG = '2026-08-03';
const kniebeuge = () => BIBLIOTHEK.find(u => u.id === 'kniebeuge');
const plank = () => BIBLIOTHEK.find(u => u.id === 'plank');

function mitEinheit(titel = 'Kraft Beine', datum = MONTAG, slot = 'vormittag') {
  return einheitAnlegen(leererPlan({ titel: 'Test', montag: MONTAG }), { datum, slot, titel });
}

/* ── Der leere Plan ────────────────────────────────────────────────*/

test('ein leerer Plan hat sieben Tage mit Datum und drei Zeitfenstern', () => {
  const p = leererPlan({ titel: 'Meine Woche', montag: '2026-08-05' });
  assert.equal(p.schema, SCHEMA);
  assert.equal(istEigenerPlan(p), true);
  assert.equal(p.days.length, 7);
  /* Die Woche beginnt am Montag, auch wenn man den Mittwoch angibt. */
  assert.equal(p.days[0].date, MONTAG);
  assert.equal(p.days[6].date, '2026-08-09');
  assert.equal(p.dateRange.start, MONTAG);
  assert.equal(p.dateRange.end, '2026-08-09');
  for (const tag of p.days) assert.deepEqual(tag.slots.map(s => s.key), [...SLOT_KEYS]);
  assert.deepEqual(p.units, {});
});

test('die Zeitfenster sind drei — die Excel kennt zwei, ein eigener Plan auch den Abend', () => {
  assert.deepEqual(SLOTS.map(s => s.key), ['vormittag', 'nachmittag', 'abend']);
  assert.equal(slotGueltig('abend'), true);
  assert.equal(slotGueltig('nacht'), false);
});

test('eine Kennung traegt nie ein ~ — das trennt anderswo Gruppe und Einheit', () => {
  for (let i = 0; i < 50; i += 1) {
    const k = neueKennung('u');
    assert.doesNotMatch(k, /~/);
    assert.match(k, /^[a-z0-9]+$/i);
  }
});

/* ── Einheiten ─────────────────────────────────────────────────────*/

test('eine Einheit entsteht als Eintrag am Tag UND als Blatt', () => {
  const { plan, unitId } = mitEinheit('Kraft Beine');
  const ort = findeEinheit(plan, unitId);
  assert.equal(ort.datum, MONTAG);
  assert.equal(ort.slot, 'vormittag');
  assert.equal(ort.eintrag.title, 'Kraft Beine');
  assert.equal(plan.units[unitId].title, 'Kraft Beine');
  assert.deepEqual(plan.units[unitId].items, []);
  assert.equal(zaehleEinheiten(plan), 1);
});

test('an einem Tag ausserhalb der Woche entsteht nichts', () => {
  assert.throws(() => einheitAnlegen(leererPlan({ montag: MONTAG }), { datum: '2026-09-01', titel: 'X' }), /Woche/);
});

test('umbenennen aendert Eintrag und Blatt zugleich', () => {
  const { plan, unitId } = mitEinheit('Alt');
  const neu = einheitAendern(plan, unitId, { titel: 'Neu', zeit: '18:00' });
  assert.equal(neu.units[unitId].title, 'Neu');
  assert.equal(findeEinheit(neu, unitId).eintrag.title, 'Neu');
  assert.equal(findeEinheit(neu, unitId).eintrag.time, '18:00');
});

test('verschieben nimmt die Einheit mit — an einem Ort, nicht an zweien', () => {
  const { plan, unitId } = mitEinheit();
  const neu = einheitVerschieben(plan, unitId, { datum: '2026-08-06', slot: 'abend' });
  const ort = findeEinheit(neu, unitId);
  assert.equal(ort.datum, '2026-08-06');
  assert.equal(ort.slot, 'abend');
  const alle = neu.days.flatMap(d => d.slots.flatMap(s => s.items)).filter(i => i.unit === unitId);
  assert.equal(alle.length, 1, 'die Einheit steht genau einmal');
});

test('duplizieren gibt eine EIGENE Kennung — sonst waere ein Haken an zwei Tagen gesetzt', () => {
  const { plan, unitId } = mitEinheit();
  const mit = uebungHinzufuegen(plan, unitId, kniebeuge());
  const { plan: zwei, unitId: neu } = einheitDuplizieren(mit, unitId, { datum: '2026-08-06' });
  assert.notEqual(neu, unitId);
  assert.equal(zaehleEinheiten(zwei), 2);
  assert.equal(zwei.units[neu].items.length, zwei.units[unitId].items.length);
  /* Und die Uebungsschluessel sind andere — das Protokoll haengt daran. */
  const alt = zwei.units[unitId].items.map(i => i.key);
  const kopie = zwei.units[neu].items.map(i => i.key);
  assert.equal(kopie.some(k => alt.includes(k)), false, 'die Kopie teilt keinen Schluessel');
});

test('loeschen nimmt Eintrag und Blatt', () => {
  const { plan, unitId } = mitEinheit();
  const weg = einheitLoeschen(plan, unitId);
  assert.equal(findeEinheit(weg, unitId), null);
  assert.equal(weg.units[unitId], undefined);
});

test('mehr als EINHEIT_MAX Einheiten gehen nicht', () => {
  let plan = leererPlan({ montag: MONTAG });
  for (let i = 0; i < EINHEIT_MAX; i += 1) {
    plan = einheitAnlegen(plan, { datum: MONTAG, titel: `E${i}` }).plan;
  }
  assert.throws(() => einheitAnlegen(plan, { datum: MONTAG, titel: 'zu viel' }), /viele/);
});

/* ── Übungen ───────────────────────────────────────────────────────*/

test('aus einer Bibliotheksuebung wird ein Item in der Form des Parsers', () => {
  const item = alsItem(kniebeuge(), { nummer: 1, unitId: 'u1' });
  for (const feld of ['key', 'slug', 'no', 'name', 'alt', 'video', 'mode', 'sets', 'params', 'lines', 'pause', 'tut', 'history']) {
    assert.ok(feld in item, `Feld fehlt: ${feld}`);
  }
  assert.equal(item.mode, 'sets');
  assert.equal(item.sets.length, 3);
  assert.equal(item.sets[0].reps, '8');
  assert.equal(item.sets[0].weight, '');
  assert.match(item.key, /^u1-/);
  /* Das Geraet steht als Kennzahl, wie in der Excel. */
  assert.ok(item.params.some(p => p.label === 'Gerät' && p.value === 'Langhantel'));
});

test('nur der Modus „sets" bringt Satzfelder — der Player entscheidet danach', () => {
  assert.equal(zeigtSaetze(alsItem(kniebeuge(), { unitId: 'u1' })), true);
  assert.equal(zeigtSaetze(alsItem(plank(), { unitId: 'u1' })), false);
  const block_ = alsItem(BIBLIOTHEK.find(u => u.id === 'dauerlauf'), { unitId: 'u1' });
  assert.equal(zeigtSaetze(block_), false);
  assert.equal(block_.mode, 'block');
});

test('Übungen hinzufügen, ordnen und löschen', () => {
  const { plan, unitId } = mitEinheit();
  let p = uebungHinzufuegen(plan, unitId, kniebeuge());
  p = uebungHinzufuegen(p, unitId, plank());
  assert.deepEqual(p.units[unitId].items.map(i => i.name), ['Kniebeuge', 'Unterarmstütz']);

  const keys = p.units[unitId].items.map(i => i.key);
  p = uebungVerschieben(p, unitId, keys[1], -1);
  assert.deepEqual(p.units[unitId].items.map(i => i.name), ['Unterarmstütz', 'Kniebeuge']);

  p = uebungLoeschen(p, unitId, keys[0]);
  assert.deepEqual(p.units[unitId].items.map(i => i.name), ['Unterarmstütz']);
});

test('eine umbenannte Übung behält ihren Schlüssel — daran hängt das Protokoll', () => {
  const { plan, unitId } = mitEinheit();
  const p = uebungHinzufuegen(plan, unitId, kniebeuge());
  const key = p.units[unitId].items[0].key;
  const neu = uebungAendern(p, unitId, key, { name: 'Back Squat', reps: '5' });
  assert.equal(neu.units[unitId].items[0].key, key);
  assert.equal(neu.units[unitId].items[0].name, 'Back Squat');
  assert.equal(neu.units[unitId].items[0].sets[0].reps, '5');
});

test('Sätze lassen sich zählen, aber nicht ins Unendliche', () => {
  const { plan, unitId } = mitEinheit();
  const p = uebungHinzufuegen(plan, unitId, kniebeuge());
  const key = p.units[unitId].items[0].key;
  const viele = uebungAendern(p, unitId, key, { saetze: 99 });
  assert.equal(viele.units[unitId].items[0].sets.length, SAETZE_MAX);
  const keine = uebungAendern(p, unitId, key, { saetze: 0 });
  assert.equal(keine.units[unitId].items[0].sets.length, 0);
});

test('mehr als UEBUNG_MAX Übungen gehen nicht', () => {
  let { plan, unitId } = mitEinheit();
  for (let i = 0; i < UEBUNG_MAX; i += 1) {
    plan = uebungHinzufuegen(plan, unitId, { ...kniebeuge(), name: `Übung ${i}` });
  }
  assert.throws(() => uebungHinzufuegen(plan, unitId, kniebeuge()), /viele/);
});

/* ── Videolinks ────────────────────────────────────────────────────*/

test('ein Videolink muss http oder https sein — sonst gibt es keinen', () => {
  assert.equal(videoSicher('https://example.test/v'), 'https://example.test/v');
  assert.equal(videoSicher('http://example.test/v'), 'http://example.test/v');
  assert.equal(videoSicher('javascript:alert(1)'), '');
  assert.equal(videoSicher('data:text/html,<script>'), '');
  assert.equal(videoSicher('   '), '');
  assert.equal(videoSicher(null), '');
});

test('eine böse Adresse kommt auch über die Übung nicht in den Plan', () => {
  const { plan, unitId } = mitEinheit();
  const p = uebungHinzufuegen(plan, unitId, {
    name: 'Böse', kategorie: 'kraft', modus: 'sets', video: 'javascript:alert(1)',
  });
  assert.equal(p.units[unitId].items[0].video, '');
  /* Und der Player käme ebenfalls nicht daran. */
  assert.equal(videoUrl(p.units[unitId].items[0]), '');
});

/* ── Die Bibliothek ────────────────────────────────────────────────*/

test('jede mitgelieferte Übung hat gültige Kategorie, gültigen Modus und kein Video', () => {
  assert.ok(BIBLIOTHEK.length >= 15);
  for (const u of BIBLIOTHEK) {
    assert.ok(kategorieGueltig(u.kategorie), `${u.name}: ${u.kategorie}`);
    assert.ok(modusGueltig(u.modus), `${u.name}: ${u.modus}`);
    assert.equal(u.eigen, false);
    assert.ok(!u.video, `${u.name} traegt einen Link, fuer den wir geradestehen muessten`);
    assert.ok(u.anweisung, `${u.name} hat keine Anweisung`);
  }
  for (const m of MODI) assert.ok(typeof m === 'string');
  for (const k of KATEGORIE_KEYS) assert.ok(typeof k === 'string');
});

test('eine eigene Übung mit demselben Namen verdrängt die mitgelieferte', () => {
  const liste = bibliothek([{ id: 'x', name: 'Kniebeuge', kategorie: 'kraft', modus: 'sets', geraet: 'zuhause' }]);
  const treffer = liste.filter(u => u.name === 'Kniebeuge');
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].eigen, true);
  assert.equal(treffer[0].geraet, 'zuhause');
});

test('die Suche findet ohne Umlaute und über das Gerät', () => {
  const liste = bibliothek([]);
  assert.ok(suche(liste, 'kniebeuge').some(u => u.name === 'Kniebeuge'));
  assert.ok(suche(liste, 'Langhantel').some(u => u.name === 'Kniebeuge'));
  assert.ok(suche(liste, 'unterarmstuetz').some(u => u.name === 'Unterarmstütz'));
  assert.deepEqual(suche(liste, 'zzzz'), []);
});

test('eine eigene Übung ohne Namen entsteht gar nicht', () => {
  assert.throws(() => uebungSauber({ name: '  ' }), /Namen/);
});

test('ein unbekannter Modus wird zu „sets", keine siebte Art', () => {
  assert.equal(uebungSauber({ name: 'X', modus: 'zauberei' }).modus, 'sets');
  assert.equal(uebungSauber({ name: 'X', kategorie: 'erfunden' }).kategorie, 'sonst');
});

/* ── Woche kopieren, Vorlagen ──────────────────────────────────────*/

test('eine Woche kopieren nimmt Einheiten und Übungen mit — aber neue Kennungen', () => {
  const { plan, unitId } = mitEinheit('Kraft Beine', MONTAG, 'nachmittag');
  const voll = uebungHinzufuegen(plan, unitId, kniebeuge());
  const naechste = wocheKopieren(voll, { nachMontag: '2026-08-10' });

  assert.equal(naechste.dateRange.start, '2026-08-10');
  assert.equal(zaehleEinheiten(naechste), 1);
  const neueId = Object.keys(naechste.units)[0];
  assert.notEqual(neueId, unitId);
  assert.equal(naechste.units[neueId].items.length, 1);
  /* Am selben Wochentag und im selben Zeitfenster. */
  const ort = findeEinheit(naechste, neueId);
  assert.equal(ort.datum, '2026-08-10');
  assert.equal(ort.slot, 'nachmittag');
});

test('eine Vorlage ist ein Blatt ohne Tag — und lässt sich überall einsetzen', () => {
  const { plan, unitId } = mitEinheit('Rumpf');
  const voll = uebungHinzufuegen(plan, unitId, plank());
  const vorlage = alsVorlage(voll, unitId);
  assert.equal(vorlage.titel, 'Rumpf');
  assert.equal(vorlage.items.length, 1);
  assert.equal(vorlage.datum, undefined);

  const { plan: neu, unitId: neuId } = ausVorlage(leererPlan({ montag: MONTAG }), vorlage, {
    datum: '2026-08-07', slot: 'abend',
  });
  assert.equal(neu.units[neuId].items.length, 1);
  assert.equal(findeEinheit(neu, neuId).datum, '2026-08-07');
  assert.notEqual(neu.units[neuId].items[0].key, vorlage.items[0].key);
});

/* ── Speichern ─────────────────────────────────────────────────────*/

test('planSauber wirft Blätter weg, die an keinem Tag stehen', () => {
  const { plan, unitId } = mitEinheit();
  const kaputt = JSON.parse(JSON.stringify(plan));
  kaputt.units.verwaist = { id: 'verwaist', title: 'Nirgends', kind: 'notes', items: [] };
  const sauber = planSauber(kaputt);
  assert.ok(sauber.units[unitId]);
  assert.equal(sauber.units.verwaist, undefined);
});

test('planSauber wirft Eintraege weg, deren Blatt fehlt', () => {
  const plan = leererPlan({ montag: MONTAG });
  plan.days[0].slots[0].items.push({ title: 'Geist', unit: 'gibtsnicht', time: '' });
  const sauber = planSauber(plan);
  assert.equal(sauber.days[0].slots[0].items.length, 0);
});

test('ein Plan geht als Text hinaus und kommt als Plan zurück', () => {
  const { plan, unitId } = mitEinheit();
  const voll = uebungHinzufuegen(plan, unitId, kniebeuge());
  const text = planText(voll);
  assert.ok(text.length < PLAN_MAX);
  const zurueck = planLesen(text);
  assert.equal(istEigenerPlan(zurueck), true);
  assert.equal(zurueck.units[unitId].items[0].name, 'Kniebeuge');
  assert.equal(planLesen('kein json'), null);
  assert.equal(planLesen('{"a":1}'), null, 'ohne Tage ist es kein Plan');
});

/* ══ Dieselbe Form wie die Excel ══════════════════════════════════
   Das ist der eigentliche Punkt: der Player, die Woche, der Kalender
   und das Teilen lesen einen selbst gebauten Plan mit DENSELBEN
   Funktionen wie einen aus der Excel. */

let kw31 = null;
async function ausExcel() {
  if (kw31) return kw31;
  const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  kw31 = parseProgram(grid);
  return kw31;
}

test('wochenTage liest einen eigenen Plan genauso wie einen aus der Excel', async () => {
  const excel = await ausExcel();
  const { plan, unitId } = mitEinheit('Kraft Beine');
  const eigen = uebungHinzufuegen(plan, unitId, kniebeuge());

  for (const p of [excel, eigen]) {
    const tage = wochenTage(p);
    assert.ok(tage.length > 0);
    for (const tag of tage) {
      assert.ok(typeof tag.key === 'string');
      for (const e of tag.eintraege) {
        assert.ok(typeof e.titel === 'string' && e.titel.length > 0);
        assert.ok(typeof e.unit === 'string');
      }
    }
  }
  /* Der eigene Plan traegt seine Daten direkt — keine gerechnete KW. */
  assert.deepEqual(planTageMitDatum(eigen, MONTAG).map(t => t.datum), eigen.days.map(d => d.date));
});

test('uebungen(), einheiten() und einheitTitel() lesen einen eigenen Plan', async () => {
  const { plan, unitId } = mitEinheit('Kraft Beine');
  const eigen = uebungHinzufuegen(uebungHinzufuegen(plan, unitId, kniebeuge()), unitId, plank());
  assert.equal(uebungen(eigen, unitId).length, 2);
  assert.equal(einheitTitel(eigen, unitId), 'Kraft Beine');
  const liste = einheiten(eigen);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].anzahl, 2);
  await ausExcel();
});

test('planEinheiten gibt den eigenen Plan mit Datum zurück — wie einen Gruppenplan', () => {
  const { plan, unitId } = mitEinheit('Kraft Beine', '2026-08-04');
  const eigen = uebungHinzufuegen(plan, unitId, kniebeuge());
  const liste = planEinheiten([{ gid: 'ich', plan: { id: 'p1', fuer: 'timo' }, programm: eigen }], MONTAG);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].datum, '2026-08-04');
  assert.equal(liste[0].gid, 'ich');
  assert.equal(liste[0].unit, unitId);
});

test('Gruppenplan und eigener Plan am selben Tag verdrängen einander NICHT', async () => {
  const excel = await ausExcel();
  const { plan, unitId } = mitEinheit('Mein Abendlauf', '2026-08-03', 'abend');
  const eigen = uebungHinzufuegen(plan, unitId, BIBLIOTHEK.find(u => u.id === 'dauerlauf'));

  const tage = agendaTage({
    montag: MONTAG,
    quellen: [
      { gid: 'g1', gruppe: 'BSV', plan: { id: 'p1', fuer: 'timo', erstelltAm: { seconds: 1 } }, programm: excel },
      { gid: 'ich', gruppe: 'Eigener Plan', plan: { id: 'e1', fuer: 'timo', erstelltAm: { seconds: 2 } }, programm: eigen },
    ],
    heute: MONTAG,
  });
  const montag = tage.find(t => t.datum === MONTAG);
  const quellen = new Set(montag.eintraege.map(e => e.gid));
  assert.ok(quellen.has('g1'), 'der Plan des Kaders fehlt');
  assert.ok(quellen.has('ich'), 'der eigene Plan fehlt');
  assert.ok(montag.eintraege.some(e => e.titel === 'Mein Abendlauf'));
});

/* ══ Die Regeln ═══════════════════════════════════════════════════*/

test('Regel: eigene Pläne liegen owner-only unter trainingPrograms', async () => {
  const b = block(await readRules(), '/users/{uid}/trainingPrograms/{programId}');
  assert.match(b, /allow read, delete: if isMember\(\)\s*&& request\.auth\.uid == uid;/);
  assert.match(b, /hasOnly\(\[\s*'schema', 'id', 'json', 'updatedAt'\s*\]\)/);
  assert.match(b, /json\.size\(\) <= 900000/);
  /* Keine Gruppe kommt hier heran — auch die eigene nicht. */
  assert.doesNotMatch(b, /inGroup|leadsGroup/);
});

test('Regel: die eigene Übungsbibliothek ist owner-only und begrenzt', async () => {
  const b = block(await readRules(), '/users/{uid}/uebungen/{uebungId}');
  assert.match(b, /allow read, delete: if isMember\(\) && request\.auth\.uid == uid;/);
  assert.match(b, /request\.auth\.uid == uid/);
  assert.doesNotMatch(b, /inGroup|leadsGroup/);
  assert.match(b, /hasOnly\(\[[\s\S]*?'id', 'name', 'kategorie', 'anweisung', 'geraet'/);
  assert.match(b, /'kraft', 'sprung', 'rumpf', 'ausdauer', 'mobi', 'sonst'/);
  assert.match(b, /'sets', 'rounds', 'timed', 'block', 'video', 'note'/);
  assert.match(b, /name\.size\(\) <= 80/);
  assert.match(b, /video\.size\(\) <= 500/);
  assert.match(b, /saetze <= 12/);
});

test('Regel und Modell nennen dieselben Kategorien und Modi', async () => {
  const b = block(await readRules(), '/users/{uid}/uebungen/{uebungId}');
  for (const k of KATEGORIE_KEYS) assert.ok(b.includes(`'${k}'`), `Kategorie fehlt in der Regel: ${k}`);
  for (const m of MODI) assert.ok(b.includes(`'${m}'`), `Modus fehlt in der Regel: ${m}`);
});

test('das eigene Protokoll liegt unter trainingLogs — mit derselben Transaktion', async () => {
  const g = await readFile(join(root, 'assets/js/groups.js'), 'utf8');
  assert.match(g, /export const EIGEN = 'ich';/);
  assert.match(g, /const eigenProtokollRef = \(uid, datum\) => doc\(db, 'users', uid, 'trainingLogs', datum\);/);
  /* Ein eigener Plan schreibt nie in eine Gruppe. */
  assert.match(g, /if \(istEigen\(gid\)\) return eigenePlaene\(uid\);/);
  const regeln = block(await readRules(), '/users/{uid}/trainingLogs/{trainingDate}');
  assert.match(regeln, /request\.auth\.uid == uid/);
  assert.doesNotMatch(regeln, /inGroup|leadsGroup/);
});

test('eigene-plaene.js fasst keine Gruppe an', async () => {
  const quelle = (await readFile(join(root, 'assets/js/eigene-plaene.js'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(quelle, /'groups'/);
  assert.match(quelle, /'users', uid, 'trainingPrograms'/);
  assert.match(quelle, /'users', uid, 'uebungen'/);
});
