/* Training mit jemandem ausserhalb teilen (v.35.73.0).
 *
 * Der Kern dieses Tests ist eine einzige Frage: kann durch diesen Weg
 * etwas nach draussen, das nicht nach draussen soll? Darum läuft der
 * Auszug hier über ECHTE Plandaten (dev/fixtures/kw31-grid.json, die
 * Woche, mit der auch die Attrappe arbeitet) und wird danach nach
 * Gruppenkennungen, fremden uids und E-Mail-Adressen durchsucht.
 *
 * Dazu die üblichen neun Fälle für einen neuen Zugriffsweg: Besitzer,
 * Leitung, gewöhnliches Mitglied, entfernt, fremde Gruppe, nicht
 * angemeldet, abgelaufen, zurückgezogen, get gegen list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';

import {
  ALPHABET, CODE_LAENGE, GUELTIG_TAGE, DATEN_MAX, TAGE_ZURUECK, TAGE_VORAUS,
  neuerCode, codeGueltig, teilenLink, ablaufAb, alsZeit, abgelaufen,
  UMFANG_FELDER, UMFANG_VORGABE, umfangSauber, auszug, auszugText,
  pruefeAuszug, standAlter,
} from '../assets/js/training-teilen.js';
import { uebungen, eintrag } from '../assets/js/einheit.js';
import { parseProgram } from '../assets/js/training-parser.js';
import { planEinheiten } from '../assets/js/wochenplan.js';

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

/* ── Der Code ──────────────────────────────────────────────────────*/

test('ein Code ist lang, zufällig und aus einem Alphabet ohne Verwechsler', () => {
  const code = neuerCode(webcrypto);
  assert.equal(code.length, CODE_LAENGE);
  assert.ok(codeGueltig(code));
  for (const z of code) assert.ok(ALPHABET.includes(z));
  for (const z of '0O1Il') assert.ok(!ALPHABET.includes(z), `${z} ist verwechselbar`);
});

test('zweihundert Codes sind zweihundert verschiedene Codes', () => {
  const gesehen = new Set();
  for (let i = 0; i < 200; i += 1) gesehen.add(neuerCode(webcrypto));
  assert.equal(gesehen.size, 200);
});

test('ohne sicheren Zufall entsteht gar kein Code — lieber scheitern als schwach', () => {
  assert.throws(() => neuerCode({}), /Zufall/);
  assert.throws(() => neuerCode(null), /Zufall/);
});

test('ein fremder oder verstümmelter Code gilt nicht', () => {
  assert.equal(codeGueltig(''), false);
  assert.equal(codeGueltig('kurz'), false);
  assert.equal(codeGueltig('a'.repeat(CODE_LAENGE)), false, 'Kleinbuchstaben gehören nicht zum Alphabet');
  assert.equal(codeGueltig('0'.repeat(CODE_LAENGE)), false);
  assert.equal(codeGueltig(null), false);
});

test('der Link führt auf die Empfängerseite und trägt nichts als den Code', () => {
  const code = neuerCode(webcrypto);
  const link = teilenLink(code, 'https://firn.test');
  assert.equal(link, `https://firn.test/pages/geteilt.html?t=${code}`);
  /* Keine uid, keine Gruppe, kein Name in der Adresse. */
  assert.doesNotMatch(link, /uid|gid|group|timo/i);
});

/* ── Ablauf ────────────────────────────────────────────────────────*/

test('ein Link hat eine Frist, und die Vorgabe sind 30 Tage', () => {
  const jetzt = Date.parse('2026-09-18T12:00:00Z');
  assert.equal(GUELTIG_TAGE, 30);
  assert.equal(ablaufAb(GUELTIG_TAGE, jetzt).getTime(), jetzt + 30 * 86400000);
});

test('abgelaufen ist abgelaufen — auch eine Sekunde danach', () => {
  const jetzt = 1_000_000_000_000;
  assert.equal(abgelaufen({ bis: new Date(jetzt + 1000) }, jetzt), false);
  assert.equal(abgelaufen({ bis: new Date(jetzt - 1000) }, jetzt), true);
  assert.equal(abgelaufen({ bis: new Date(jetzt) }, jetzt), true);
  /* Ohne Frist gilt nichts. */
  assert.equal(abgelaufen({}, jetzt), true);
  assert.equal(abgelaufen(null, jetzt), true);
});

test('alsZeit versteht Timestamp, Date und Zeichenkette', () => {
  const ms = Date.parse('2026-09-18T12:00:00Z');
  assert.equal(alsZeit({ toMillis: () => ms }), ms);
  assert.equal(alsZeit({ seconds: ms / 1000 }), ms);
  assert.equal(alsZeit(new Date(ms)), ms);
  assert.equal(alsZeit('2026-09-18T12:00:00Z'), ms);
  assert.equal(alsZeit(null), 0);
});

