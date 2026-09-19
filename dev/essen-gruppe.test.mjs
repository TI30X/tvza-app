/* Essen auf der Gruppenseite (v.35.72.0), im jsdom.
 *
 * Gemessen wird, was ein Mensch sieht und tut — nicht, was das Modell
 * rechnet (das steht in essen.test.mjs). Die Wege nach Firestore sind
 * Attrappen (gruppe-harness.mjs, ESSEN_STUB); alles davor ist echter
 * Code: das Bedienelement, die Zusage, die Tagesliste, die Übersicht.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { starteGruppe, klick, warte } from './gruppe-harness.mjs';

const KADER = [
  { uid: 'michel', name: 'Michel van Zanten', rolle: 'head' },
  { uid: 'timo', name: 'Timothy van Zanten', rolle: 'mitglied' },
  { uid: 'lea', name: 'Lea Müller', rolle: 'mitglied' },
];
const MIT_ESSEN = { id: 'g1', name: 'BSV', art: 'kader', bereiche: { termine: true, essen: true } };
const HEUTE = '2026-08-05';

const alsAthlet = (extra = {}) => starteGruppe({
  gruppen: [{ ...MIT_ESSEN, meineRolle: 'mitglied' }],
  mitglieder: KADER, heute: HEUTE, ...extra,
});
const alsLeitung = (extra = {}) => starteGruppe({
  gruppen: [{ ...MIT_ESSEN, meineRolle: 'head' }],
  mitglieder: KADER, heute: HEUTE, ...extra,
});

const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);

/* ── Der Bereich ───────────────────────────────────────────────────*/

test('ohne eingeschalteten Bereich gibt es Essen auf der Gruppenseite nicht', async () => {
  const { doc, zurueck } = await starteGruppe({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', bereiche: { termine: true }, meineRolle: 'head' }],
    mitglieder: KADER, heute: HEUTE,
  });
  try {
    assert.equal(doc.getElementById('grpEssenZeile').hidden, true);
  } finally { zurueck(); }
});

test('eine Familie kann Essen nicht einschalten — der Schalter steht nicht da', async () => {
  const { doc, zurueck } = await starteGruppe({
    gruppen: [{ id: 'g2', name: 'Familie', art: 'familie', bereiche: { termine: true }, meineRolle: 'head' }],
    mitglieder: KADER, heute: HEUTE,
  });
  try {
    klick(doc.getElementById('btnGruppeEinst'));
    assert.equal(doc.getElementById('essenEinst').hidden, true);
  } finally { zurueck(); }
});

test('die Leitung schaltet Essen in den Einstellungen der Gruppe ein', async () => {
  const { doc, zurueck } = await starteGruppe({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', bereiche: { termine: true }, meineRolle: 'head' }],
    mitglieder: KADER, heute: HEUTE,
  });
  try {
    klick(doc.getElementById('btnGruppeEinst'));
    const schalter = doc.getElementById('essenEinst');
    assert.equal(schalter.hidden, false);
    assert.equal(doc.getElementById('essenAn').checked, false);

    doc.getElementById('essenAn').checked = true;
    doc.getElementById('essenAn').dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    await warte(() => aufrufe('bereichSchalten').length > 0);
    assert.deepEqual(aufrufe('bereichSchalten')[0].slice(1), ['g1', 'essen', true]);
  } finally { zurueck(); }
});

test('ein gewöhnliches Mitglied sieht den Schalter der Gruppe nicht', async () => {
  const { doc, zurueck } = await alsAthlet();
  try {
    assert.equal(doc.getElementById('essenEinst').hidden, true);
    /* Die Zeile "Essen: erfassen" sieht es sehr wohl — nur die
       Übersicht nicht. */
    assert.equal(doc.getElementById('grpEssenZeile').hidden, false);
    assert.equal(doc.getElementById('btnEssenTeam').hidden, true);
  } finally { zurueck(); }
});

/* ── Die Zusage ────────────────────────────────────────────────────*/

