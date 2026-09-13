/* Die aelteren Seiten auf dem Katalog: Maturaarbeit, Tracker, Gast, Projekte.

   Bis v.35.29.0 waren sie deutsch, bis auf ein paar Kopfzeilen. Das
   Markup allein zu verschluesseln haette wenig gebracht: der groesste
   Teil dessen, was man sieht — Zaehler, Phasenkoepfe, die Seitenleiste
   der Maturaarbeit — schreibt der Code. Darum laufen hier die echten
   Skripte, mit dem echten i18n.js und den echten Katalogen, und es wird
   geprueft, was am Ende im DOM steht.

   Und eine Falle, die dabei auffiel: auf dem Tracker trug die
   Fortschrittszeile ein data-i18n, obwohl der Code sie beschriftet. Der
   Katalog kommt spaeter und schrieb "Noch keine Aufgaben erledigt."
   ueber "3 von 20 Punkten erledigt" (Falle 5 in CLAUDE.md). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = leserMitStart(root);
const SPRACHEN = ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es'];

const kataloge = Object.fromEntries(await Promise.all(SPRACHEN.map(async s =>
  [s, JSON.parse(await readFile(join(root, `assets/i18n/${s}.json`), 'utf8'))])));
const i18nQuelle = await readFile(join(root, 'assets/js/i18n.js'), 'utf8');

/* Seit v.35.34.0 stehen die Matura-Seiten auf der Seiten-Invariante: ihr
   Code ist kein Inline-Skript mehr, sondern ein Modul. Geladen wird der
   Teil ohne Firebase (…-ansicht.js), mit den Globalen des jsdom-Fensters —
   der Zaehler im Pfad gibt jedem Lauf ein frisches Modul. */
const ANSICHT = {
  'pages/maturaarbeit.html': ['assets/js/feature/matura/uebersicht-ansicht.js', 'starteUebersicht'],
  'pages/maturaarbeit-tracker.html': ['assets/js/feature/matura/tracker-ansicht.js', 'richteTrackerEin'],
};
let lauf = 0;

/** Seite laden, i18n.js starten, dann das Modul der Seite — so wie der
    Browser es tut, nur ohne Firebase. Was das Modul zurueckgibt (TP,
    startTracker), liegt danach an window.seite. */
