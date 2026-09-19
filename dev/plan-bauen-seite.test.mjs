/* Der Plan-Bauer im Bereich Training (v.35.74.0), im jsdom.
 *
 * Gemessen wird, was ein Mensch ohne Gruppe und ohne Trainer sieht und
 * tut — und WAS dabei gespeichert würde. Die Wege nach Firestore sind
 * Attrappen (gruppe-harness.mjs, EIGEN_STUB); alles davor ist echter
 * Code: plan-bauer.js, uebungen-bibliothek.js, dialog.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { starteTraining, klick, warte } from './gruppe-harness.mjs';
import { leererPlan, einheitAnlegen, uebungHinzufuegen, findeEinheit } from '../assets/js/plan-bauer.js';
import { BIBLIOTHEK } from '../assets/js/uebungen-bibliothek.js';

const HEUTE = '2026-08-05';
const MONTAG = '2026-08-03';
const aufrufe = name => (globalThis.__aufrufe || []).filter(a => a[0] === name);

/* dialog.js reiht seine Dialoge in EINE Kette. Bleibt einer offen,
   wartet jeder spätere Test ewig auf seinen. */
function dialogeSchliessen(doc) {
  for (const d of doc.querySelectorAll('dialog.frage')) {
    const zu = [...d.querySelectorAll('button')].pop();
    if (zu) zu.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
    else d.remove();
  }
}

