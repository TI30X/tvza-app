/* Die Übernahme aus der Excel, Gewichte und der Timer (v.35.50.0).

   Michel: "Vor allem musst du nochmal überprüfen, dass das Übernehmen aus
   dem Excel einwandfrei funktioniert." Geprüft mit seinen echten Dateien
   (KW 31 und KW 36, beide 8 Einheiten, 54–58 Übungen). Drei Stellen waren
   nicht einwandfrei — hier festgehalten, ohne die Dateien selbst ins Repo
   zu legen (Name, Bilder, 6 MB):
   - eine Zelle "9-11 Uhr" unter "Skiteppich Glarus" wurde ein eigener
     Eintrag der Woche;
   - "??" als Gewicht (die Vorlage lässt es den Athleten bestimmen) wäre
     mit einem Tipp als Gewicht gespeichert worden;
   - "5_5" Wiederholungen stand roh da (fünf je Seite).

   Dazu, was er sich gewünscht hat: ein Timer für Pausen und Übungen auf
   Zeit, das Gewicht bestätigen oder ändern, und dass die Leitung sieht,
   mit wie viel Gewicht wirklich trainiert wird. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { starteEinheit, starteGruppe, klick, warte } from './gruppe-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFile(join(root, p), 'utf8');

const { parseProgram, istUhrzeit } = await import('../assets/js/training-parser.js');
const {
  saetze, eintrag, letzteGewichte, sekundenAus, pauseSekunden, zeitVorgabe, gewichtsVerlauf,
  kennzahlen, vorwochen, gewichtOffen,
} = await import('../assets/js/einheit.js');
const { planTageMitDatum } = await import('../assets/js/wochenplan.js');

const grid = JSON.parse(await read('dev/fixtures/kw31-grid.json'));

/* ── Die Excel ────────────────────────────────────────────────────── */

test('eine Uhrzeit-Zelle gehört zum Eintrag darüber (KW 36: Skiteppich Glarus, 9-11 Uhr)', () => {
  const kopie = structuredClone(grid);
  const woche = kopie.sheets[0].rows;
  /* Donnerstag, Vormittag — so steht es in Michels KW 36. */
  woche[6] = ['Vormittag', '', '', '', '', '', '', '', '', '', '', 'Skiteppich Glarus'];
  woche[7] = ['Vormittag', '', '', '', '', '', '', '', '', '', '', '9-11 Uhr'];
  const tage = planTageMitDatum(parseProgram(kopie));
  const donnerstag = tage.find(t => t.key === 'do');
  const ski = donnerstag.eintraege.filter(e => /Skiteppich|Uhr/.test(e.titel));
  assert.deepEqual(ski.map(e => [e.titel, e.zeit]), [['Skiteppich Glarus', '9–11 Uhr']],
    '"9-11 Uhr" stand als eigenes Training in der Woche');

  for (const v of ['9-11 Uhr', '13:30-15 Uhr', '14 Uhr', '08:00', 'ab 9 Uhr']) assert.ok(istUhrzeit(v), v);
  for (const v of ['Kraft Beine', '5', 'Ausdauer Zone 1', '2 x 20 min', 'Kraft Oberkörper (2 Sätze)']) assert.ok(!istUhrzeit(v), v);
});

test('KW 31 liest sich weiter vollständig: Name, Woche, acht Einheiten', () => {
  const p = parseProgram(grid);
  assert.equal(p.athlete, 'Van Zanten Timothy');
  assert.equal(Object.keys(p.units).length, 8);
  assert.equal(Object.values(p.units).reduce((n, u) => n + (u.items || []).length, 0), 58);
  assert.ok(JSON.stringify(p).length < 900000, 'passt in ein Dokument');
});

test('"??" ist kein Gewicht, "5_5" heisst fünf je Seite', () => {
  const item = {
    key: 'kraft-beine-3-kniebeuge-vorne', slug: 'kniebeuge-vorne', mode: 'sets',
    sets: [{ reps: '9', weight: '??' }, { reps: '7', weight: '??' }],
    history: [{ week: 'TW18', values: ['??', '??'] }],
  };
  assert.ok(gewichtOffen('??') && !gewichtOffen('50'));
  const reihen = saetze(item, eintrag({}, 'u', item.key));
  assert.deepEqual(reihen.map(r => [r.zielWert, r.gewichtFrage, r.vorschlag]), [['', true, ''], ['', true, '']]);
  assert.deepEqual(vorwochen(item), [], 'eine Woche mit lauter "??" ist keine Auskunft');
  assert.deepEqual(kennzahlen({ params: [{ label: 'Wiederholungen', value: '5_5' }] }), [{ label: 'Wiederholungen', wert: '5/5' }]);
});