test('vor dem ersten Eintrag steht die Zusage — mit den Namen der Trainer', async () => {
  const { doc, zurueck } = await alsAthlet();
  try {
    klick(doc.getElementById('btnEssen'));
    await warte(() => doc.getElementById('essenZusage').hidden === false);

    assert.equal(doc.getElementById('essenZusage').hidden, false);
    /* Kein Formular, solange nicht zugesagt ist. */
    assert.equal(doc.getElementById('essenForm').hidden, true);
    assert.match(doc.getElementById('essenZusageWer').textContent, /Michel van Zanten/);
    /* Und keine Athleten in der Liste derer, die sehen. */
    assert.doesNotMatch(doc.getElementById('essenZusageWer').textContent, /Lea/);
    assert.match(doc.getElementById('essenZusageText').textContent, /Food Tracker/);
  } finally { zurueck(); }
});

test('erst die Zusage macht das Formular auf', async () => {
  const { doc, zurueck } = await alsAthlet();
  try {
    klick(doc.getElementById('btnEssen'));
    await warte(() => doc.getElementById('essenZusage').hidden === false);
    klick(doc.getElementById('btnEssenZusagen'));
    await warte(() => doc.getElementById('essenForm').hidden === false);

    assert.deepEqual(aufrufe('freigabeSetzen')[0].slice(1), ['g1', 'timo', true]);
    assert.equal(doc.getElementById('essenZusage').hidden, true);
    assert.equal(doc.getElementById('essenTeiltKarte').hidden, false);
    assert.match(doc.getElementById('essenTeiltText').textContent, /Michel van Zanten/);
  } finally { zurueck(); }
});

test('wer schon zugesagt hat, wird nicht noch einmal gefragt', async () => {
  const { doc, zurueck } = await alsAthlet({ essen: { freigabe: { uid: 'timo', an: true, fassung: 1 } } });
  try {
    klick(doc.getElementById('btnEssen'));
    await warte(() => doc.getElementById('essenForm').hidden === false);
    assert.equal(doc.getElementById('essenZusage').hidden, true);
  } finally { zurueck(); }
});

/* ── Erfassen ──────────────────────────────────────────────────────*/

async function offenMitZusage(daten = {}, extra = {}) {
  const h = await alsAthlet({ essen: { freigabe: { uid: 'timo', an: true, fassung: 1 }, ...daten }, ...extra });
  klick(h.doc.getElementById('btnEssen'));
  await warte(() => h.doc.getElementById('essenForm').hidden === false);
  return h;
}

test('eine Mahlzeit wird mit Zutaten, Mengen und Nährwerten gespeichert', async () => {
  const { doc, zurueck } = await offenMitZusage();
  try {
    const erf = doc.getElementById('essenErfassung');
    const name = erf.querySelector('[data-name]');
    const gramm = erf.querySelector('[data-gramm]');
    name.value = 'Haferflocken';
    name.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    gramm.value = '80';
    gramm.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));

    /* Die Nährwerte stehen da, bevor gespeichert wird. */
    assert.equal(erf.querySelector('[data-nutri]').hidden, false);
    assert.match(erf.querySelector('[data-nutri]').textContent, /kcal/);

    doc.getElementById('essenMahlzeit').value = 'fruehstueck';
    klick(doc.getElementById('btnEssenSpeichern'));
    await warte(() => aufrufe('tagSchreiben').length > 0);

    const [, gid, uid, datum, mahlzeiten] = aufrufe('tagSchreiben')[0];
    assert.equal(gid, 'g1');
    assert.equal(uid, 'timo');
    assert.equal(datum, HEUTE);
    assert.equal(mahlzeiten.length, 1);
    assert.equal(mahlzeiten[0].mahlzeit, 'fruehstueck');
    assert.deepEqual(mahlzeiten[0].zutaten, [{ name: 'Haferflocken', g: 80 }]);
    assert.ok(mahlzeiten[0].kcal > 0);
  } finally { zurueck(); }
});

