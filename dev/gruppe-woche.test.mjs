/* Die Woche auf der Gruppenseite — wirklich gefahren, nicht gelesen.

   gruppe-seite.test.mjs prüft den Quelltext: welche IDs vorkommen, ob
   Haken ein Gegenstück haben. Das findet einen Tippfehler, aber nicht,
   ob am Ende etwas auf dem Bildschirm steht. Genau das war der Fehler,
   den dieser Umbau behebt — der Wochenplan wurde gelesen, geparst und
   dann nie gezeichnet, und keine einzige Zusicherung hat es gemerkt.

   Darum hier dasselbe Verfahren wie in training-ui.test.mjs: jsdom für
   das DOM, Data-URL-Module statt Firestore, und Timothys echte KW 31
   als Plan.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import { parseProgram } from '../assets/js/training-parser.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const datei = p => pathToFileURL(join(root, p)).href;
const dataUrl = quelle => 'data:text/javascript;base64,' + Buffer.from(quelle).toString('base64');

const grid = JSON.parse(await readFile(join(root, 'dev/fixtures/kw31-grid.json'), 'utf8'));
const programm = parseProgram(grid);

/* Die Woche liegt in der Vergangenheit. Damit "Heute" prüfbar ist,
   tut die Seite so, als wäre Mittwoch dieser Woche. isoTag() kommt aus
   termine.js und liest die Systemuhr — also wird sie gestellt. */
const HEUTE = '2026-08-05';

const FIREBASE_STUB = `
  export const escHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  export const requireAuth = () => Promise.resolve({ uid: 'timo', email: 't@example.test' });
  export const getProfile = () => Promise.resolve({ displayName: 'Timothy' });
  export const wireOfflineBanner = () => {};
  export const reportClientError = (wo, e) => { (globalThis.__fehler ||= []).push([wo, String(e)]); };
`;

const SHELL_STUB = `
  export const mountShell = () => {};
  export const setShellTitle = () => {};
`;

/* Nur was die Seite beim Zeichnen wirklich anfasst. Alles andere ist
   ein Platzhalter — ein Stub, der mehr kann als nötig, verschleiert,
   wovon die Ansicht wirklich abhängt. */
function groupsStub(plaene, protokolle) {
  return `
    export const PLAN_FUER_ALLE = 'alle';
    export const leitet = r => r === 'head' || r === 'staff';
    export const fuehrt = r => r === 'head';
    export const wort = (art, was) => was;
    export const waehleAktive = liste => liste?.[0] ?? null;
    export const aktiveGruppeSetzen = () => {};
    export const beobachteMeineGruppen = (uid, cb) => {
      cb([{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'mitglied' }]);
      return () => {};
    };
    export const beobachteTermine = () => () => {};
    export const ladeMitglieder = async () => [{ uid: 'timo', name: 'Timothy', rolle: 'mitglied' }];
    export const ladePlaene = async () => ${JSON.stringify(plaene)};
    export const ladeProtokolle = async () => ${JSON.stringify(protokolle)};
    export const ladeZusagen = async () => [];
    export const ladeErgebnisse = async () => [];
    export const ladeAnhaenge = async () => [];
    export const eigeneProgramme = async () => [];
    export const gruppeAnlegen = async () => 'g1';
    export const terminAnlegen = async () => {};
    export const terminLoeschen = async () => {};
    export const terminAbsagen = async () => {};
    export const absageZuruecknehmen = async () => {};
    export const zusagen = async () => {};
    export const rolleSetzen = async () => {};
    export const mitgliedEntfernen = async () => {};
    export const uebergeben = async () => {};
    export const einladungErzeugen = async () => 'CODE';
    export const beitreten = async () => {};
    export const ergebnisSpeichern = async () => {};
    export const planVeroeffentlichen = async () => 'p1';
    export const abonnementErneuern = async () => '';
    export const abonnementAdresse = () => '';
    export const anhangSpeichern = async () => {};
    export const anhangUmbenennen = async () => {};
    export const anhangLoeschen = async () => {};
    export const alsBlob = () => null;
  `;
}