/* ── Gewicht bestätigen oder ändern ──────────────────────────────── */

test('wo der Plan kein Gewicht nennt, schlägt der Player das vom letzten Mal vor', () => {
  const item = { key: 'kraft-beine-3-kniebeuge-vorne', slug: 'kniebeuge-vorne', sets: [{ reps: '9', weight: '??' }, { reps: '9', weight: '??' }, { reps: '7', weight: '??' }] };
  const verlauf = [
    { datum: '2026-08-04', units: { 'kraft-beine': { items: { 'kraft-beine-3a-kniebeuge-vorne': { sets: [{ weight: '55', reps: '9' }, { weight: '55', reps: '9' }] } } } } },
    { datum: '2026-09-02', units: { 'kraft-beine': { items: { 'kraft-beine-5-kniebeuge-vorne': { sets: [{ weight: '60', reps: '9' }, { weight: '62', reps: '9' }] } } } } },
    { datum: '2026-09-09', units: { 'kraft-beine': { items: { 'kraft-beine-3-kniebeuge-vorne': { sets: [{ weight: '70' }] } } } } },
  ];
  /* Die Nummer vor dem Namen wechselt je Woche — erkannt wird am Namen;
     der Tag selbst und alles danach zählt nicht. */
  const zuletzt = letzteGewichte(verlauf, item, '2026-09-09');
  assert.deepEqual(zuletzt, ['60', '62']);
  const reihen = saetze(item, eintrag({}, 'u', item.key), zuletzt);
  assert.deepEqual(reihen.map(r => [r.vorschlag, r.vorschlagZuletzt]), [['60', true], ['62', true], ['62', true]]);

  /* Im ersten Satz 65 eingetragen: der zweite schlägt dieselben 65 vor. */
  const heute = saetze(item, { done: false, note: '', sets: [{ weight: '65', reps: '9' }] }, zuletzt);
  assert.deepEqual(heute.slice(1).map(r => [r.vorschlag, r.vorschlagDavor, r.vorschlagZuletzt]), [['65', true, false], ['65', true, false]]);

  /* Nennt der Plan ein Gewicht, gilt der Plan. */
  const geplant = saetze({ sets: [{ reps: '9', weight: '50' }] }, eintrag({}, 'u', 'x'), ['60']);
  assert.deepEqual([geplant[0].vorschlag, geplant[0].vorschlagZuletzt], ['50', false]);
});

/* ── Der Timer ───────────────────────────────────────────────────── */

test('Zeiten aus der Vorlage: Pausen und Übungen auf Zeit', () => {
  assert.equal(sekundenAus('120-180 Sec'), 120, 'die untere Grenze');
  assert.equal(sekundenAus('30 Sec pro Seite'), 30);
  assert.equal(sekundenAus('30 pro Seite'), 30, 'ohne Einheit: Sekunden');
  assert.equal(sekundenAus('2 min'), 120);
  assert.equal(sekundenAus('1:30'), 90);
  assert.equal(sekundenAus(''), 0);
  assert.equal(pauseSekunden({ pause: '120-180 Sec' }), 120);

  assert.deepEqual(zeitVorgabe({ params: [{ label: 'Zeit', value: '30 sec pro Seite' }, { label: 'Sätze', value: '2' }] }),
    { sekunden: 30, runden: 4, proSeite: true }, 'zwei Sätze je Seite sind vier Runden');
  assert.deepEqual(zeitVorgabe({ params: [{ label: 'Zeit', value: '60 Sec' }, { label: 'Sätze', value: '2' }] }),
    { sekunden: 60, runden: 2, proSeite: false });
  assert.equal(zeitVorgabe({ params: [{ label: 'Serien', value: '3' }] }), null);

  /* Die echten Übungen der Fussgymnastik aus KW 31. */
  const p = parseProgram(grid);
  const fuss = p.units.fussgymnastik.items;
  assert.ok(fuss.every(i => zeitVorgabe(i)?.sekunden > 0), 'jede Übung der Fussgymnastik hat ihre Zeit');
});