/* ── Der Umfang ────────────────────────────────────────────────────*/

test('die Vorgabe teilt keine Werte und keine Notizen — und nie die privaten', () => {
  assert.equal(UMFANG_VORGABE.werte, false);
  assert.equal(UMFANG_VORGABE.notizen, false);
  assert.equal(UMFANG_VORGABE.privat, false);
  assert.equal(UMFANG_VORGABE.einheiten, true);
});

test('umfangSauber kennt nur die sechs Felder und erfindet keine', () => {
  const u = umfangSauber({ einheiten: true, uebungen: true, werte: 'ja', heimlich: true });
  assert.deepEqual(Object.keys(u).sort(), [...UMFANG_FELDER].sort());
  assert.equal(u.werte, false, 'nur echtes true zählt');
  assert.equal(u.heimlich, undefined);
});

test('ohne Übungen fallen Werte, Notizen und private Notizen weg', () => {
  const u = umfangSauber({ uebungen: false, werte: true, notizen: true, privat: true });
  assert.equal(u.werte, false);
  assert.equal(u.notizen, false);
  assert.equal(u.privat, false);
  assert.equal(u.einheiten, true, 'ohne Einheiten gäbe es nichts zu sehen');
});

/* ── Der Auszug, an echten Plandaten ───────────────────────────────*/

const HEUTE = '2026-08-05';
let kw31 = null;
async function planDaten() {
  if (kw31) return kw31;
  const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
  kw31 = parseProgram(grid);
  return kw31;
}

async function bauen(umfang, { protokoll = null, privat = {} } = {}) {
  const programm = await planDaten();
  const quellen = [{
    gid: 'g1', gruppe: 'BSV Perspektivkader',
    plan: { id: 'p1', fuer: 'timo', erstelltAm: { seconds: 1 } },
    programm,
  }];
  const einheiten = planEinheiten(quellen, HEUTE);
  const programme = new Map([['g1|p1', programm]]);
  const protokolle = new Map([['g1', protokoll ? { [protokoll.datum]: protokoll } : {}]]);
  return auszug({
    name: 'Timothy van Zanten',
    einheiten, programme, protokolle, privat,
    umfang, helfer: { uebungen, eintrag },
    von: '2026-07-01', bis: '2026-12-31',
  });
}

test('der Auszug enthält die Tage und Einheiten des echten Plans', async () => {
  const a = await bauen(UMFANG_VORGABE);
  assert.equal(a.schema, 1);
  assert.equal(a.name, 'Timothy van Zanten');
  assert.ok(a.tage.length >= 5, `nur ${a.tage.length} Tage`);
  assert.ok(a.tage.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.datum)));
  assert.ok(a.tage.some(t => t.einheiten.some(e => (e.uebungen || []).length)));
  /* Nach Datum sortiert. */
  const daten = a.tage.map(t => t.datum);
  assert.deepEqual(daten, [...daten].sort());
});

test('KEINE Gruppenkennung, keine fremde uid, keine Adresse im Auszug', async () => {
  for (const umfang of [UMFANG_VORGABE, { einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: true, privat: true }]) {
    const a = await bauen(umfang, {
      protokoll: { datum: '2026-08-03', units: {} },
      privat: { '2026-08-03': { 'g1~kraft-beine': 'Knie zwickt' } },
    });
    const treffer = pruefeAuszug(a, {
      verboten: ['g1', 'p1', 'BSV Perspektivkader', 'michel', 'lea', 'ownerUid'],
    });
    assert.deepEqual(treffer, [], `Auszug trägt: ${treffer}`);
  }
});

test('der Auszug hat genau die Felder, die er haben soll — kein spread von irgendwas', async () => {
  const a = await bauen({ einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: true, privat: false });
  assert.deepEqual(Object.keys(a).sort(), ['bis', 'name', 'schema', 'tage', 'umfang', 'von']);
  const einheit = a.tage.flatMap(t => t.einheiten).find(e => (e.uebungen || []).length);
  for (const feld of Object.keys(einheit)) {
    assert.ok(['titel', 'zeit', 'slot', 'uebungen', 'fortschritt', 'privatNotiz'].includes(feld), `unerwartetes Feld: ${feld}`);
  }
  for (const feld of Object.keys(einheit.uebungen[0])) {
    assert.ok(['name', 'modus', 'anweisung', 'pause', 'video', 'saetze', 'erledigt', 'notiz'].includes(feld),
      `unerwartetes Feld an der Übung: ${feld}`);
  }
});

