/* Die Gastseite und die oeffentliche Projektseite im jsdom.

   Beide trugen bis v.35.35.0 ihren Code als Inline-Modul und schalteten
   ihre Zustaende mit style.display um. Seit dem Umzug nach
   feature/gast/ und feature/oeffentlich/ setzen sie `hidden` — das Kit
   haelt [hidden] mit !important. Wer hier wieder style.display
   schreibt, faellt durch die Seiten-Invariante (kit-conformance), wer
   `hidden` vergisst, zeigt zwei Zustaende auf einmal: das pruefen diese
   Tests.

   Firestore und die Anmeldung sind Data-URL-Module; globalThis.__gast
   sagt ihnen, wer angemeldet ist und was in der Datenbank steht. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataUrl = quelle => 'data:text/javascript;base64,' + Buffer.from(quelle).toString('base64');
const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
let lauf = 0;

const CONFIG = `
  export const auth = {}, db = {};
  export const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
`;
const AUTH = `
  export const getAuth = () => ({});
  export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(globalThis.__gast.nutzer), 0); return () => {}; };
  export const signOut = async () => {};
  export const signInWithEmailAndPassword = async () => ({ user: globalThis.__gast.nutzer });
  export const createUserWithEmailAndPassword = async () => ({ user: globalThis.__gast.nutzer });
`;
const APP = `export const initializeApp = () => ({});`;
const FIRESTORE = `
  const g = () => globalThis.__gast;
  const snap = liste => ({ docs: liste.map((x, i) => ({ id: x.id || String(i), data: () => ({ ...x }) })) });
  export const getFirestore = () => ({});
  export const collection = (db, ...p) => ({ pfad: [db?.pfad, ...p].filter(Boolean).join('/') });
  export const doc = (db, ...p) => ({ pfad: [db?.pfad, ...p].filter(Boolean).join('/') });
  export const query = c => c, orderBy = () => ({});
  export async function getDoc(ref) {
    const wert = ref.pfad.startsWith('trips/') ? g().reise
               : ref.pfad.startsWith('groups/') ? (g().termine || {})[ref.pfad] || null
               : ref.pfad.startsWith('users/') ? (g().familie ? {} : null) : null;
    (g().gelesen ||= []).push(ref.pfad);
    return { exists: () => !!wert, data: () => wert };
  }
  export async function getDocs(q) {
    if (g().ladeFehler) throw new Error('permission-denied');
    return snap(g().projekte || []);
  }
  export async function setDoc(ref, daten) { (g().geschrieben ||= []).push([ref.pfad, daten]); }
  export async function updateDoc() {}
  export async function addDoc() { return { id: 'x' }; }
  export function onSnapshot(q, cb) { setTimeout(() => cb(snap(g().nachrichten || [])), 0); return () => {}; }
  export const serverTimestamp = () => null, increment = n => n;
`;

async function lade({ seite, skript, url, ...gast }) {
  const html = await readFile(join(root, seite), 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), { url });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  globalThis.DOMParser = window.DOMParser;
  globalThis.__gast = gast;

  const quelle = (await readFile(join(root, skript), 'utf8'))
    .replace(`'../../firebase-config.js'`, `'${dataUrl(CONFIG)}'`)
    .replace(`'${SDK}firebase-firestore.js'`, `'${dataUrl(FIRESTORE)}'`)
    .replace(`'${SDK}firebase-auth.js'`, `'${dataUrl(AUTH)}'`)
    .replace(`'${SDK}firebase-app.js'`, `'${dataUrl(APP)}'`)
    /* Das Programm (seit v.35.50.0 geteilt mit Kalender und Gruppe) ist
       echter Code. */
    .replace(`'../../programm.js'`, `'${pathToFileURL(join(root, 'assets/js/programm.js')).href}'`);
  assert.doesNotMatch(quelle, /gstatic/, 'ein SDK-Import ist nicht ersetzt');
  await import(dataUrl(`${quelle}\n// Lauf ${++lauf}`));
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 5));
  return window.document;
}

const ZUSTAENDE = ['loading', 'requestForm', 'wrongAccount', 'invalidLink', 'dashboard'];
const sichtbar = doc => ZUSTAENDE.filter(id => !doc.getElementById(id).hidden);
const gast = (o = {}) => lade({
  seite: 'pages/guest.html', skript: 'assets/js/feature/gast/gast.js',
  url: 'https://firn.test/pages/guest.html?trip=t1&token=abc', ...o,
});

const REISE = {
  name: 'Tessin', destination: 'Ascona', notes: 'Bahnhof, 8 Uhr', createdBy: 'michel', planUrl: 'https://example.org',
  itinerary: [{ date: '2026-07-10', time: '08:00', title: 'Abfahrt' }, { title: 'Glacé' }],
};