test('ohne Zutat wird nichts gespeichert, und es steht da warum', async () => {
  const { doc, zurueck } = await offenMitZusage();
  try {
    klick(doc.getElementById('btnEssenSpeichern'));
    await warte(() => doc.getElementById('essenFehler').hidden === false);
    assert.equal(aufrufe('tagSchreiben').length, 0);
    assert.match(doc.getElementById('essenFehler').textContent, /Zutat/);
  } finally { zurueck(); }
});

test('scheitert das Speichern, steht der Grund da statt einer stillen Leere', async () => {
  const { doc, zurueck } = await offenMitZusage();
  globalThis.__essenFehler = 'schreiben';   // erst NACH dem Laden setzen
  try {
    const erf = doc.getElementById('essenErfassung');
    erf.querySelector('[data-name]').value = 'Vollmilch';
    erf.querySelector('[data-gramm]').value = '200';
    erf.querySelector('[data-gramm]').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    klick(doc.getElementById('btnEssenSpeichern'));
    await warte(() => doc.getElementById('essenFehler').hidden === false);
    assert.match(doc.getElementById('essenFehler').textContent, /nicht geklappt/);
    /* Der Knopf ist wieder da — nicht dauerhaft gesperrt. */
    assert.equal(doc.getElementById('btnEssenSpeichern').disabled, false);
  } finally { globalThis.__essenFehler = null; zurueck(); }
});

test('der Tag zeigt, was schon erfasst ist — mit Zutaten und Kalorien', async () => {
  const { doc, zurueck } = await offenMitZusage({
    tage: [{
      uid: 'timo', datum: HEUTE, kcal: 700,
      mahlzeiten: [{ id: 'm1', mahlzeit: 'mittag', zutaten: [{ name: 'Reis (gekocht)', g: 200 }], kcal: 260, protein: 5, carbs: 56, fat: 0.6, fibre: 1 }],
    }],
  });
  try {
    await warte(() => doc.getElementById('essenTagListe').textContent.includes('Reis'));
    assert.match(doc.getElementById('essenTagListe').textContent, /Reis \(gekocht\) 200 g/);
    assert.equal(doc.getElementById('essenTagSumme').hidden, false);
    assert.match(doc.getElementById('essenTagSumme').textContent, /260 kcal/);
  } finally { zurueck(); }
});

test('ein leerer Tag sagt, dass er leer ist — und nicht nichts', async () => {
  const { doc, zurueck } = await offenMitZusage();
  try {
    await warte(() => doc.getElementById('essenTagListe').textContent.length > 0);
    assert.match(doc.getElementById('essenTagListe').textContent, /noch nichts erfasst/);
  } finally { zurueck(); }
});

test('lässt sich der Tag nicht laden, heisst es so — nicht „nichts gegessen"', async () => {
  const { doc, zurueck } = await offenMitZusage({}, { essenFehler: 'tag' });
  try {
    await warte(() => doc.getElementById('essenTagListe').textContent.includes('nicht laden'));
    assert.match(doc.getElementById('essenTagListe').textContent, /nicht laden/);
    assert.doesNotMatch(doc.getElementById('essenTagListe').textContent, /noch nichts erfasst/);
  } finally { zurueck(); }
});

test('eine bestehende Mahlzeit lässt sich bearbeiten, ohne die anderen zu verlieren', async () => {
  const { doc, zurueck } = await offenMitZusage({
    tage: [{
      uid: 'timo', datum: HEUTE, kcal: 500,
      mahlzeiten: [
        { id: 'm1', mahlzeit: 'fruehstueck', zutaten: [{ name: 'Haferflocken', g: 80 }], kcal: 298 },
        { id: 'm2', mahlzeit: 'mittag', zutaten: [{ name: 'Vollmilch', g: 200 }], kcal: 130 },
      ],
    }],
  });
  try {
    await warte(() => doc.querySelector('[data-essen-bearbeiten="m1"]'));
    klick(doc.querySelector('[data-essen-bearbeiten="m1"]'));

    const erf = doc.getElementById('essenErfassung');
    assert.equal(erf.querySelector('[data-name]').value, 'Haferflocken');
    erf.querySelector('[data-gramm]').value = '120';
    erf.querySelector('[data-gramm]').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    klick(doc.getElementById('btnEssenSpeichern'));
    await warte(() => aufrufe('tagSchreiben').length > 0);

    const mahlzeiten = aufrufe('tagSchreiben')[0][4];
    assert.equal(mahlzeiten.length, 2, 'die andere Mahlzeit bleibt');
    assert.equal(mahlzeiten.find(m => m.id === 'm1').zutaten[0].g, 120);
    assert.ok(mahlzeiten.find(m => m.id === 'm2'));
  } finally { zurueck(); }
});