test('ohne den Haken „Übungen" stehen nur die Einheiten da', async () => {
  const a = await bauen({ einheiten: true, uebungen: false, fortschritt: false, werte: false, notizen: false, privat: false });
  for (const tag of a.tage) {
    for (const e of tag.einheiten) {
      assert.equal(e.uebungen, undefined);
      assert.equal(e.fortschritt, undefined);
      assert.ok(e.titel);
    }
  }
});

test('ohne den Haken „Werte" gehen eingetragene Gewichte und Wiederholungen NICHT mit', async () => {
  const programm = await planDaten();
  /* Das Protokoll muss an dem Tag hängen, an dem die Einheit im Plan
     steht — sonst findet der Auszug es nie, und der Test wäre grün,
     ohne etwas gemessen zu haben. */
  const geplant = planEinheiten([{ gid: 'g1', plan: { id: 'p1', fuer: 'timo' }, programm }], HEUTE)
    .find(e => e.unit && uebungen(programm, e.unit).length);
  assert.ok(geplant, 'die Testwoche hat keine Einheit mit Übungen');
  const unitId = geplant.unit;
  const item = uebungen(programm, unitId)[0];
  const protokoll = {
    datum: geplant.datum,
    units: { [unitId]: { items: { [item.key]: {
      done: true, note: 'Notiz an den Trainer',
      sets: [{ weight: '77', reps: '9', ok: true }],
    } } } },
  };

  const ohne = await bauen({ einheiten: true, uebungen: true, fortschritt: true, werte: false, notizen: false, privat: false }, { protokoll });
  const roh = JSON.stringify(ohne);
  assert.doesNotMatch(roh, /"gewicht":"77"/);
  assert.doesNotMatch(roh, /Notiz an den Trainer/);

  const mit = await bauen({ einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: true, privat: false }, { protokoll });
  const rohMit = JSON.stringify(mit);
  assert.match(rohMit, /"gewicht":"77"/);
  assert.match(rohMit, /Notiz an den Trainer/);
});

test('„Nur für mich" geht nur mit, wenn der Haken ausdrücklich steht', async () => {
  const privat = { '2026-08-03': { 'g1~kraft-beine': 'Das sage ich niemandem' } };
  for (const umfang of [
    UMFANG_VORGABE,
    { einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: true, privat: false },
  ]) {
    const a = await bauen(umfang, { privat });
    assert.doesNotMatch(JSON.stringify(a), /Das sage ich niemandem/);
  }
});

test('die private Notiz landet an der richtigen Einheit, wenn der Haken steht', async () => {
  const programm = await planDaten();
  const einheiten = planEinheiten([{ gid: 'g1', plan: { id: 'p1', fuer: 'timo' }, programm }], HEUTE)
    .filter(e => e.unit);
  assert.ok(einheiten.length, 'die Testwoche hat keine Einheit mit Blatt');
  const erste = einheiten[0];
  const a = await bauen(
    { einheiten: true, uebungen: true, fortschritt: true, werte: false, notizen: false, privat: true },
    { privat: { [erste.datum]: { [`g1~${erste.unit}`]: 'Knie zwickt' } } },
  );
  const treffer = a.tage.flatMap(t => t.einheiten).filter(e => e.privatNotiz === 'Knie zwickt');
  assert.equal(treffer.length, 1);
});

test('ein Videolink geht nur mit, wenn er wirklich http(s) ist', async () => {
  const a = await bauen({ einheiten: true, uebungen: true, fortschritt: false, werte: false, notizen: false, privat: false });
  for (const u of a.tage.flatMap(t => t.einheiten).flatMap(e => e.uebungen || [])) {
    if (u.video !== undefined) assert.match(u.video, /^https?:\/\//);
  }
  assert.doesNotMatch(JSON.stringify(a), /javascript:/i);
});

test('der Auszug bleibt unter der Grenze, die auch die Regel zieht', async () => {
  const a = await bauen({ einheiten: true, uebungen: true, fortschritt: true, werte: true, notizen: true, privat: true });
  assert.ok(auszugText(a).length <= DATEN_MAX, `${auszugText(a).length} Zeichen`);
});

test('ein zu grosser Auszug wird gekürzt, nicht abgelehnt', () => {
  const gross = {
    schema: 1, name: 'x', von: '2026-01-01', bis: '2026-12-31', umfang: UMFANG_VORGABE,
    tage: Array.from({ length: 400 }, (_, i) => ({
      datum: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      einheiten: [{ titel: 'A'.repeat(4000) }],
    })),
  };
  const text = auszugText(gross);
  assert.ok(text.length <= DATEN_MAX);
  assert.equal(JSON.parse(text).gekuerzt, true);
});

test('das Fenster ist zwei Wochen zurück und sechs voraus — kein Export', () => {
  assert.equal(TAGE_ZURUECK, 14);
  assert.equal(TAGE_VORAUS, 42);
});

test('die Ansicht sagt, wie alt der Stand ist — sonst hielte man ihn für jetzt', () => {
  const jetzt = 1_000_000_000_000;
  assert.equal(standAlter(jetzt, jetzt), 0);
  assert.equal(standAlter(jetzt - 3 * 3600000, jetzt), 3);
  assert.equal(standAlter(0, jetzt) > 0, true);
});

/* ══ Die Regeln ═══════════════════════════════════════════════════*/

test('Regel: der Code ist der Zugang, und nur solange er gilt', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  assert.match(b, /allow get: if eigene\(\)/);
  assert.match(b, /resource\.data\.bis is timestamp && resource\.data\.bis > request\.time/);
  assert.match(b, /code\.size\(\) == 32/);
});