/** Auf den Knopf im offenen Dialog tippen, dessen Text passt. */
async function imDialog(doc, muster) {
  const da = await warte(() => doc.querySelector('dialog.frage'));
  assert.ok(da, 'kein Dialog offen');
  const dlg = doc.querySelector('dialog.frage');
  /* Eine Wahlkarte traegt drei Spans; ihr textContent ist voller
     Zeilenumbrueche. Verglichen wird der zusammengezogene Text. */
  const knopf = [...dlg.querySelectorAll('button')]
    .find(b => muster.test(b.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(knopf, `kein Knopf fuer ${muster} — da steht: ${dlg.textContent.slice(0, 160)}`);
  klick(knopf);
  return dlg;
}

/** Ein Eingabedialog: Text setzen und bestätigen. */
async function eingebenImDialog(doc, text) {
  const da = await warte(() => doc.querySelector('dialog.frage .frage__feld'));
  assert.ok(da, 'kein Eingabedialog offen');
  const dlg = doc.querySelector('dialog.frage');
  dlg.querySelector('.frage__feld').value = text;
  const ok = dlg.querySelector('[data-frage="ja"]');
  klick(ok);
}

const beispielPlan = () => {
  const { plan, unitId } = einheitAnlegen(leererPlan({ titel: 'Meine Woche', montag: MONTAG }), {
    datum: '2026-08-04', slot: 'abend', titel: 'Kraft Beine',
  });
  return { id: 'p1', plan: uebungHinzufuegen(plan, unitId, BIBLIOTHEK.find(u => u.id === 'kniebeuge')), unitId };
};

async function ohneGruppe(extra = {}) {
  return starteTraining({ gruppen: [], plaene: [], heute: HEUTE, ...extra });
}

/* ── Der Weg hinein ────────────────────────────────────────────────*/

test('ohne Gruppe und ohne Plan steht der Weg zum eigenen Plan trotzdem da', async () => {
  const { doc, zurueck } = await ohneGruppe();
  try {
    assert.equal(doc.getElementById('secOhne').hidden, false);
    assert.equal(doc.getElementById('bauenZeile').hidden, false, 'Training haengt nicht an einer Gruppe');
    assert.match(doc.getElementById('ohneText').textContent, /selbst/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ohne eigenen Plan sagt der Bauer, was zu tun ist', async () => {
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('secBauen').hidden === false);
    await warte(() => !doc.getElementById('bauenWoche').textContent.includes('Lädt'));
    assert.equal(doc.getElementById('bauenLeer').hidden, false);
    assert.match(doc.getElementById('bauenLeer').textContent, /weder eine Gruppe noch einen Trainer/);
    /* Die Woche tritt zurück, solange der Bauer offen ist. */
    assert.equal(doc.getElementById('secOhne').hidden, true);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('„Zurück" bringt die Seite wieder her', async () => {
  const { doc, zurueck } = await ohneGruppe();
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('secBauen').hidden === false);
    await warte(() => !doc.getElementById('bauenWoche').textContent.includes('Lädt'));
    klick(doc.getElementById('btnBauenZurueck'));
    assert.equal(doc.getElementById('secBauen').hidden, true);
    await warte(() => doc.getElementById('bauenZeile').hidden === false);
    assert.equal(doc.getElementById('bauenZeile').hidden, false);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Einen Plan anlegen ────────────────────────────────────────────*/

test('ein neuer Plan bekommt einen Namen und sieben Tage mit Datum', async () => {
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('secBauen').hidden === false);
    await warte(() => !doc.getElementById('bauenWoche').textContent.includes('Lädt'));
    klick(doc.getElementById('btnPlanNeuEigen'));
    await eingebenImDialog(doc, 'Sommerwoche');
    await warte(() => aufrufe('planSpeichern').length > 0);

    const [, uid, plan] = aufrufe('planSpeichern')[0];
    assert.equal(uid, 'timo');
    assert.equal(plan.name, 'Sommerwoche');
    assert.equal(plan.eigen, true);
    assert.equal(plan.days.length, 7);
    assert.equal(plan.dateRange.start, MONTAG, 'die Woche beginnt am Montag');
    /* Und die Woche steht danach da. */
    await warte(() => doc.getElementById('bauenWoche').textContent.includes('Montag'));
    assert.match(doc.getElementById('bauenTitel').textContent, /Sommerwoche/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('ein bestehender Plan wird mit seinen Tagen und Einheiten gezeichnet', async () => {
  const { plan, id } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('bauenWoche').textContent.includes('Kraft Beine'));
    const text = doc.getElementById('bauenWoche').textContent;
    assert.match(text, /Kraft Beine/);
    assert.match(text, /Abend/);
    assert.match(text, /1 Übung/);
    /* Tage ohne Einheit sagen "frei" statt gar nichts. */
    assert.match(text, /frei/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Eine Einheit anlegen ──────────────────────────────────────────*/

test('eine Einheit entsteht mit Zeitfenster und Namen', async () => {
  const { doc, zurueck } = await ohneGruppe({
    eigenePlaene: [{ id: 'p1', plan: leererPlan({ titel: 'Meine Woche', montag: MONTAG }) }],
  });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector('[data-pb-neu]'));
    klick(doc.querySelector(`[data-pb-neu="${MONTAG}"]`));

    await imDialog(doc, /^Abend$/);
    await eingebenImDialog(doc, 'Abendlauf');
    await warte(() => aufrufe('planSpeichern').length > 0);

    const plan = aufrufe('planSpeichern').at(-1)[2];
    const unitId = Object.keys(plan.units)[0];
    assert.equal(plan.units[unitId].title, 'Abendlauf');
    const ort = findeEinheit(plan, unitId);
    assert.equal(ort.datum, MONTAG);
    assert.equal(ort.slot, 'abend');
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Übungen ───────────────────────────────────────────────────────*/

test('eine Einheit öffnet ihre Übungen und die Bibliothek', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    await warte(() => doc.getElementById('bauenEinheit').hidden === false);

    assert.match(doc.getElementById('bauenEinheitTitel').textContent, /Kraft Beine/);
    assert.match(doc.getElementById('bauenUebungen').textContent, /Kniebeuge/);
    assert.match(doc.getElementById('bauenUebungen').textContent, /3 Sätze/);
    /* Die Bibliothek steht darunter und ist voll. */
    assert.ok(doc.querySelectorAll('[data-pb-bib]').length >= 5);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('eine Übung aus der Bibliothek landet im Plan — in der Form des Parsers', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    /* Die Bibliothek zeigt vierzehn auf einmal — wie ein Mensch sucht
       man erst, dann tippt man. */
    doc.getElementById('bauenSuche').value = 'Unterarm';
    doc.getElementById('bauenSuche').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    await warte(() => doc.querySelector('[data-pb-bib="plank"]'));
    klick(doc.querySelector('[data-pb-bib="plank"]'));
    await warte(() => aufrufe('planSpeichern').length > 0);

    const neu = aufrufe('planSpeichern').at(-1)[2];
    const items = neu.units[unitId].items;
    assert.equal(items.length, 2);
    const stuetz = items.find(i => i.name === 'Unterarmstütz');
    assert.ok(stuetz);
    assert.equal(stuetz.mode, 'timed');
    assert.equal(stuetz.sets.length, 0, 'auf Zeit hat keine Satzfelder');
    assert.match(stuetz.key, new RegExp(`^${unitId}-`));
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('die Suche filtert die Bibliothek, auch ohne Umlaute', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    await warte(() => doc.querySelector('[data-pb-bib]'));

    doc.getElementById('bauenSuche').value = 'unterarmstuetz';
    doc.getElementById('bauenSuche').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    const treffer = [...doc.querySelectorAll('[data-pb-bib]')].map(b => b.textContent);
    assert.equal(treffer.length, 1);
    assert.match(treffer[0], /Unterarmstütz/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Eine eigene Übung ─────────────────────────────────────────────*/

test('eine eigene Übung wird angelegt — mit geprüftem Videolink', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }], eigeneUebungen: [] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    await warte(() => doc.getElementById('btnUebungNeu'));
    klick(doc.getElementById('btnUebungNeu'));
    assert.equal(doc.getElementById('bauenUebungForm').hidden, false);

    doc.getElementById('ubName').value = 'Nordic Curl';
    doc.getElementById('ubKategorie').value = 'kraft';
    doc.getElementById('ubModus').value = 'sets';
    doc.getElementById('ubSaetze').value = '4';
    doc.getElementById('ubReps').value = '6';
    doc.getElementById('ubVideo').value = 'javascript:alert(1)';
    klick(doc.getElementById('btnUbSpeichern'));
    await warte(() => doc.getElementById('ubFehler').hidden === false);
    assert.equal(aufrufe('uebungSpeichern').length, 0, 'eine boese Adresse wird nicht gespeichert');
    assert.match(doc.getElementById('ubFehler').textContent, /http/);

    doc.getElementById('ubVideo').value = 'https://example.test/nordic';
    klick(doc.getElementById('btnUbSpeichern'));
    await warte(() => aufrufe('uebungSpeichern').length > 0);
    const [, , uebung] = aufrufe('uebungSpeichern')[0];
    assert.equal(uebung.name, 'Nordic Curl');
    assert.equal(uebung.video, 'https://example.test/nordic');
    assert.equal(doc.getElementById('bauenUebungForm').hidden, true);
    /* Und sie steht sofort in der Bibliothek. */
    await warte(() => doc.getElementById('bauenBibliothek').textContent.includes('Nordic Curl'));
    assert.match(doc.getElementById('bauenBibliothek').textContent, /Nordic Curl/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('eine Übung ohne Namen entsteht nicht, und es steht da warum', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    await warte(() => doc.getElementById('btnUebungNeu'));
    klick(doc.getElementById('btnUebungNeu'));
    doc.getElementById('ubName').value = '   ';
    klick(doc.getElementById('btnUbSpeichern'));
    await warte(() => doc.getElementById('ubFehler').hidden === false);
    assert.equal(aufrufe('uebungSpeichern').length, 0);
    assert.match(doc.getElementById('ubFehler').textContent, /Namen/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Verschieben, duplizieren, löschen ─────────────────────────────*/

test('eine Einheit lässt sich an einen anderen Tag verschieben', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-verschieben="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-verschieben="${unitId}"]`));
    await imDialog(doc, /Mittwoch/);
    await imDialog(doc, /^Vormittag$/);
    await warte(() => aufrufe('planSpeichern').length > 0);

    const neu = aufrufe('planSpeichern').at(-1)[2];
    const ort = findeEinheit(neu, unitId);
    assert.equal(ort.datum, '2026-08-05');
    assert.equal(ort.slot, 'vormittag');
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('duplizieren legt eine Kopie mit eigener Kennung an', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-kopieren="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-kopieren="${unitId}"]`));
    await imDialog(doc, /Freitag/);
    await warte(() => aufrufe('planSpeichern').length > 0);

    const neu = aufrufe('planSpeichern').at(-1)[2];
    const ids = Object.keys(neu.units);
    assert.equal(ids.length, 2);
    const kopie = ids.find(x => x !== unitId);
    assert.equal(findeEinheit(neu, kopie).datum, '2026-08-07');
    assert.equal(neu.units[kopie].items.length, 1);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('löschen fragt zuerst und nennt den Namen', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-weg="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-weg="${unitId}"]`));
    const dlg = await imDialog(doc, /Löschen/);
    assert.match(dlg.textContent, /Kraft Beine/);
    await warte(() => aufrufe('planSpeichern').length > 0);
    const neu = aufrufe('planSpeichern').at(-1)[2];
    assert.equal(Object.keys(neu.units).length, 0);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Die Woche kopieren ────────────────────────────────────────────*/

test('„Woche kopieren" legt eine neue Woche mit denselben Einheiten an', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('bauenWoche').textContent.includes('Kraft Beine'));
    klick(doc.getElementById('btnWocheKopieren'));
    await imDialog(doc, /10\. Aug/);
    await warte(() => aufrufe('planSpeichern').length > 0);

    const neu = aufrufe('planSpeichern').at(-1)[2];
    assert.equal(neu.dateRange.start, '2026-08-10');
    const ids = Object.keys(neu.units);
    assert.equal(ids.length, 1);
    assert.notEqual(ids[0], unitId, 'die Kopie hat eine eigene Kennung');
    assert.equal(neu.units[ids[0]].items.length, 1);
    /* Und sie wird als NEUER Plan gespeichert, nicht über den alten. */
    assert.equal(aufrufe('planSpeichern').at(-1)[3], '');
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── Scheitern ─────────────────────────────────────────────────────*/

test('scheitert das Speichern, steht der Grund da — und die Änderung bleibt', async () => {
  const { plan, id, unitId } = beispielPlan();
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: [{ id, plan }] });
  globalThis.__eigenFehler = 'speichern';
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.querySelector(`[data-pb-auf="${unitId}"]`));
    klick(doc.querySelector(`[data-pb-auf="${unitId}"]`));
    /* Die Bibliothek zeigt vierzehn auf einmal — wie ein Mensch sucht
       man erst, dann tippt man. */
    doc.getElementById('bauenSuche').value = 'Unterarm';
    doc.getElementById('bauenSuche').dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    await warte(() => doc.querySelector('[data-pb-bib="plank"]'));
    klick(doc.querySelector('[data-pb-bib="plank"]'));

    const dlg = await warte(() => doc.querySelector('dialog.frage'));
    assert.ok(dlg);
    assert.match(doc.querySelector('dialog.frage').textContent, /nicht speichern/);
    /* Die Übung steht trotzdem schon da — nichts geht verloren. */
    assert.match(doc.getElementById('bauenUebungen').textContent, /Unterarmstütz/);
  } finally { globalThis.__eigenFehler = null; dialogeSchliessen(doc); zurueck(); }
});

test('lassen sich die Pläne nicht laden, heisst es so — nicht „keine Pläne"', async () => {
  const { doc, zurueck } = await ohneGruppe({ eigenePlaene: null });
  try {
    klick(doc.getElementById('btnBauen'));
    await warte(() => doc.getElementById('bauenWoche').textContent.includes('nicht laden'));
    assert.match(doc.getElementById('bauenWoche').textContent, /nicht laden/);
    assert.equal(doc.getElementById('bauenLeer').hidden, true);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

/* ── In der Woche ──────────────────────────────────────────────────*/

test('ein eigener Plan steht in der Trainingswoche — ohne jede Gruppe', async () => {
  const { plan } = beispielPlan();
  const { doc, zurueck } = await starteTraining({
    gruppen: [], plaene: [], heute: HEUTE,
    eigeneQuelle: [{ id: 'p1', titel: 'Meine Woche', fuer: 'timo', json: JSON.stringify(plan), eigen: true }],
  });
  try {
    await warte(() => doc.getElementById('secWoche').hidden === false);
    assert.equal(doc.getElementById('secWoche').hidden, false);
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'Eigener Plan');
    assert.match(doc.getElementById('agenda').textContent, /Kraft Beine/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});

test('eigener Plan und Gruppenplan stehen nebeneinander, mit Herkunft', async () => {
  const { plan } = beispielPlan();
  const gruppenPlan = JSON.stringify((() => {
    const { plan: p, unitId } = einheitAnlegen(leererPlan({ titel: 'Kader', montag: MONTAG }), {
      datum: '2026-08-04', slot: 'vormittag', titel: 'Kondi Halle',
    });
    return uebungHinzufuegen(p, unitId, BIBLIOTHEK.find(u => u.id === 'kniebeuge'));
  })());
  const { doc, zurueck } = await starteTraining({
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader', meineRolle: 'mitglied' }],
    plaene: [{ id: 'p9', titel: 'KW 32', fuer: 'alle', json: gruppenPlan }],
    heute: HEUTE,
    eigeneQuelle: [{ id: 'p1', titel: 'Meine Woche', fuer: 'timo', json: JSON.stringify(plan), eigen: true }],
  });
  try {
    await warte(() => doc.getElementById('secWoche').hidden === false);
    const text = doc.getElementById('agenda').textContent;
    assert.match(text, /Kraft Beine/, 'der eigene Plan fehlt');
    assert.match(text, /Kondi Halle/, 'der Plan der Gruppe fehlt');
    /* Bei mehreren Quellen steht dabei, woher — und eine davon ist der
       eigene Plan, darum nicht "Aus deinen Gruppen". */
    assert.equal(doc.getElementById('wocheGruppe').textContent, 'Aus deinen Plänen');
    assert.match(text, /Eigener Plan/);
  } finally { dialogeSchliessen(doc); zurueck(); }
});
