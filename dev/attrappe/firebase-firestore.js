/* ══════════════════════════════════════════════════════════════════
   Attrappe des Firestore-SDK — für den Attrappen-Modus des lokalen
   Servers (node dev/server.mjs --attrappe, Port 4174).

   Warum es das gibt: CLAUDE.md führte lange als offenen Punkt "die App
   ist nie end-zu-end durchgeklickt worden". Die Tests prüfen Bausteine
   einzeln; wie Hülle, Router, Rahmen und Einstellungsebene am Handy
   zusammenspielen, prüfte keiner — und genau dort brach es. Ohne
   Anmeldung zeigt die App nichts, und mit einem echten Konto gegen
   echtes Firestore klickt man nicht herum.

   Also läuft im Attrappen-Modus der GANZE echte Code, nur das SDK ist
   dieses hier: ein Speicher in localStorage (damit Seite, Router-Rahmen
   und Einstellungsrahmen dieselben Daten sehen), Zuhörer, die auch
   zwischen den Rahmen melden (BroadcastChannel), und genau die
   Funktionen, die die App importiert. Regeln prüft die Attrappe nicht
   — dafür gibt es security-model.test.mjs —, bis auf die zu Profilen,
   Namenskarten und dem TVZA-Kreis (unten).

   Nichts hiervon wird ausgeliefert: dev/ gehört nicht zur App.
   ══════════════════════════════════════════════════════════════════ */

import { startDaten, VERSION } from './daten.js';

const SCHLUESSEL = 'firn.attrappe.db';
const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('firn-attrappe') : null;

/* ── Werte ─────────────────────────────────────────────────────────*/

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d) { return Timestamp.fromMillis(d.getTime()); }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  isEqual(o) { return o?.toMillis?.() === this.toMillis(); }
  valueOf() { return String(this.toMillis()).padStart(15, '0'); }
}

const PLATZHALTER = '__attrappe';
export const serverTimestamp = () => ({ [PLATZHALTER]: 'zeit' });
export const increment = n => ({ [PLATZHALTER]: 'plus', n });
export const arrayUnion = (...werte) => ({ [PLATZHALTER]: 'union', werte });
export const arrayRemove = (...werte) => ({ [PLATZHALTER]: 'ohne', werte });
export const deleteField = () => ({ [PLATZHALTER]: 'weg' });

const istObjekt = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !v[PLATZHALTER];

/* Gespeichert wird JSON; eine Zeit als { __ts: ms }. */
function roh(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(roh);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roh(x)]));
  return v;
}
function lebendig(v) {
  if (Array.isArray(v)) return v.map(lebendig);
  if (v && typeof v === 'object') {
    if (Number.isFinite(v.__ts) && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, lebendig(x)]));
  }
  return v;
}