async function starteSeite({ plaene, protokolle = [] }) {
  const html = await readFile(join(root, 'pages/gruppe.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*><\/script>/gi, ''), {
    url: 'https://firn.test/pages/gruppe.html',
  });
  const { window } = dom;

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  globalThis.__fehler = [];

  /* termine.js liest die Systemuhr. Ohne gestellte Uhr hinge der Test
     davon ab, an welchem Tag er läuft. */
  const echtesDate = Date;
  class FesteZeit extends echtesDate {
    constructor(...args) {
      if (args.length === 0) super(`${HEUTE}T09:00:00`);
      else super(...args);
    }
    static now() { return new echtesDate(`${HEUTE}T09:00:00`).getTime(); }
  }
  globalThis.Date = FesteZeit;
  window.Date = FesteZeit;

  const quelle = (await readFile(join(root, 'assets/js/feature/gruppe/gruppe.js'), 'utf8'))
    .replace(`'../../firebase-config.js'`, `'${dataUrl(FIREBASE_STUB)}'`)
    /* Mit jeder Versionsnummer: sie wandert bei jeder Aenderung der
       Huelle, und der Test soll daran nicht jedes Mal zerbrechen. */
    .replace(/'\.\.\/\.\.\/shell\.js\?v=\d+'/, `'${dataUrl(SHELL_STUB)}'`)
    .replace(`'../../groups.js'`, `'${dataUrl(groupsStub(plaene, protokolle))}'`)
    .replace(`'../../wochenplan.js'`, `'${datei('assets/js/wochenplan.js')}'`)
    .replace(`'../../termine.js'`, `'${datei('assets/js/termine.js')}'`)
    .replace(`'../../fispunkte.js'`, `'${datei('assets/js/fispunkte.js')}'`)
    .replace(`'../../worker-config.js'`, `'${datei('assets/js/worker-config.js')}'`);

  await import(dataUrl(quelle));

  for (let i = 0; i < 100; i++) {
    if (!window.document.getElementById('secPlaene').hidden
        && window.document.getElementById('listPlaene').innerHTML) break;
    await new Promise(r => setTimeout(r, 10));
  }
  globalThis.Date = echtesDate;
  return window.document;
}

const planFuerAlle = {
  id: 'p1', titel: 'Woche 31 — Kraft', fuer: 'alle', json: JSON.stringify(programm),
};

/* Am Mittwoch abgehakt: die Ausdauer-Einheit ganz, damit sich Punkt,
   Zähler und Balken unterscheiden lassen. */
const protokollMittwoch = [{
  uid: 'timo', datum: HEUTE,
  units: {
    ausdauer: {
      items: Object.fromEntries(programm.units.ausdauer.items.map(i => [i.key, { done: true }])),
    },
  },
}];

const doc = await starteSeite({ plaene: [planFuerAlle], protokolle: protokollMittwoch });
const $ = sel => doc.querySelector(sel);
const $$ = sel => [...doc.querySelectorAll(sel)];
const klick = el => {
  assert.ok(el, 'Element zum Klicken fehlt');
  el.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
};

test('die Seite lädt ohne gemeldeten Fehler', () => {
  assert.deepEqual(globalThis.__fehler, []);
});

test('der Wochenstreifen zeigt sieben Tage, heute markiert', () => {
  const tage = $$('#wocheStreifen .woche__tag');
  assert.equal(tage.length, 7);
  assert.equal($('#wocheStreifen').hidden, false);

  const heute = $$('#wocheStreifen .woche__tag.ist-heute');
  assert.equal(heute.length, 1, 'genau ein Tag ist heute');
  assert.equal(heute[0].dataset.tag, 'mi');
  assert.equal(heute[0].getAttribute('aria-selected'), 'true',
    'beim Öffnen steht heute offen');
});

test('der Kopf nennt die Woche, nicht den getippten Titel', () => {
  /* "KW 31 · 3. Aug. – 9. Aug." sagt einem Athleten mehr als
     "Woche 31 — Kraft". Der Titel steht in der Auswahl, sobald es
     mehrere Pläne gibt. */
  const zeitraum = $('#planZeitraum');
  assert.equal(zeitraum.hidden, false);
  assert.match(zeitraum.textContent, /KW 31/);
  assert.doesNotMatch(zeitraum.textContent, /Kraft/);
});

test('bei einem einzigen Plan gibt es keine Auswahl', () => {
  assert.equal($('#planWahl').hidden, true);
});

test('der Tag zeigt seine Einheiten mit Tageshälfte', () => {
  /* Mittwoch: Vormittag Intervall, Nachmittag Rumpf. */
  const titel = $$('#listPlaene .row__title').map(el => el.textContent);
  assert.deepEqual(titel, ['Intervall INTENSIV 4x5 min (Joggen)', 'Rumpf']);
  const slots = $$('#listPlaene .eintrag__slot').map(el => el.textContent);
  assert.deepEqual(slots, ['Vormittag', 'Nachmittag']);
});