test('mit den Pfeilen blättert man Tage, und in die Zukunft geht es nicht', async () => {
  const { doc, zurueck } = await offenMitZusage();
  try {
    assert.equal(doc.getElementById('essenNach').disabled, true, 'heute ist das Ende');
    klick(doc.getElementById('essenVor'));
    await warte(() => aufrufe('ladeTag').some(a => a[3] === '2026-08-04'));
    assert.ok(aufrufe('ladeTag').some(a => a[3] === '2026-08-04'));
    assert.equal(doc.getElementById('essenNach').disabled, false);
  } finally { zurueck(); }
});

/* ── Widerruf ──────────────────────────────────────────────────────*/

test('„Geteiltes löschen" wirft den Verlauf dieser Gruppe weg', async () => {
  const { doc, zurueck } = await offenMitZusage({
    tage: [{ uid: 'timo', datum: HEUTE, kcal: 100, mahlzeiten: [{ id: 'm1', mahlzeit: 'snack', zutaten: [{ name: 'Vollmilch', g: 100 }], kcal: 65 }] }],
  });
  try {
    klick(doc.getElementById('btnEssenVerlauf'));
    await warte(() => aufrufe('verlaufLoeschen').length > 0);
    assert.deepEqual(aufrufe('verlaufLoeschen')[0].slice(1), ['g1', 'timo']);
  } finally { zurueck(); }
});

/* ── Die Übersicht ─────────────────────────────────────────────────*/

test('die Übersicht gibt es nur für die Leitung', async () => {
  const { doc, zurueck } = await alsLeitung();
  try {
    assert.equal(doc.getElementById('btnEssenTeam').hidden, false);
  } finally { zurueck(); }
});

test('die Übersicht trennt erfasst, kein Eintrag und teilt nicht', async () => {
  const { doc, zurueck } = await alsLeitung({ essen: {
    freigaben: { timo: true, michel: false, lea: false },
    tage: [{
      uid: 'timo', datum: HEUTE, kcal: 260,
      mahlzeiten: [{ id: 'm1', mahlzeit: 'mittag', zutaten: [{ name: 'Reis (gekocht)', g: 200 }], kcal: 260, protein: 5, carbs: 56, fat: 0.6 }],
    }],
  } });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => doc.getElementById('essenTeamListe').textContent.includes('Timothy'));

    const text = doc.getElementById('essenTeamListe').textContent;
    assert.match(text, /Timothy van Zanten/);
    assert.match(text, /Erfasst/);
    assert.match(text, /Teilt nicht/);
    /* Lea teilt nicht — ihre Zahlen tauchen nirgends auf. */
    assert.doesNotMatch(text, /Lea Müller[\s\S]{0,80}kcal/);
  } finally { zurueck(); }
});

test('ein Tipp auf einen Athleten öffnet seine Tage und Mahlzeiten', async () => {
  const { doc, zurueck } = await alsLeitung({ essen: {
    freigaben: { timo: true },
    tage: [{
      uid: 'timo', datum: HEUTE, kcal: 260,
      mahlzeiten: [{ id: 'm1', mahlzeit: 'mittag', zutaten: [{ name: 'Reis (gekocht)', g: 200 }], kcal: 260, protein: 5, carbs: 56, fat: 0.6 }],
    }],
  } });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => doc.querySelector('[data-essen-auf="timo"]'));
    klick(doc.querySelector('[data-essen-auf="timo"]'));
    await warte(() => doc.getElementById('essenTeamListe').textContent.includes('Reis'));
    assert.match(doc.getElementById('essenTeamListe').textContent, /Reis \(gekocht\) 200 g/);
    assert.match(doc.getElementById('essenTeamListe').textContent, /260 kcal/);
  } finally { zurueck(); }
});