/* Platzhalter auflösen gegen den alten Wert. */
function aufloesen(neu, alt) {
  if (neu && neu[PLATZHALTER]) {
    switch (neu[PLATZHALTER]) {
      case 'zeit': return { __ts: Date.now() };
      case 'plus': return (Number(alt) || 0) + neu.n;
      case 'union': return [...new Set([...(Array.isArray(alt) ? alt : []), ...roh(neu.werte)].map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
      case 'ohne': { const weg = new Set(roh(neu.werte).map(x => JSON.stringify(x))); return (Array.isArray(alt) ? alt : []).filter(x => !weg.has(JSON.stringify(x))); }
      case 'weg': return undefined;
    }
  }
  if (istObjekt(neu)) {
    const raus = {};
    for (const [k, x] of Object.entries(neu)) {
      const w = aufloesen(x, undefined);
      if (w !== undefined) raus[k] = w;
    }
    return raus;
  }
  return roh(neu);
}

/* setDoc mit merge: Karten verschmelzen, alles andere ersetzt. */
function verschmelzen(alt, neu) {
  const raus = { ...(alt || {}) };
  for (const [k, x] of Object.entries(neu)) {
    if (istObjekt(x) && istObjekt(raus[k])) raus[k] = verschmelzen(raus[k], x);
    else {
      const w = aufloesen(x, raus[k]);
      if (w === undefined) delete raus[k]; else raus[k] = w;
    }
  }
  return raus;
}

/* updateDoc: "units.kraft" heisst verschachtelt. */
function aktualisieren(alt, neu) {
  const raus = JSON.parse(JSON.stringify(alt || {}));
  for (const [pfad, x] of Object.entries(neu)) {
    const teile = pfad.split('.');
    let ziel = raus;
    for (const t of teile.slice(0, -1)) ziel = (ziel[t] = istObjekt(ziel[t]) ? ziel[t] : {});
    const letzter = teile.at(-1);
    const w = aufloesen(x, ziel[letzter]);
    if (w === undefined) delete ziel[letzter]; else ziel[letzter] = w;
  }
  return raus;
}

/* ── Speicher ──────────────────────────────────────────────────────*/

let speicher = {};
function lesen() {
  try { speicher = JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null') || {}; }
  catch { speicher = {}; }
}
function schreiben() {
  localStorage.setItem(SCHLUESSEL, JSON.stringify(speicher));
  kanal?.postMessage('neu');
  queueMicrotask(melden);
}

const bereit = (async () => {
  lesen();
  if (speicher.__version !== VERSION) {
    speicher = { __version: VERSION, ...(await startDaten()) };
    localStorage.setItem(SCHLUESSEL, JSON.stringify(speicher));
  }
})();

/** Für die Konsole: alles zurück auf die Startdaten. */
globalThis.attrappeZuruecksetzen = () => { localStorage.removeItem(SCHLUESSEL); location.reload(); };

/* ── Referenzen ────────────────────────────────────────────────────*/

class DocumentReference {
  constructor(path) { this.type = 'document'; this.path = path; this.id = path.split('/').at(-1); this.firestore = DB; }
  get parent() { return new CollectionReference(this.path.split('/').slice(0, -1).join('/')); }
}
class CollectionReference {
  constructor(path) { this.type = 'collection'; this.path = path; this.id = path.split('/').at(-1); this.firestore = DB; }
  get parent() {
    const t = this.path.split('/');
    return t.length > 1 ? new DocumentReference(t.slice(0, -1).join('/')) : null;
  }
}

const DB = { type: 'firestore', app: {} };
export const getFirestore = () => DB;
export const initializeFirestore = () => DB;
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});

const neueId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

export function collection(basis, ...teile) {
  return new CollectionReference([basis?.path, ...teile].filter(Boolean).join('/'));
}
export function doc(basis, ...teile) {
  if (basis instanceof CollectionReference && !teile.length) return new DocumentReference(`${basis.path}/${neueId()}`);
  return new DocumentReference([basis?.path, ...teile].filter(Boolean).join('/'));
}
export const collectionGroup = (db, id) => ({ type: 'group', id });
export function query(basis, ...bed) {
  return basis.type === 'query'
    ? { type: 'query', basis: basis.basis, bed: [...basis.bed, ...bed] }
    : { type: 'query', basis, bed };
}
export const where = (feld, op, wert) => ({ art: 'where', feld, op, wert });
export const orderBy = (feld, richtung = 'asc') => ({ art: 'orderBy', feld, richtung });
export const limit = n => ({ art: 'limit', n });
export const limitToLast = n => ({ art: 'limitToLast', n });

/* ── Lesen ─────────────────────────────────────────────────────────*/

class DocumentSnapshot {
  constructor(ref, daten) { this.ref = ref; this.id = ref.id; this._d = daten; this.metadata = { fromCache: false, hasPendingWrites: false }; }
  exists() { return this._d !== undefined; }
  data() { return this._d === undefined ? undefined : lebendig(JSON.parse(JSON.stringify(this._d))); }
  get(feld) { return lebendig(feldWert(this._d, feld)); }
}
function querySnap(treffer) {
  const docs = treffer.map(([p, d]) => new DocumentSnapshot(new DocumentReference(p), d));
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn), metadata: { fromCache: false } };
}

const feldWert = (d, feld) => String(feld).split('.').reduce((x, k) => (x == null ? undefined : x[k]), d);
const vergleichbar = v => (v && Number.isFinite(v.__ts) ? v.__ts : v);
const gleich = (a, b) => JSON.stringify(vergleichbar(a)) === JSON.stringify(vergleichbar(b));

function passtBasis(basis, pfad) {
  const t = pfad.split('/');
  if (t.length % 2) return false;
  if (basis.type === 'group') return t.at(-2) === basis.id;
  return t.slice(0, -1).join('/') === basis.path;
}

function treffer(q) {
  const basis = q.type === 'query' ? q.basis : q;
  const bed = q.type === 'query' ? q.bed : [];
  let liste = Object.entries(speicher).filter(([p]) => p !== '__version' && passtBasis(basis, p));
  for (const b of bed) {
    if (b.art !== 'where') continue;
    const w = roh(b.wert);
    liste = liste.filter(([, d]) => {
      const v = feldWert(d, b.feld);
      const a = vergleichbar(v), z = vergleichbar(w);
      switch (b.op) {
        case '==': return gleich(v, w);
        case '!=': return v !== undefined && !gleich(v, w);
        case '<': return a < z;
        case '<=': return a <= z;
        case '>': return a > z;
        case '>=': return a >= z;
        case 'in': return Array.isArray(w) && w.some(x => gleich(v, x));
        case 'not-in': return Array.isArray(w) && !w.some(x => gleich(v, x));
        case 'array-contains': return Array.isArray(v) && v.some(x => gleich(x, w));
        case 'array-contains-any': return Array.isArray(v) && v.some(x => w.some(y => gleich(x, y)));
        default: throw new Error(`Attrappe kennt den Operator ${b.op} nicht`);
      }
    });
  }
  for (const b of bed.filter(x => x.art === 'orderBy').reverse()) {
    liste = liste.filter(([, d]) => feldWert(d, b.feld) !== undefined);
    liste.sort(([, x], [, y]) => {
      const a = vergleichbar(feldWert(x, b.feld)), z = vergleichbar(feldWert(y, b.feld));
      const r = a < z ? -1 : a > z ? 1 : 0;
      return b.richtung === 'desc' ? -r : r;
    });
  }
  const grenze = bed.find(x => x.art === 'limit');
  if (grenze) liste = liste.slice(0, grenze.n);
  const letzte = bed.find(x => x.art === 'limitToLast');
  if (letzte) liste = liste.slice(-letzte.n);
  return liste;
}