async function starte(seite, { lang = 'en', offline = false } = {}) {
  const html = await readFile(join(root, seite), 'utf8');
  const dom = new JSDOM(html, { url: `https://firn.test/${seite}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.localStorage.setItem('tvza-lang', lang);
  window.fetch = async url => {
    if (offline) throw new Error('offline');
    const s = String(url).match(/\/(\w\w)\.json/)?.[1];
    return kataloge[s]
      ? { ok: true, status: 200, json: async () => kataloge[s] }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  window.eval(i18nQuelle);
  await window.TVZAI18n.ready;
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage });
  const [pfad, einstieg] = ANSICHT[seite];
  const modul = await import(`${pathToFileURL(join(root, pfad)).href}?lauf=${++lauf}`);
  window.seite = modul[einstieg]();
  await new Promise(r => setTimeout(r, 0));          // ready.then(...) der Seite
  return window;
}
const text = (w, sel) => w.document.querySelector(sel).textContent.replace(/\s+/g, ' ').trim();

test('Maturaarbeit auf Englisch: der Rahmen uebersetzt, Timos Inhalt deutsch', async () => {
  const w = await starte('pages/maturaarbeit.html');
  const en = kataloge.en;

  /* Der Absender steht als Variable im Titel, nicht als Wort im Katalog. */
  assert.equal(w.document.title, en['ma.seitentitel'].replace('{absender}', 'TVZA'));
  assert.match(text(w, '#cat-overview'), /Milestones/);
  assert.match(text(w, '#progress-summary'), /^\d+ of \d+ items done$/);
  assert.match(text(w, '#deadline-label'), /17 August 2026|August 17, 2026/, 'das Datum kommt aus Intl, nicht aus einem String');
  assert.doesNotMatch(text(w, '#deadline-label'), /17\. August/);
  assert.equal(text(w, '#meetings-title'), 'Meetings with Mr Diriwächter');

  const phasen = text(w, '#phases-container');
  assert.match(phasen, /Phase 1/);
  assert.match(phasen, /\d+\/\d+ milestones/);
  assert.match(phasen, /Grundlagen & Konzept/, 'Phasentitel sind Inhalt und bleiben deutsch');

  assert.match(text(w, '#meetings-row'), /Meeting 1.*Topic & concept/);
  assert.equal(text(w, '#cl-journal .ch-tag'), 'Required');
  assert.match(text(w, '#cl-journal'), /Arbeits- und Zeitplan erstellt/, 'Checklisten sind Inhalt');
  assert.match(text(w, '#sidebar'), /Meetings \d\/4/);

  /* Der Knopf behaelt sein Symbol: der Text sitzt in einem eigenen Element. */
  const reset = w.document.querySelector('.matura-reset');
  assert.ok(reset.querySelector('svg'), 'data-i18n am Knopf haette das Symbol weggeschrieben');
  assert.equal(text(w, '.matura-reset'), en['mt.zuruecksetzen']);
});

test('Maturaarbeit: ein Sprachwechsel zeichnet auch, was der Code schreibt, neu', async () => {
  const w = await starte('pages/maturaarbeit.html');
  await w.TVZAI18n.setLanguage('fr');
  assert.match(text(w, '#cat-overview'), /Jalons/);
  assert.match(text(w, '#progress-summary'), /points sur \d+ terminés/);
  assert.match(text(w, '#deadline-label'), /17 août 2026/);
  assert.match(text(w, '#meetings-row'), /Entretien 1/);
});

test('Maturaarbeit: Tage im Polnischen mit drei Formen', async () => {
  const w = await starte('pages/maturaarbeit.html', { lang: 'pl' });
  assert.equal(w.seite.TP('ma.sb.nochTage', 1, 'noch {n} Tag', 'noch {n} Tage'), 'został 1 dzień');
  assert.equal(w.seite.TP('ma.sb.nochTage', 3, 'noch {n} Tag', 'noch {n} Tage'), 'zostały 3 dni');
  assert.equal(w.seite.TP('ma.sb.nochTage', 5, 'noch {n} Tag', 'noch {n} Tage'), 'zostało 5 dni');
});

test('Maturaarbeit ohne Katalog: deutsch, nie ein Schluessel', async () => {
  const w = await starte('pages/maturaarbeit.html', { lang: 'en', offline: true });
  assert.match(text(w, '#progress-summary'), /^\d+ von \d+ Punkten erledigt$/);
  assert.match(text(w, '#sidebar'), /Besprechungen \d\/4/);
  /* Deutscher Satz, deutsches Datum — nicht "17 August" aus dem Locale
     der gewaehlten, aber nicht geladenen Sprache. */
  assert.match(text(w, '#deadline-label'), /17\. August 2026/);
  const sichtbar = w.document.body.cloneNode(true);
  sichtbar.querySelectorAll('script').forEach(s => s.remove());
  assert.doesNotMatch(sichtbar.textContent, /\b(ma|mt)\.[a-z]+[A-Za-z.]*\b/, 'ein Schluessel stand im Text — t() statt tOr()?');
});

test('Tracker: die Fortschrittszeile gehoert dem Code, nicht dem Katalog', async () => {
  const w = await starte('pages/maturaarbeit-tracker.html');
  w.seite.startTracker('u1', '');
  assert.equal(text(w, '#who-line'), 'Signed in: Student');
  assert.equal(text(w, '#tracker-progress-summary'), kataloge.en['mt.keineErledigt']);

  /* Ein Klick wie ein Mensch — die Handler haengen seit v.35.34.0 an
     einem Zuhoerer fuer die ganze Seite, nicht mehr an window. */
  w.document.querySelector('[data-item="p1a"]').click();
  assert.match(text(w, '#tracker-progress-summary'), /^1 of \d+ items done$/);
  /* Der Katalog beschriftet spaet noch einmal — genau das war der Fehler. */
  w.TVZAI18n.applyTo(w.document);
  assert.match(text(w, '#tracker-progress-summary'), /^1 of \d+ items done$/);

  assert.match(text(w, '#meetings-row'), /Meeting 1.*Topic & research question/);
  assert.match(text(w, '#phases'), /Phase 1.*\d+\/\d+ done/);
  assert.equal(text(w, '.faden-note span span'), kataloge.en['mt.roterFadenSub']);
});

/* Was der Code beschriftet, darf kein data-i18n tragen — sonst gewinnt
   der spaeter kommende Katalog und die Zeile luegt. */
const VOM_CODE = {
  'pages/maturaarbeit.html': ['deadline-label', 'progress-summary', 'gp-pct', 'days-el'],
  'pages/maturaarbeit-tracker.html': ['tracker-progress-summary', 'who-line', 'meet-badge', 'gp-pct'],
  'pages/guest.html': ['authTitle', 'authSub', 'requestBtn', 'switchText', 'switchLink', 'authErr'],
  'public.html': ['authBtn'],
};
for (const [seite, ids] of Object.entries(VOM_CODE)) {
  test(`${seite}: vom Code beschriftete Elemente tragen kein data-i18n`, async () => {
    const html = await readFile(join(root, seite), 'utf8');
    for (const id of ids) {
      const tag = html.match(new RegExp(`<[a-z0-9]+[^>]*\\bid="${id}"[^>]*>`))?.[0];
      assert.ok(tag, `#${id} fehlt`);
      assert.doesNotMatch(tag, /data-i18n(?!-attr)/, `#${id} traegt data-i18n`);
    }
  });
}

test('jeder Schluessel, den die Skripte der alten Seiten benutzen, steht in allen Sprachen', async () => {
  const fehlend = [];
  for (const seite of Object.keys(VOM_CODE)) {
    /* Seite samt Modulen: der Matura-Code liegt seit v.35.34.0 in feature/matura/. */
    const html = await lies(seite);
    const schluessel = new Set();
    for (const m of html.matchAll(/\bT\(\s*'([a-z][\w.]*)'/g)) schluessel.add(m[1]);
    for (const m of html.matchAll(/\bTP\(\s*'([a-z][\w.]*)'/g)) { schluessel.add(`${m[1]}.one`); schluessel.add(`${m[1]}.other`); }
    for (const m of html.matchAll(/\bkey:'([a-z][\w.]*)'/g)) schluessel.add(m[1]);
    assert.ok(schluessel.size > 3, `${seite}: keine T()-Aufrufe gefunden — Muster veraltet?`);
    for (const k of schluessel) for (const s of SPRACHEN) {
      if (kataloge[s][k] === undefined) fehlend.push(`${seite}: ${k} (${s})`);
    }
  }
  assert.deepEqual(fehlend, []);
});