test('Regel: aufzählen darf nur die Eigentümerin, und nur ihre eigenen', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  assert.match(b, /allow list: if isMember\(\) && resource\.data\.ownerUid == request\.auth\.uid/);
  /* Kein zweiter list-Zweig — sonst wäre die Sammlung durchsuchbar. */
  assert.equal((b.match(/allow list:/g) || []).length, 1);
});

test('Regel: schreiben, ändern und löschen darf nur die Eigentümerin', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  assert.match(b, /allow create: if isMember\(\)[\s\S]*?auszugGueltig/);
  assert.match(b, /allow update: if eigene\(\)/);
  assert.match(b, /request\.resource\.data\.ownerUid == resource\.data\.ownerUid/);
  assert.match(b, /allow delete: if eigene\(\)/);
  assert.match(b, /d\.ownerUid == request\.auth\.uid/);
});

test('Regel: die Gruppe hat auf eine Freigabe keinen Weg', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  /* Kein leadsGroup, kein inGroup, kein gid — die Leitung soll nicht
     einmal sehen können, DASS geteilt wird. */
  assert.doesNotMatch(b, /leadsGroup|inGroup|\bgid\b/);
});

test('Regel: ein Link ohne Ablauf oder mit ewigem Ablauf entsteht gar nicht', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  assert.match(b, /d\.bis is timestamp/);
  assert.match(b, /d\.bis > request\.time/);
  assert.match(b, /d\.bis < request\.time \+ duration\.value\(366, 'd'\)/);
});

test('Regel: das Dokument kennt nur die sieben Felder — und daten bleibt begrenzt', async () => {
  const b = block(await readRules(), '/trainingShares/{code}');
  assert.match(b, /hasOnly\(\[\s*'ownerUid', 'label', 'umfang', 'daten', 'bis', 'erstellt', 'stand'\s*\]\)/);
  assert.match(b, /d\.daten\.size\(\) <= 700000/);
  assert.match(b, /'einheiten', 'uebungen', 'fortschritt', 'werte', 'notizen', 'privat'/);
});

test('die Empfängerseite lädt keine Gruppe, keinen Router und keine Leiste', async () => {
  /* Ohne Kommentare: dort stehen die Namen absichtlich, als Begründung. */
  const ohneKommentar = s => s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const [seite, modul] = (await Promise.all([
    readFile(join(root, 'pages/geteilt.html'), 'utf8'),
    readFile(join(root, 'assets/js/feature/geteilt/geteilt.js'), 'utf8'),
  ])).map(ohneKommentar);
  for (const verboten of ['shell.js', 'router.js', 'groups.js', 'ki-pille.js', 'nav.js']) {
    assert.ok(!seite.includes(verboten), `geteilt.html lädt ${verboten}`);
    assert.ok(!modul.includes(verboten), `geteilt.js lädt ${verboten}`);
  }
  /* Und sie setzt fremden Text nie als Markup. */
  assert.doesNotMatch(modul, /innerHTML/);
  assert.match(seite, /noindex/);
});

test('training-freigaben.js fragt nie eine Gruppe', async () => {
  const quelle = (await readFile(join(root, 'assets/js/training-freigaben.js'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(quelle, /'groups'/);
  assert.match(quelle, /'trainingShares'/);
  /* Die eigene Liste MUSS auf ownerUid filtern — sonst lehnt die
     Regel die ganze Abfrage ab. */
  assert.match(quelle, /where\('ownerUid', '==', uid\)/);
});