test('Gast: ohne Link steht nur „ungueltig" da', async () => {
  const doc = await gast({ url: 'https://firn.test/pages/guest.html' });
  assert.deepEqual(sichtbar(doc), ['invalidLink']);
});

test('Gast: ohne Anmeldung das Formular, und genau ein Zustand', async () => {
  const doc = await gast({ nutzer: null });
  assert.deepEqual(sichtbar(doc), ['requestForm']);
  assert.equal(doc.getElementById('authErr').hidden, true, 'die Fehlerzeile steht, bevor etwas schiefging');
  assert.equal(doc.getElementById('gNameField').hidden, false, 'beim Registrieren fehlt das Namensfeld');
});

test('Gast: leeres Formular zeigt den Fehler, Umschalten versteckt das Namensfeld', async () => {
  const doc = await gast({ nutzer: null });
  doc.getElementById('requestBtn').click();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(doc.getElementById('authErr').hidden, false);
  assert.equal(doc.getElementById('authErr').textContent, 'Bitte E-Mail und Passwort eingeben.');

  doc.getElementById('switchLink').click();
  assert.equal(doc.getElementById('gNameField').hidden, true, 'beim Anmelden gehoert kein Namensfeld hin');
  assert.equal(doc.getElementById('authErr').hidden, true, 'der alte Fehler bleibt nach dem Umschalten stehen');
  assert.equal(doc.getElementById('requestBtn').textContent, 'Anmelden');
});

test('Gast: ein Familienkonto bekommt den Hinweis, nicht die Reise', async () => {
  const doc = await gast({ nutzer: { uid: 'u1', email: 'a@b.test' }, familie: true, reise: REISE });
  assert.deepEqual(sichtbar(doc), ['wrongAccount']);
});

test('Gast: angemeldet steht die Reise mit Programm und Chat — ohne style="…"', async () => {
  const doc = await gast({
    nutzer: { uid: 'gast1', email: 'g@b.test' }, reise: REISE,
    nachrichten: [{ text: 'Hallo', sender: 'michel' }, { text: 'Hoi', sender: 'gast1' }],
  });
  assert.deepEqual(sichtbar(doc), ['dashboard']);
  assert.equal(doc.getElementById('chatCard').hidden, false);

  const karte = doc.getElementById('tripCard');
  assert.equal(karte.querySelector('.gast-ziel')?.textContent, 'Ascona');
  assert.equal(karte.querySelector('.gast-notiz')?.textContent, 'Bahnhof, 8 Uhr');
  assert.ok(karte.querySelector('#gViewOriginal.gast-original'));
  /* Nach Tagen, wie in der Gruppe: ein Tag mit Datum, einer ohne. */
  assert.equal(doc.querySelectorAll('#itinList .prog-tag-gruppe').length, 2);
  assert.equal(doc.querySelector('#itinList [data-punkt-haken]'), null, 'ein Gast hakt nichts ab');
  assert.deepEqual([...doc.querySelectorAll('.g-bubble')].map(b => b.className), ['g-bubble them', 'g-bubble me']);
  assert.equal(doc.querySelector('main [style]'), null, 'gezeichnetes Markup traegt wieder style="…"');
});

test('Gast: eine Reise ohne Programm und ohne Absender zeigt den Hinweis und keinen Chat', async () => {
  const doc = await gast({ nutzer: { uid: 'gast1' }, reise: { name: 'Leer' } });
  assert.ok(doc.querySelector('#itinList .empty-hint.gast-leer'));
  assert.equal(doc.getElementById('chatCard').hidden, true);
});

/* Seit v.35.50.0 sind Reisen Termine einer Gruppe. */
const TERMIN = {
  titel: 'Toskana', ort: 'Castiglione', notiz: 'Ab 15 Uhr', createdBy: 'michel', gastToken: 'abc',
  planHtml: '<h1>Plan</h1><script>alert(1)</script><a href="javascript:alert(2)">x</a>',
  programm: [{ id: 'i1', date: '2026-10-01', time: '06:30', title: 'Abfahrt' }, { id: 'i2', date: '2026-10-03', title: 'Siena' }],
  programmErledigt: { i1: true },
};