test('wer nicht teilt, lässt sich gar nicht erst aufklappen', async () => {
  const { doc, zurueck } = await alsLeitung({
    essen: { freigaben: { timo: false, lea: false, michel: false }, tage: [] },
  });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => doc.getElementById('essenTeamListe').textContent.includes('Timothy'));
    const kopf = [...doc.querySelectorAll('.essen-athlet__kopf')];
    assert.ok(kopf.length >= 3);
    assert.ok(kopf.every(k => k.disabled), 'niemand teilt — nichts klappt auf');
    assert.match(doc.getElementById('essenTeamListe').textContent, /teilt niemand/);
  } finally { zurueck(); }
});

test('scheitert die Übersicht, steht der Grund da', async () => {
  const { doc, zurueck } = await alsLeitung({ essenFehler: 'zeitraum' });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => doc.getElementById('essenTeamHinweis').hidden === false);
    assert.match(doc.getElementById('essenTeamHinweis').textContent, /nicht laden|Offline/);
  } finally { zurueck(); }
});

test('die schnellen Zeiträume fragen genau den Bereich ab, den sie nennen', async () => {
  const { doc, zurueck } = await alsLeitung({ essen: { freigaben: {}, tage: [] } });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => aufrufe('beobachteZeitraum').length > 0);
    /* Vorgabe: die letzten sieben Tage. */
    assert.deepEqual(aufrufe('beobachteZeitraum')[0].slice(1), ['g1', '2026-07-30', HEUTE]);

    klick(doc.getElementById('essenHeute'));
    await warte(() => aufrufe('beobachteZeitraum').length > 1);
    assert.deepEqual(aufrufe('beobachteZeitraum')[1].slice(1), ['g1', HEUTE, HEUTE]);

    klick(doc.getElementById('essenMonat'));
    await warte(() => aufrufe('beobachteZeitraum').length > 2);
    assert.deepEqual(aufrufe('beobachteZeitraum')[2].slice(1), ['g1', '2026-07-07', HEUTE]);
  } finally { zurueck(); }
});

test('die Übersicht hat keinen Weg, etwas zu ändern', async () => {
  const { doc, zurueck } = await alsLeitung({ essen: {
    freigaben: { timo: true },
    tage: [{ uid: 'timo', datum: HEUTE, kcal: 260, mahlzeiten: [{ id: 'm1', mahlzeit: 'mittag', zutaten: [{ name: 'Reis (gekocht)', g: 200 }], kcal: 260 }] }],
  } });
  try {
    klick(doc.getElementById('btnEssenTeam'));
    await warte(() => doc.querySelector('[data-essen-auf="timo"]'));
    klick(doc.querySelector('[data-essen-auf="timo"]'));
    await warte(() => doc.getElementById('essenTeamListe').textContent.includes('Reis'));
    /* Die Zeitraumfelder oben sind eine Frage, keine Bearbeitung — die
       Liste selbst hat kein einziges Feld und keinen Knopf, der aendert. */
    const liste = doc.getElementById('essenTeamListe');
    assert.equal(liste.querySelectorAll('input, textarea, select, [data-essen-bearbeiten], [data-essen-weg]').length, 0);
  } finally { zurueck(); }
});

/* ── Zurück und Gruppenwechsel ─────────────────────────────────────*/

test('„Zurück" bringt die Woche und die Gruppe wieder her', async () => {
  const { doc, zurueck } = await offenMitZusage();
  try {
    assert.equal(doc.getElementById('secWoche').hidden, true);
    klick(doc.getElementById('btnEssenZurueck'));
    assert.equal(doc.getElementById('secEssen').hidden, true);
    assert.equal(doc.getElementById('secWoche').hidden, false);
    assert.equal(doc.getElementById('grpEssenZeile').hidden, false);
  } finally { zurueck(); }
});