/* ── Zwei Regeln, nachgestellt ─────────────────────────────────────
   Sonst prüft die Attrappe keine Regeln. Diese doch, weil sonst nie zu
   sehen wäre, was ein Athlet nach dem Ausrollen von v.35.47.0 sieht:
   ein fremdes Profil (users/{uid}) liest nur der Admin, und auflisten
   dürfen die Profile und die Namenskarten (personen) nur er. Sonst läse
   die Attrappe munter weiter, und ein vergessener Lesezugriff fiele erst
   gegen das echte Firestore auf. */
const ich = () => { try { return localStorage.getItem('firn.attrappe.uid') ?? 'michel'; } catch { return 'michel'; } };
const istAdmin = () => speicher['users/' + ich()]?.isTimo === true;
const abgelehnt = () => fehler('permission-denied', 'Missing or insufficient permissions.');
function darfLesen(ref) {
  const t = ref.path.split('/');
  if (t.length === 2 && t[0] === 'users' && t[1] !== ich() && !istAdmin()) throw abgelehnt();
}
function darfListen(q) {
  const basis = q.type === 'query' ? q.basis : q;
  if (basis.type === 'collection' && ['users', 'personen'].includes(basis.path) && !istAdmin()) throw abgelehnt();
  /* Die Liste des TVZA-Kreises liest nur, wer darauf steht (v.35.48.0). */
  if (basis.type === 'collection' && basis.path === 'kreis' && !istAdmin() && !speicher['kreis/' + ich()]) throw abgelehnt();
}

export async function getDoc(ref) { await bereit; lesen(); darfLesen(ref); return new DocumentSnapshot(ref, speicher[ref.path]); }
export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;
export const getDocsFromServer = (...a) => getDocs(...a);
export async function getDocs(q) { await bereit; lesen(); darfListen(q); return querySnap(treffer(q)); }

/* ── Schreiben ─────────────────────────────────────────────────────*/

function fehler(code, text) { const e = new Error(text); e.code = code; e.name = 'FirebaseError'; return e; }

function setzen(ref, daten, opt = {}) {
  speicher[ref.path] = opt.merge ? verschmelzen(speicher[ref.path], daten) : aufloesen(daten, undefined);
}
function aendern(ref, daten) {
  if (!speicher[ref.path]) throw fehler('not-found', `No document to update: ${ref.path}`);
  speicher[ref.path] = aktualisieren(speicher[ref.path], daten);
}

export async function setDoc(ref, daten, opt) { await bereit; lesen(); setzen(ref, daten, opt); schreiben(); }
export async function updateDoc(ref, daten) { await bereit; lesen(); aendern(ref, daten); schreiben(); }
export async function deleteDoc(ref) { await bereit; lesen(); delete speicher[ref.path]; schreiben(); }
export async function addDoc(coll, daten) { const ref = doc(coll); await setDoc(ref, daten); return ref; }

export function writeBatch() {
  const schritte = [];
  const stapel = {
    set(ref, d, o) { schritte.push(() => setzen(ref, d, o)); return stapel; },
    update(ref, d) { schritte.push(() => aendern(ref, d)); return stapel; },
    delete(ref) { schritte.push(() => { delete speicher[ref.path]; }); return stapel; },
    async commit() {
      await bereit; lesen();
      const vorher = JSON.stringify(speicher);
      try { schritte.forEach(s => s()); }
      catch (e) { speicher = JSON.parse(vorher); throw e; }   /* alles oder nichts */
      schreiben();
    },
  };
  return stapel;
}

/* ── Zuhören ───────────────────────────────────────────────────────*/

const hoerer = new Set();
function feuern(h) {
  let snap, stand;
  try {
    if (h.q instanceof DocumentReference) darfLesen(h.q); else darfListen(h.q);
    if (h.q instanceof DocumentReference) {
      stand = JSON.stringify(speicher[h.q.path] ?? null);
      snap = new DocumentSnapshot(h.q, speicher[h.q.path]);
    } else {
      const t = treffer(h.q);
      stand = JSON.stringify(t);
      snap = querySnap(t);
    }
  } catch (e) { h.err?.(e); return; }
  /* Wie Firestore: nur melden, wenn sich etwas geändert hat — sonst
     löste ein Zuhörer, der selbst schreibt, eine Schleife aus. */
  if (stand === h.stand) return;
  h.stand = stand;
  try { h.cb(snap); } catch (e) { console.error('[attrappe] Zuhörer', e); }
}
function melden() { for (const h of hoerer) feuern(h); }

export function onSnapshot(q, a, b, c) {
  const [cb, err] = typeof a === 'function' ? [a, b] : [b, c];
  const h = { q, cb, err, stand: undefined };
  hoerer.add(h);
  bereit.then(() => { lesen(); feuern(h); });
  return () => hoerer.delete(h);
}

kanal?.addEventListener('message', () => { lesen(); melden(); });