/* ── Im Player ───────────────────────────────────────────────────── */

const programm = parseProgram(grid);
const MITGLIEDER = [{ uid: 'timo', name: 'Timothy', rolle: 'mitglied' }];
const plan = (prog, id = 'p1') => ({ id, titel: 'KW 36', fuer: 'timo', json: JSON.stringify(prog) });

test('Player: ein Tipp auf den Satz bestätigt das Gewicht und startet die Pause', async () => {
  const { doc, zurueck } = await starteEinheit({
    suche: '?g=g1&p=p1&u=kraft-beine&d=2026-08-04', plaene: [plan(programm)], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    /* Zur ersten Übung mit Gewicht im Plan (Kniebeuge hinten, 50). */
    const alle = programm.units['kraft-beine'].items;
    const n = alle.findIndex(i => /^\d/.test(i.sets?.[0]?.weight || ''));
    for (let i = 0; i < n; i++) klick(doc.getElementById('btnWeiter'));
    const erste = alle[n];
    assert.equal(doc.getElementById('uebName').textContent, erste.name);
    assert.match(doc.querySelector('[data-satz-zeile="0"] .row__sub').textContent, /kg/, 'das Gewicht steht mit kg da');
    klick(doc.querySelector('[data-satz-tippen="0"]'));
    assert.ok(await warte(() => !doc.getElementById('uhr').hidden), 'die Pause läuft nicht');
    assert.equal(doc.getElementById('uhrWas').textContent, 'Pause');
    assert.match(doc.getElementById('uhrZeit').textContent, /^[12]:\d\d$/);
    assert.equal(doc.getElementById('uhrStart').textContent, 'Anhalten');
    assert.equal(doc.getElementById('uhrPlus').hidden, false);
    /* Seit v.35.64.0 je Übung (protokollAbgleichen), mit eigenem Haken. */
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'protokollAbgleichen'), 200);
    const gespeichert = globalThis.__aufrufe.find(a => a[0] === 'protokollAbgleichen')?.[4];
    const satz = gespeichert?.find(x => x.key === erste.key)?.eintrag?.sets?.[0];
    assert.equal(satz?.weight, String(erste.sets[0].weight), 'bestätigt ist das Gewicht des Plans');
    assert.equal(satz?.ok, true, 'der Satz trägt seinen Haken nicht');

    klick(doc.getElementById('uhrStopp'));
    assert.equal(doc.getElementById('uhr').hidden, true, 'Überspringen beendet die Pause');
  } finally { zurueck(); }
});