test('Gast: ein Termin-Link öffnet genau diesen Termin, mit Zugang {uid}_{termin}', async () => {
  const g = {
    nutzer: { uid: 'gast1', email: 'g@b.test' },
    termine: { 'groups/g2/events/e1': TERMIN },
  };
  const doc = await gast({ url: 'https://firn.test/pages/guest.html?g=g2&termin=e1&token=abc', ...g });
  assert.deepEqual(sichtbar(doc), ['dashboard']);
  assert.equal(doc.querySelector('#tripCard .form-title')?.textContent, 'Toskana');
  assert.equal(doc.querySelector('#tripCard .gast-ziel')?.textContent, 'Castiglione');
  assert.equal(doc.querySelectorAll('#itinList .prog-punkt').length, 2);
  assert.equal(doc.querySelectorAll('#itinList .prog-punkt.is-naechster').length, 1, 'der nächste Punkt ist markiert');

  const zugang = globalThis.__gast.geschrieben.find(([pfad]) => pfad.startsWith('guestAccess/'));
  assert.equal(zugang[0], 'guestAccess/gast1_e1');
  assert.deepEqual(Object.keys(zugang[1]).sort(), ['createdAt', 'eid', 'gid', 'token', 'uid']);
  assert.equal(zugang[1].gid, 'g2');

  /* Das Original: bereinigt, ohne Skript und ohne javascript:-Link. */
  doc.getElementById('gViewOriginal').click();
  const srcdoc = doc.getElementById('gViewerFrame').getAttribute('srcdoc') || '';
  assert.ok(srcdoc.includes('<h1>Plan</h1>'), 'die Seite selbst fehlt');
  assert.doesNotMatch(srcdoc, /<script|javascript:/i);
});

test('Gast: ein alter Reiselink zeigt den Termin, wenn die Reise übernommen ist', async () => {
  const doc = await gast({
    nutzer: { uid: 'gast1' },
    reise: { ...REISE, uebernommen: true, familyId: 'g2' },
    termine: { 'groups/g2/events/t1': { ...TERMIN, titel: 'Tessin als Termin' } },
  });
  assert.deepEqual(sichtbar(doc), ['dashboard']);
  assert.equal(doc.querySelector('#tripCard .form-title')?.textContent, 'Tessin als Termin');
  assert.ok(globalThis.__gast.gelesen.includes('groups/g2/events/t1'));
  const zugang = globalThis.__gast.geschrieben.find(([pfad]) => pfad.startsWith('guestAccess/'));
  assert.equal(zugang[0], 'guestAccess/gast1_t1', 'der alte Zugang gilt, weil der Termin die Kennung der Reise trägt');
});

const oeffentlich = (o = {}) => lade({
  seite: 'public.html', skript: 'assets/js/feature/oeffentlich/oeffentlich.js',
  url: 'https://firn.test/public.html', nutzer: null, ...o,
});

test('Oeffentlich: Projekte alphabetisch, der Knopf fuehrt zur Anmeldung', async () => {
  const doc = await oeffentlich({ projekte: [
    { id: 'b', name: 'Saroja', emoji: '🏞️', ownerName: 'T' },
    { id: 'a', name: 'OMMP', ownerName: 'T' },
  ] });
  assert.deepEqual([...doc.querySelectorAll('.proj .proj-name')].map(n => n.firstChild.textContent), ['OMMP', 'Saroja']);
  const knopf = doc.getElementById('authBtn');
  assert.equal(knopf.textContent, 'Anmelden');
  assert.match(knopf.getAttribute('href'), /login\.html$/);
});

test('Oeffentlich: angemeldet heisst der Knopf „Zur App"', async () => {
  const doc = await oeffentlich({ nutzer: { uid: 'u1' }, projekte: [] });
  assert.equal(doc.getElementById('authBtn').getAttribute('href'), 'index.html');
  assert.equal(doc.querySelector('#list .empty')?.textContent, 'Im Moment sind keine Projekte freigegeben.');
});

test('Oeffentlich: ein Ladefehler zeigt einen Satz, keinen Code', async () => {
  const doc = await oeffentlich({ ladeFehler: true });
  assert.equal(doc.querySelector('#list .empty')?.textContent, 'Projekte konnten nicht geladen werden.');
});

test('Oeffentlich: der Besitzer steht nur, wenn es mehrere gibt', async () => {
  const meta = doc => [...doc.querySelectorAll('.proj-meta')].map(m => m.textContent);
  const einer = await oeffentlich({ projekte: [
    { id: 'a', name: 'A', ownerName: 'Timothy van Zanten' },
    { id: 'b', name: 'B', ownerName: 'Timothy van Zanten' },
  ] });
  assert.deepEqual(meta(einer), ['Öffentlich', 'Öffentlich'], 'derselbe Name in jeder Zeile');

  const zwei = await oeffentlich({ projekte: [
    { id: 'a', name: 'A', ownerName: 'Timothy van Zanten' },
    { id: 'b', name: 'B', ownerName: 'Lea' },
  ] });
  assert.deepEqual(meta(zwei), ['Timothy van Zanten · Öffentlich', 'Lea · Öffentlich']);
});