test('eine Einheit führt in den Player, mit Gruppe, Plan, Blatt und dem geplanten Tag', () => {
  const ziel = new URL($('#listPlaene a.row').href, 'https://firn.test/pages/');
  assert.equal(ziel.pathname, '/pages/einheit.html');
  assert.equal(ziel.searchParams.get('g'), 'g1');
  assert.equal(ziel.searchParams.get('p'), 'p1');
  assert.equal(ziel.searchParams.get('u'), 'ausdauer');
  assert.equal(ziel.searchParams.get('d'), HEUTE);
});

test('das Abgehakte steht als Zähler, Balken und voller Punkt da', () => {
  const erste = $('#listPlaene .row');
  const zaehler = erste.querySelector('.row__zaehler');
  assert.match(zaehler.textContent, /^(\d+)\/\1$/, 'Ausdauer ist ganz erledigt');
  assert.equal(zaehler.classList.contains('ist-fertig'), true);
  assert.equal(erste.querySelector('.row__bar > i').style.width, '100%');

  const mi = $('#wocheStreifen [data-tag="mi"]');
  assert.equal(mi.querySelectorAll('.woche__punkt').length, 2, 'Mittwoch hat zwei Einheiten');
  assert.equal(mi.querySelectorAll('.woche__punkt.ist-fertig').length, 1);
});

test('ein anderer Tag wird gezeichnet, wenn man ihn antippt', () => {
  klick($('#wocheStreifen [data-tag="di"]'));

  const titel = $$('#listPlaene .row__title').map(el => el.textContent);
  assert.deepEqual(titel, ['Kraft Beine', 'Fußgymnastik', 'Mobi']);
  assert.equal($('#wocheStreifen [data-tag="di"]').getAttribute('aria-selected'), 'true');
  assert.equal($('#wocheStreifen [data-tag="mi"]').getAttribute('aria-selected'), 'false');

  /* Der Dienstag trägt kein Protokoll — dieselbe Einheit an einem
     anderen Tag ist ein anderes Training. */
  assert.equal($('#listPlaene .row__bar > i').style.width, '0%');
});

test('ein Eintrag ohne Blatt steht da, ist aber kein Link', () => {
  klick($('#wocheStreifen [data-tag="do"]'));

  const ohne = $('#listPlaene .row--ohneBlatt');
  assert.ok(ohne, '"evtl. Spiel" fehlt in der Woche');
  assert.equal(ohne.tagName, 'DIV', 'kein Link — es gibt nichts zu öffnen');
  assert.match(ohne.textContent, /evtl\. Spiel/);
  assert.match(ohne.textContent, /kein Blatt hinterlegt/);
});

test('ein Ruhetag sagt, dass nichts geplant ist', () => {
  klick($('#wocheStreifen [data-tag="so"]'));
  assert.equal($$('#listPlaene .row').length, 0);
  assert.match($('#listPlaene .empty-hint').textContent, /Ruhetag/);
});

test('mehrere Pläne bekommen eine Auswahl, ein einzelner nicht', async () => {
  const doc2 = await starteSeite({
    plaene: [
      planFuerAlle,
      { id: 'p2', titel: 'Nur Timo', fuer: 'timo', json: JSON.stringify(programm) },
    ],
  });
  const wahl = doc2.getElementById('planWahl');
  assert.equal(wahl.hidden, false);
  assert.equal(wahl.options.length, 2);
  assert.equal(wahl.value, 'p1');
  assert.match(wahl.options[0].textContent, /Woche 31 — Kraft/);
});

test('ohne Plan steht ein Satz statt einer leeren Woche', async () => {
  const doc3 = await starteSeite({ plaene: [] });
  assert.equal(doc3.getElementById('wocheStreifen').hidden, true);
  assert.equal(doc3.getElementById('tagTitel').hidden, true);
  assert.match(doc3.getElementById('listPlaene').textContent, /noch kein Plan bereit/i);
});

test('ein unlesbarer Plan nimmt die Gruppenseite nicht mit', async () => {
  const doc4 = await starteSeite({
    plaene: [{ id: 'px', titel: 'Kaputt', fuer: 'alle', json: '{nicht mal JSON' }],
  });
  /* Die Termine und die Mitglieder stehen trotzdem. */
  assert.equal(doc4.getElementById('secMitglieder').hidden, false);
  assert.equal(doc4.getElementById('wocheStreifen').hidden, true);
  assert.equal(globalThis.__fehler.some(([wo]) => wo === 'gruppe/planLesen'), true,
    'der Fehler wird gemeldet, nicht verschluckt');
});