test('Player: sagt der Plan "??", fragt ein Tipp nach dem Gewicht, statt "??" zu speichern', async () => {
  const offen = structuredClone(programm);
  offen.units['kraft-beine'].items.forEach(i => (i.sets || []).forEach(s => { s.weight = '??'; }));
  const { doc, zurueck } = await starteEinheit({
    suche: '?g=g1&p=p1&u=kraft-beine&d=2026-08-04', plaene: [plan(offen)], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    assert.match(doc.querySelector('[data-satz-zeile="0"] .row__sub').textContent, /Gewicht eintragen/);
    klick(doc.querySelector('[data-satz-tippen="0"]'));
    const feld = doc.querySelector('[data-satz="0"][data-feld="weight"]');
    assert.ok(feld, 'das Gewichtsfeld geht nicht auf');
    assert.equal(feld.placeholder, 'kg');
    await new Promise(r => setTimeout(r, 1000));
    assert.equal(globalThis.__aufrufe.some(a => a[0] === 'protokollAbgleichen'), false, 'gespeichert wurde, bevor jemand etwas eintrug');
  } finally { zurueck(); }
});

test('Player: eine Übung auf Zeit hat ihre Uhr — Runde für Runde, je Seite', async () => {
  const { doc, zurueck } = await starteEinheit({
    suche: '?g=g1&p=p1&u=fussgymnastik&d=2026-08-04', plaene: [plan(programm)], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    assert.equal(doc.getElementById('uhr').hidden, false);
    assert.equal(doc.getElementById('uhrWas').textContent, 'Seite 1');
    assert.match(doc.getElementById('uhrRunde').textContent, /Runde 1 von 4/);
    assert.equal(doc.getElementById('uhrZeit').textContent, '0:30');
    assert.equal(doc.getElementById('uhrStart').textContent, 'Start');
    klick(doc.getElementById('uhrStart'));
    assert.equal(doc.getElementById('uhrStart').textContent, 'Anhalten');
    klick(doc.getElementById('uhrStopp'));
    assert.equal(doc.getElementById('uhrZeit').textContent, '0:30', 'zurückgesetzt');
  } finally { zurueck(); }
});

/* ── Was die Leitung sieht ───────────────────────────────────────── */

test('die Leitung sieht, mit wie viel Gewicht wirklich trainiert wird', async () => {
  const verlauf = gewichtsVerlauf([{ json: JSON.stringify(programm) }], [
    { datum: '2026-08-04', units: { 'kraft-beine': { items: {
      'kraft-beine-3a-kniebeuge-hinten': { sets: [{ weight: '52', reps: '9' }, { weight: '??', reps: '' }] },
    } } } },
    { datum: '2026-08-08', units: { 'kraft-beine': { items: {
      'kraft-beine-3a-kniebeuge-hinten': { sets: [{ weight: '55', reps: '9' }] },
    } } } },
  ]);
  assert.equal(verlauf[0].name, 'Kniebeuge hinten');
  assert.deepEqual(verlauf[0].tage.map(t => [t.datum, t.sets.map(s => s.weight)]), [['2026-08-08', ['55']], ['2026-08-04', ['52']]]);

  const { doc, zurueck } = await starteGruppe({
    gruppen: [{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'head' }],
    mitglieder: [{ uid: 'michel', name: 'Michel', rolle: 'head' }, { uid: 'timo', name: 'Timothy', rolle: 'mitglied' }],
    plaene: [{ id: 'p1', titel: 'KW 31', fuer: 'timo', json: JSON.stringify(programm) }],
    protokolle: [{ uid: 'timo', datum: '2026-08-04', units: { 'kraft-beine': { items: {
      'kraft-beine-3a-kniebeuge-hinten': { done: true, sets: [{ weight: '52', reps: '9' }, { weight: '52', reps: '9' }] },
    } } } }],
  });
  try {
    await warte(() => doc.querySelector('[data-person="timo"]'));
    klick(doc.querySelector('[data-person="timo"]'));
    assert.ok(await warte(() => !doc.getElementById('secGewichte').hidden), 'die Gewichte stehen nicht im Profil');
    assert.match(doc.getElementById('listGewichte').textContent, /Kniebeuge hinten[\s\S]*9× 52 kg · 9× 52 kg/);
  } finally { zurueck(); }
});

/* ── Bearbeiten und Abhaken sind zwei Dinge (v.35.64.0) ─────────── */

test('Player: Bearbeiten hakt nicht ab, die Fläche schon — und ein zweiter Tipp nimmt es zurück', async () => {
  const { doc, window, zurueck } = await starteEinheit({
    suche: '?g=g1&p=p1&u=kraft-beine&d=2026-08-04', plaene: [plan(programm)], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    const alle = programm.units['kraft-beine'].items;
    const n = alle.findIndex(i => /^\d/.test(i.sets?.[0]?.weight || ''));
    for (let i = 0; i < n; i++) klick(doc.getElementById('btnWeiter'));
    const erste = alle[n];

    /* Der Stift öffnet Wiederholungen × Gewicht, in dieser Folge. */
    klick(doc.querySelector('[data-satz-oeffnen="0"]'));
    const felder = [...doc.querySelectorAll('[data-satz-felder="0"] input.form-input')].map(f => f.dataset.feld);
    assert.deepEqual(felder.slice(0, 2), ['reps', 'weight'], 'die Felder stehen nicht in der Folge "5 × 40 kg"');
    const gewicht = doc.querySelector('[data-satz="0"][data-feld="weight"]');
    gewicht.value = '55';
    gewicht.dispatchEvent(new window.Event('input', { bubbles: true }));
    klick(doc.querySelector('[data-satz-zu="0"]'));
    assert.equal(doc.querySelector('[data-satz-zeile="0"]').classList.contains('satz--gemacht'), false,
      'ein korrigiertes Gewicht hat den Satz abgehakt');
    assert.equal(doc.getElementById('uhr').hidden, true, 'Bearbeiten startete die Pause');

    /* Die Fläche hakt ab — mit dem eben eingetragenen Gewicht. */
    klick(doc.querySelector('[data-satz-tippen="0"]'));
    assert.equal(doc.querySelector('[data-satz-zeile="0"]').classList.contains('satz--gemacht'), true);
    assert.match(doc.querySelector('[data-satz-wert="0"]').textContent, /^\S+ × 55 kg$/, '"Wiederholungen × Gewicht"');

    /* Zurück: der Haken geht, das Gewicht bleibt. */
    klick(doc.querySelector('[data-satz-tippen="0"]'));
    assert.equal(doc.querySelector('[data-satz-zeile="0"]').classList.contains('satz--gemacht'), false);
    assert.match(doc.querySelector('[data-satz-wert="0"]').textContent, /55 kg/);
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'protokollAbgleichen'), 200);
    const letzte = globalThis.__aufrufe.filter(a => a[0] === 'protokollAbgleichen').at(-1)[4];
    const satz = letzte.find(x => x.key === erste.key).eintrag.sets[0];
    assert.deepEqual([satz.weight, satz.ok], ['55', false]);
  } finally { zurueck(); }
});

test('Player: eine Pause "180-240 Sec" hat beide Längen, fortsetzen, neu starten — und endet mit dem Satz', async () => {
  const mitBereich = structuredClone(programm);
  const alle = mitBereich.units['kraft-beine'].items;
  const n = alle.findIndex(i => /^\d/.test(i.sets?.[0]?.weight || ''));
  alle[n].pause = '180-240 Sec';
  const { doc, zurueck } = await starteEinheit({
    suche: '?g=g1&p=p1&u=kraft-beine&d=2026-08-04', plaene: [plan(mitBereich)], mitglieder: MITGLIEDER,
  });
  try {
    await warte(() => !doc.getElementById('secPlayer').hidden);
    for (let i = 0; i < n; i++) klick(doc.getElementById('btnWeiter'));
    klick(doc.querySelector('[data-satz-tippen="0"]'));
    assert.equal(doc.getElementById('uhrZeit').textContent, '3:00', 'die untere Grenze ist nicht vorgewählt');
    const wahl = [...doc.querySelectorAll('#uhrBereich [data-uhr-laenge]')];
    assert.deepEqual(wahl.map(b => b.textContent.trim()), ['3:00', '4:00']);
    klick(wahl[1]);
    assert.equal(doc.getElementById('uhrZeit').textContent, '4:00');
    klick(doc.getElementById('uhrStart'));          // anhalten
    assert.equal(doc.getElementById('uhrStart').textContent, 'Start', 'bei voller Zeit heisst es Start');
    klick(doc.getElementById('uhrPlus'));
    assert.equal(doc.getElementById('uhrZeit').textContent, '4:15');
    klick(doc.getElementById('uhrReset'));          // neu starten
    assert.equal(doc.getElementById('uhrStart').textContent, 'Anhalten');
    /* Keine zweite Uhr: ein weiterer Satz startet dieselbe neu. */
    klick(doc.querySelector('[data-satz-tippen="1"]'));
    assert.equal(doc.querySelectorAll('.uhr').length, 1);
    /* Den Satz zurücknehmen, dessen Pause läuft: sie endet. */
    klick(doc.querySelector('[data-satz-tippen="1"]'));
    assert.equal(doc.getElementById('uhr').hidden, true, 'die Pause lief weiter, obwohl der Satz zurückgenommen ist');
  } finally { zurueck(); }
});

test('Player: aus der Woche mit einem Tag öffnet die Einheit des Tages direkt — keine Liste', async () => {
  const tage = (await import('../assets/js/wochenplan.js')).planTageMitDatum(programm, '2026-08-05');
  const tag = tage.find(t => t.eintraege.filter(e => e.unit && programm.units[e.unit]?.items?.length).length === 1);
  const { doc, zurueck } = await starteEinheit({
    suche: `?g=g1&p=p1&d=${tag.datum}`, plaene: [plan(programm)], mitglieder: MITGLIEDER,
  });
  try {
    assert.ok(await warte(() => !doc.getElementById('secPlayer').hidden), 'statt der Einheit steht eine Liste');
    assert.equal(doc.getElementById('secWahl').hidden, true);
    assert.equal(doc.getElementById('btnZurWahl').hidden, true, '"Einheit wechseln" gehört nicht in den normalen Ablauf');
  } finally { zurueck(); }
});
