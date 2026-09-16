/* ══════════════════════════════════════════════════════════════════
   Gruppen — der Zugriff auf das Datenmodell aus Phase 1.

   Eine Gruppe ist das eine Objekt, an dem alles hängt: Familie und
   Kader sind dieselbe Sache mit anderen Wörtern und anderen
   eingeschalteten Bereichen. Der Code kennt den Unterschied nicht.

       groups/{gid}                 Name, Art, Kopf, Bereiche, Code
       groups/{gid}/members/{uid}   eine Rolle pro Person

   Mitglieder liegen als Unterdokumente, nicht als Array. Ein Array
   kann keine Rolle tragen, und genau die braucht ein Kader.

   ── Die zwei Klammern ──────────────────────────────────────────────
   Beide sind in firestore.rules erzwungen, hier nur eingehalten:

     1. Eine Gruppe entsteht nie ohne ihren Kopf. Gruppendokument und
        Mitgliedsdokument des Gründers gehen in EINEM Stapel raus.
        Ein einzelnes create() würde von den Regeln abgelehnt.

     2. Wer sich als Kopf einträgt, muss von der Gruppe auch als Kopf
        geführt werden. Deshalb steht headUid im selben Stapel.

   ── Warum collectionGroup ──────────────────────────────────────────
   "In welchen Gruppen bin ich?" lässt sich nicht am Gruppendokument
   ablesen, seit die Mitglieder darunter liegen. Es ginge über eine
   Liste im eigenen Profil — aber dann sähe ein Athlet nicht, dass ein
   Trainer ihn aufgenommen hat, denn der Trainer darf fremde Profile
   nicht schreiben. Also die Abfrage über alle members-Sammlungen.

   Das kostet einen Index (firestore.indexes.json) und eine eigene
   Regel mit rekursivem Platzhalter — die Regel unter /groups/{gid}/
   members greift für Sammelgruppen-Abfragen NICHT.
   ══════════════════════════════════════════════════════════════════ */

import { db, reportClientError } from './firebase-config.js';
import {
  collection, collectionGroup, doc, getDoc, getDocs, query, where,
  getDocFromCache, getDocFromServer, getDocsFromServer,
  onSnapshot, writeBatch, updateDoc, deleteDoc, serverTimestamp, deleteField, addDoc, setDoc, Timestamp,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { aenderungenPruefen } from './einheit.js';
import { nachFolge, folgeSauber } from './gruppen-folge.js';
import { neuerCode, codeSauber, ablaufAb, abgelaufen } from './einladung.js';
import { reiseUebernehmen } from './reise-uebernahme.js';
import { nameVon, kreisMitglieder } from './personen.js';
import { bekannteAus } from './bekannte.js';
import { mitgliedschaftenFolgen } from './gruppen-strom.js';

/* Die Gruppenseite lädt nav.js nicht, schreibt ihre Namenskarte also
   selbst — über diesen Weg, damit sie bei groups.js bleibt. */
export { eigeneKarte } from './personen.js';

/* ── Rollen ────────────────────────────────────────────────────────
   Dieselben drei in beiden Gruppenarten. Nur die Wörter wechseln. */

export const ROLLEN = Object.freeze(['head', 'staff', 'mitglied']);

/* Drei Gruppenarten, ein Code. Der Unterschied sind Woerter und
   eingeschaltete Bereiche — ein Rennkader, ein Gym oder Verein, und
   ein Haushalt. Wer eine vierte braucht, ergaenzt hier eine Zeile und
   eine Wortliste, nicht ein Datenmodell. */
export const ARTEN = Object.freeze(['kader', 'organisation', 'familie']);

/* Kopf und Trainer kuratieren dasselbe; nur der Kopf übergibt, löscht
   und vergibt Rollen. Diese Trennung steht genauso in den Regeln — wer
   sie hier ändert, ändert nur die Oberfläche, nicht die Rechte. */
export const leitet = rolle => rolle === 'head' || rolle === 'staff';
export const fuehrt = rolle => rolle === 'head';

/* ── Wortwahl ──────────────────────────────────────────────────────
   Der einzige Unterschied zwischen Familie und Kader. Deutsch als
   Rückfallebene; sobald der i18n-Katalog die Schlüssel kennt, gewinnt
   TVZAI18n. Genau so ist i18n hier gedacht: additiv, und was fehlt,
   bleibt deutsch. */

const WORTE = {
  kader: {
    head:     { key: 'grp.kader.head',     de: 'Haupttrainer' },
    staff:    { key: 'grp.kader.staff',    de: 'Trainer' },
    mitglied: { key: 'grp.kader.mitglied', de: 'Athlet' },
    mitglieder: { key: 'grp.kader.mitglieder', de: 'Kader' },
    /* Die Überschriften der Liste, nach Funktion (v.35.59.0). */
    leitungen: { key: 'grp.kader.leitungen', de: 'Trainer' },
    mitgliederPl: { key: 'grp.kader.mitgliederPl', de: 'Athleten' },
  },
  organisation: {
    head:     { key: 'grp.org.head',     de: 'Leitung' },
    staff:    { key: 'grp.org.staff',    de: 'Trainer' },
    mitglied: { key: 'grp.org.mitglied', de: 'Mitglied' },
    mitglieder: { key: 'grp.org.mitglieder', de: 'Mitglieder' },
    leitungen: { key: 'grp.org.leitungen', de: 'Leitung' },
    mitgliederPl: { key: 'grp.org.mitgliederPl', de: 'Mitglieder' },
  },
  familie: {
    head:     { key: 'grp.familie.head',     de: 'Verwaltet die Gruppe' },
    staff:    { key: 'grp.familie.staff',    de: 'Verwaltung' },
    mitglied: { key: 'grp.familie.mitglied', de: 'Mitglied' },
    mitglieder: { key: 'grp.familie.mitglieder', de: 'Mitglieder' },
    leitungen: { key: 'grp.familie.leitungen', de: 'Verwaltung' },
    mitgliederPl: { key: 'grp.familie.mitgliederPl', de: 'Mitglieder' },
  },
};

export function wort(art, was) {
  const eintrag = (WORTE[art] || WORTE.familie)[was];
  if (!eintrag) return '';
  return window.TVZAI18n?.tOr(eintrag.key, eintrag.de) ?? eintrag.de;
}

/* ── Bereiche ──────────────────────────────────────────────────────
   Was eine neue Gruppe eingeschaltet mitbringt. Der Kern ist überall
   an; alles andere ist die Entscheidung der Gruppe. Eine Familie, die
   kein Training macht, soll davon nichts sehen — und ein Kader nichts
   vom Essen. */

export const VORGABE_BEREICHE = Object.freeze({
  kader:        { termine: true, training: true, video: false, chat: true },
  /* Ein Gym oder Verein: Kurse und Plaene ja, Videoanalyse eher nicht.
     Der Unterschied zum Kader sind zwei Schalter, kein zweites Modell. */
  organisation: { termine: true, training: true, chat: true },
  familie:      { termine: true, projekte: true, chat: true },
});

/* ── Lesen ─────────────────────────────────────────────────────────*/

export function gruppeRef(gid) { return doc(db, 'groups', gid); }
export function mitgliedRef(gid, uid) { return doc(db, 'groups', gid, 'members', uid); }

/* Der eigene Assistent einer Gruppe (v.35.53.0, ki.js): Name und was er
   beachten soll. null nimmt ihn weg — dann heisst er wieder "Assistent".
   Nur die Leitung (die Regel, assistentGueltig). */
export function assistentSetzen(gid, assistent) {
  return updateDoc(gruppeRef(gid), { assistent: assistent || deleteField() });
}

/* Scheitert das Lesen (am Laptop mit vielen Rahmen des Routers auf einem
   gemeinsamen Speicher meldet Firestore dann "offline", v.35.62.0), gilt
   der gespeicherte Stand — eine Gruppe, die man kennt, verschwindet nicht,
   nur weil der Server einen Augenblick nicht antwortet. */
/* "Gibt es nicht" aus dem Speicher des Geräts ist keine Auskunft
   (v.35.66.0). Michel: "Babelek van Zanten" stand im Assistenten, aber
   nicht unter den Gruppen. Beide lesen dieselben Mitgliedschaften und
   dieselbe Gruppe — der Unterschied war der Zeitpunkt: die Leiste fragte
   beim Start, und am Laptop antwortete Firestore dann aus dem Speicher.
   Stand dort von früher "diese Gruppe gibt es nicht" (eine Familie
   wird zur Gruppe mit DERSELBEN Kennung, Falle 13 — wer die Kennung vor
   der Übernahme las, hat genau diesen Eintrag), galt sie als gelöscht und
   wurde nie wieder gefragt; die Pille fragte später, mit Netz, und bekam
   sie. Vermutet, nicht bewiesen — ohne Zugriff auf Michels Browser. Jetzt
   fragt ein solches "gibt es nicht" den Server; antwortet der nicht,
   ist die Gruppe unbekannt (undefined), nicht gelöscht. */
export async function ladeGruppe(gid) {
  let snap;
  try { snap = await getDoc(gruppeRef(gid)); }
  catch (fehler) {
    try { snap = await getDocFromCache(gruppeRef(gid)); } catch { throw fehler; }
  }
  /* Gelöscht ist eine Gruppe nur, wenn es der SERVER sagt (v.35.70.5).
     Vorher genügte dafür ein "gibt es nicht" mit fromCache === false —
     und wenn eine Antwort gar nicht sagt, woher sie kommt, galt sie
     ebenfalls als Auskunft des Servers. Jetzt wird in beiden Fällen
     nachgefragt; bleibt auch das ohne Antwort, ist die Gruppe unbekannt
     (undefined) und die Liste unvollständig — nicht kürzer. */
  if (!snap.exists() && snap.metadata?.fromCache !== false) {
    try { snap = await getDocFromServer(gruppeRef(gid)); }
    catch { return undefined; }
  }
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Namen stehen nicht am Mitgliedsdokument. Sie dort zu spiegeln hiesse,
   sie bei jeder Namensänderung in jeder Gruppe nachziehen zu müssen —
   und irgendwann stünde in einer Gruppe ein Name, den es nicht mehr
   gibt. Bis v.35.46.0 kamen sie aus dem Profil, das dafür jedes Mitglied
   lesen durfte, samt E-Mail. Seit v.35.47.0 aus der Namenskarte
   (personen.js), die nichts trägt als den Namen.

   Ein Kader hat acht bis zwanzig Leute; das ist ein Lesezugriff pro
   Person und Seite, nicht pro Bildaufbau. */
export async function ladeMitglieder(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'members'));
  const roh = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return Promise.all(roh.map(async m => ({ ...m, name: await nameVon(m.uid) })));
}

/* Wen man kennt: die Leute aus den eigenen Gruppen, jede Person einmal.
   Das ist die Auswahl im Chat und beim Teilen — nicht mehr die Liste
   aller Konten der App. Eine Gruppe, deren Mitglieder sich nicht laden
   lassen, fällt still weg, statt die ganze Auswahl zu leeren.

   Wer im TVZA-Kreis ist ({ kreis: true }, v.35.48.0), kennt dazu die
   anderen im Kreis — Freunde und Familie sind keine Gruppe in Firn. */
export async function kontakte(uid, { kreis = false } = {}) {
  const gruppen = await gruppenJetzt(uid);
  const jeGruppe = await Promise.all(gruppen.map(async g => {
    try { return { gruppe: g.name || '', mitglieder: await ladeMitglieder(g.id) }; }
    catch { return { gruppe: g.name || '', mitglieder: [] }; }
  }));
  if (kreis) jeGruppe.push({ gruppe: 'TVZA', mitglieder: await kreisMitglieder() });
  return bekannteAus(jeGruppe, uid);
}

export async function rolleVon(gid, uid) {
  const snap = await getDoc(mitgliedRef(gid, uid));
  return snap.exists() ? (snap.data().rolle || '') : '';
}

/* Die eigenen Mitgliedsdokumente über alle Gruppen hinweg. Der Filter
   uid == eigene uid ist nicht bloss Höflichkeit: die Regel verlangt
   ihn, sonst wird die ganze Abfrage abgelehnt. */
function eigeneMitgliedschaften(uid) {
  return query(collectionGroup(db, 'members'), where('uid', '==', uid));
}

/* Eine Mitgliedschaft ohne lesbare Gruppe ist kein Fehler, sondern der
   normale Zwischenzustand, wenn jemand gerade entfernt wurde. Sie wird
   still übersprungen statt die ganze Liste scheitern zu lassen. */
const GELOESCHT = Symbol('gelöscht');

/* Welche Gruppe sich warum nicht lesen liess — je Gruppe einmal, damit
   ein dauerhaft fehlender Eintrag nicht das Log flutet. Sichtbar unter
   window.__firnGruppenFehler, gemeldet über reportClientError. */
const fehlerGemeldet = new Set();
function gruppeFehlte(gid, fehler) {
  try {
    const liste = (globalThis.window.__firnGruppenFehler ||= []);
    liste.push({ gid, code: fehler?.code || '', text: String(fehler?.message || fehler), zeit: Date.now() });
  } catch { /* kein Fenster: dann eben nur der Bericht */ }
  if (fehlerGemeldet.has(gid)) return;
  fehlerGemeldet.add(gid);
  reportClientError('gruppen/lesen', fehler);
}
async function zuGruppen(mitgliedschaften) {
  const gruppen = await Promise.all(mitgliedschaften.map(async m => {
    try {
      const g = await ladeGruppe(m.gid);
      /* undefined: unbekannt — die Liste ist unvollständig und fragt nach. */
      if (g === undefined) return null;
      return g ? { ...g, meineRolle: m.rolle } : GELOESCHT;
    } catch (e) {
      /* Der Grund darf nicht verschwinden: ohne ihn sieht man nur, dass
         eine Gruppe fehlt, und rät (v.35.70.5). */
      gruppeFehlte(m.gid, e);
      return null;
    }
  }));
  const liste = gruppen.filter(g => g && g !== GELOESCHT).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  /* Unvollständig ist die Liste nur, wenn eine Gruppe sich nicht LESEN
     liess (gleich nach dem Anlegen, siehe gruppen-strom.js) — eine
     gelöschte fehlt zu Recht und wird nicht immer wieder nachgefragt. */
  Object.defineProperty(liste, 'unvollstaendig', { value: gruppen.includes(null) });
  return liste;
}

/* ── Warum fehlt eine Gruppe? (v.35.70.6) ──────────────────────────
   Michel, mit zwei Bildern: am Laptop "TEST, Test 2, TEST GRUPPE 1",
   am Handy "Babelek van Zanten, Test" — dasselbe Konto, und die Listen
   überschneiden sich in EINER Gruppe. So etwas kann kein Timing sein:
   die beiden Geräte haben verschiedene Daten.

   Diese Auskunft vergleicht darum drei Dinge, die sonst niemand
   auseinanderhalten kann:
     - was der SERVER an Mitgliedschaften kennt,
     - was dieses GERÄT an Mitgliedschaften kennt (und ob ein Eintrag
       nur eine noch nicht gesendete Schreibung ist: hasPendingWrites),
     - ob die Gruppe selbst auf dem Server und im Speicher liegt.
   Damit steht da, ob eine Gruppe nur lokal existiert (nie beim Server
   angekommen), ob das Konto ein anderes ist (uid) oder ob das Lesen
   scheitert (Code). */
export async function gruppenDiagnose(uid) {
  const raus = { uid, server: [], geraet: [], gruppen: [], fehler: [] };
  try {
    const s = await getDocsFromServer(eigeneMitgliedschaften(uid));
    raus.server = s.docs.map(d => ({ gid: d.ref.parent.parent.id, rolle: d.data().rolle || '' }));
  } catch (e) { raus.fehler.push(`Mitgliedschaften beim Server: ${e?.code || e?.message || e}`); }
  try {
    const g = await getDocs(eigeneMitgliedschaften(uid));
    raus.geraet = g.docs.map(d => ({
      gid: d.ref.parent.parent.id,
      ausstehend: !!d.metadata?.hasPendingWrites,
      ausSpeicher: !!d.metadata?.fromCache,
    }));
  } catch (e) { raus.fehler.push(`Mitgliedschaften im Gerät: ${e?.code || e?.message || e}`); }

  const gids = [...new Set([...raus.server.map(m => m.gid), ...raus.geraet.map(m => m.gid)])];
  for (const gid of gids) {
    const eintrag = { gid, name: '', server: '', geraet: '' };
    try {
      const s = await getDocFromServer(gruppeRef(gid));
      eintrag.server = s.exists() ? 'ja' : 'nein';
      if (s.exists()) eintrag.name = s.data().name || '';
    } catch (e) { eintrag.server = e?.code || 'Fehler'; }
    try {
      const k = await getDocFromCache(gruppeRef(gid));
      eintrag.geraet = k.exists() ? 'ja' : 'nein';
      if (!eintrag.name && k.exists()) eintrag.name = k.data().name || '';
    } catch { eintrag.geraet = 'nicht im Speicher'; }
    raus.gruppen.push(eintrag);
  }
  return raus;
}

export async function meineGruppen(uid) {
  const snap = await getDocs(eigeneMitgliedschaften(uid));
  return geordnet(await zuGruppen(snap.docs.map(d => ({
    gid: d.ref.parent.parent.id, rolle: d.data().rolle || '',
  }))));
}

/* ── Die eigene Reihenfolge (v.35.68.0, gruppen-folge.js) ───────────
   Im Gerät sofort (localStorage), für alle Geräte unter
   users/{uid}/einstellungen/gruppen. Die gemeinsame Liste (unten) ordnet
   danach — Leiste, Wähler, Kalender, Chat, Pille und Start sehen dieselbe
   Folge. Ohne Regel bleibt sie im Gerät; ausgerollt am 16.09.2026. */
const FOLGE_SPEICHER = 'firn.gruppenFolge';
function folgeAusGeraet() {
  try { return folgeSauber(JSON.parse(localStorage.getItem(FOLGE_SPEICHER) || '[]')); } catch { return []; }
}
let folgeJetzt = folgeAusGeraet();
export const gruppenFolge = () => folgeJetzt;
function folgeMerken(folge) {
  folgeJetzt = folgeSauber(folge);
  try { localStorage.setItem(FOLGE_SPEICHER, JSON.stringify(folgeJetzt)); } catch { /* dann nur für diese Seite */ }
}
function geordnet(liste) {
  const neu = nachFolge(liste || [], folgeJetzt);
  Object.defineProperty(neu, 'unvollstaendig', { value: !!liste?.unvollstaendig });
  return neu;
}
const folgeRef = uid => doc(db, 'users', uid, 'einstellungen', 'gruppen');

/** Die Reihenfolge setzen — sofort hier und oben, dann beim Server. */
export async function gruppenFolgeSetzen(uid, folge) {
  folgeMerken(folge);
  for (const w of new Set([window, obersteSeite()])) {
    try { w.dispatchEvent(new CustomEvent('firn-gruppen-folge')); } catch { /* fremdes Dokument */ }
  }
  await setDoc(folgeRef(uid), { gruppenFolge: folgeJetzt, aktualisiert: serverTimestamp() });
}

/* Mit den Metadaten: eine eben angelegte Gruppe lässt sich erst lesen,
   wenn der Server den Stapel bestätigt hat — und diese Bestätigung kommt
   nur als Änderung der Metadaten (gruppen-strom.js, v.35.59.0). */
/* Und einmal direkt beim Server (v.35.62.0). Michel: "auf dem Handy ist
   die Gruppe meiner Familie, auf dem Laptop nicht — dasselbe Konto". Die
   Abfrage allein kann aus einem veralteten Speicher antworten, wenn im
   Browser mehrere Rahmen denselben Speicher teilen und keiner die
   Verbindung hält. Die Antwort des Servers geht durch denselben Strom;
   stimmt sie mit dem Speicher überein, geschieht nichts. Bei einem
   Fehler ist die Liste nicht leer, sondern unbekannt — die Seite wartet. */
/* ── EINE Liste für die ganze App (v.35.63.0) ──────────────────────
   Michel, mit zwei Bildschirmen: links in der Leiste "TEST" und "Test 2",
   daneben die Gruppenseite mit "Noch in keiner Gruppe" — und wechseln
   half nicht. Die Leiste liest in der obersten Seite, die Gruppenseite
   im Rahmen des Routers mit ihrer EIGENEN Firestore-Instanz; am Laptop
   (alle Tabs vorgeladen, jeder Rahmen eine Instanz auf einem gemeinsamen
   Speicher) lieferte die zweite eine leere Liste, während die erste
   stimmte. Die Seite suchte die gewählte Gruppe dann in ihrer leeren
   Liste und fand sie nie.

   Jetzt hält die oberste Seite EINEN Zuhörer (`__firnGruppenQuelle`), und
   jeder Rahmen hängt sich an ihn — Gruppe, Kalender, Chat, Training sehen
   genau, was die Leiste sieht. Nur wo es oben (noch) keine Quelle gibt,
   hört eine Seite selbst. Ein Fehler des Zuhörers leert die Liste nicht:
   was man kannte, bleibt. */
function gruppenQuelle(uid) {
  const hoerer = new Set();
  let letzte = null;
  let roh = null;
  const melden = liste => {
    roh = liste;
    letzte = geordnet(liste);
    liste = letzte;
    for (const h of [...hoerer]) {
      /* Ein Rahmen, den der Router entfernt hat, meldet sich hier ab —
         spätestens, wenn der Aufruf in sein Dokument scheitert. */
      try { h(liste); } catch { hoerer.delete(h); }
    }
  };
  const folgen = mitgliedschaftenFolgen(zuGruppen, melden);
  onSnapshot(eigeneMitgliedschaften(uid), { includeMetadataChanges: true }, folgen,
    () => { if (!letzte) melden([]); });
  getDocsFromServer(eigeneMitgliedschaften(uid)).then(folgen, () => {});

  /* Fehlt etwas, wird nachgefragt, sobald es wieder gehen könnte: das
     Netz ist zurück, die App kommt aus dem Hintergrund, das Fenster
     bekommt den Fokus (v.35.70.5). Ist die Liste vollständig, tut das
     hier nichts — und öfter als alle 20 Sekunden fragt es nie. */
  let zuletztGefragt = 0;
  const nachfragen = () => {
    if (letzte && !letzte.unvollstaendig) return;
    const jetzt = Date.now();
    if (jetzt - zuletztGefragt < 20000) return;
    zuletztGefragt = jetzt;
    folgen.nochmal();
    /* Auch die Mitgliedschaften selbst können aus dem Speicher gekommen
       sein — dann fehlt die Gruppe schon in der Abfrage. */
    getDocsFromServer(eigeneMitgliedschaften(uid)).then(folgen, () => {});
  };
  window.addEventListener('online', nachfragen);
  window.addEventListener('focus', nachfragen);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) nachfragen(); });
  /* Die Reihenfolge: von einem anderen Gerät (Server), aus einer anderen
     Seite dieses Geräts (storage) oder von hier (firn-gruppen-folge). */
  const neuOrdnen = () => { folgeJetzt = folgeAusGeraet(); if (roh) melden(roh); };
  onSnapshot(folgeRef(uid), snap => {
    const f = snap.exists() ? snap.data().gruppenFolge : null;
    if (!Array.isArray(f) || JSON.stringify(folgeSauber(f)) === JSON.stringify(folgeJetzt)) return;
    folgeMerken(f);
    if (roh) melden(roh);
  }, () => { /* ohne Regel: die Folge des Geräts gilt */ });
  window.addEventListener('firn-gruppen-folge', neuOrdnen);
  window.addEventListener('storage', e => { if (e.key === FOLGE_SPEICHER) neuOrdnen(); });
  return {
    uid,
    /* Die zuletzt gemeldete Liste (v.35.67.0, für kontakte()). */
    letzte: () => letzte,
    abonnieren(cb) {
      hoerer.add(cb);
      if (letzte) cb(letzte);
      return () => hoerer.delete(cb);
    },
  };
}

function obersteSeite() {
  try { return window.top?.document ? window.top : window; } catch { return window; }
}

/* Die Gruppen, wie die Leiste sie kennt (v.35.67.0). Im Chat blieb die
   Auswahl "Wem schreiben?" am Laptop leer, obwohl die Leiste die Gruppen
   zeigte — der Rahmen fragte mit seiner eigenen Firestore-Instanz
   (siehe v.35.63.0). Gibt es oben eine vollständige Liste, gilt sie. */
async function gruppenJetzt(uid) {
  const quelle = obersteSeite().__firnGruppenQuelle;
  const liste = quelle?.uid === uid ? quelle.letzte?.() : null;
  if (Array.isArray(liste) && !liste.unvollstaendig) return liste;
  return meineGruppen(uid);
}

export function beobachteMeineGruppen(uid, cb) {
  const oben = obersteSeite();
  let quelle = oben.__firnGruppenQuelle;
  if (quelle?.uid === uid) {
    const weg = quelle.abonnieren(cb);
    /* Entfernt der Router den Rahmen, meldet er sich ab. */
    if (oben !== window) window.addEventListener('pagehide', weg, { once: true });
    return weg;
  }
  quelle = gruppenQuelle(uid);
  /* Nur die oberste Seite legt die gemeinsame Quelle ab: sie lebt so lange
     wie die App. Ein Rahmen, der vor ihr da ist, hört für sich. */
  if (oben === window) window.__firnGruppenQuelle = quelle;
  return quelle.abonnieren(cb);
}

/* ── Schreiben ─────────────────────────────────────────────────────*/

function code() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/* Gruppe und Kopf entstehen zusammen oder gar nicht — siehe Klammer 1
   im Kopf dieser Datei. writeBatch ist hier keine Bequemlichkeit,
   sondern die Bedingung, unter der die Regeln das Schreiben überhaupt
   zulassen. */
export async function gruppeAnlegen(uid, { name, art = 'familie', bereiche } = {}) {
  const sauber = String(name ?? '').trim();
  if (!sauber) throw new Error('Die Gruppe braucht einen Namen.');
  if (sauber.length > 80) throw new Error('Der Name ist zu lang.');
  if (!ARTEN.includes(art)) throw new Error('Unbekannte Gruppenart.');

  const ref = doc(collection(db, 'groups'));
  const stapel = writeBatch(db);

  stapel.set(ref, {
    name: sauber,
    art,
    headUid: uid,
    bereiche: bereiche || { ...VORGABE_BEREICHE[art] },
    inviteToken: code(),
    createdAt: serverTimestamp(),
  });
  stapel.set(mitgliedRef(ref.id, uid), { uid, rolle: 'head', seit: serverTimestamp() });

  await stapel.commit();
  return ref.id;
}

/* Eine Gruppe löschen (v.35.59.0) — nur der Kopf. Michel: "man kann
   Gruppen nicht löschen, wenn man sie erstellt hat". Die Regel liess es
   immer zu (allow delete: headsGroup), nur gab es keinen Knopf.

   Die Reihenfolge ist die der Regeln: zuerst die Gruppe (headsGroup
   liest sie), dann die Kontaktkarten, die offenen Einladungen und die
   anderen Mitglieder (leadsGroup liest nur die EIGENE Mitgliedschaft,
   die dafür noch stehen muss), zuletzt die eigene Mitgliedschaft — die
   Regel lässt den Kopf nur gehen, wenn es die Gruppe nicht mehr gibt.
   Termine und Pläne bleiben in Firestore, aber ohne Mitglieder liest sie
   niemand mehr (inGroup). */
export async function gruppeLoeschen(gid, uid) {
  const [mitglieder, kontakte, einladungen] = await Promise.all([
    getDocs(collection(db, 'groups', gid, 'members')),
    getDocs(collection(db, 'groups', gid, 'kontakte')).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, 'groupInvites'), where('gid', '==', gid))).catch(() => ({ docs: [] })),
  ]);
  await deleteDoc(gruppeRef(gid));
  const rest = [
    ...kontakte.docs.map(d => d.ref),
    ...einladungen.docs.map(d => d.ref),
    ...mitglieder.docs.filter(d => d.id !== uid).map(d => d.ref),
  ];
  for (let i = 0; i < rest.length; i += 400) {
    const stapel = writeBatch(db);
    rest.slice(i, i + 400).forEach(ref => stapel.delete(ref));
    await stapel.commit();
  }
  /* Mit Regeln vor v.35.59.0 bleibt die eigene Mitgliedschaft stehen —
     sie zeigt auf nichts und fällt aus jeder Liste (zuGruppen). */
  try { await deleteDoc(mitgliedRef(gid, uid)); } catch { /* siehe oben */ }
}

/* ── Die Kalender einer Gruppe (v.35.60.0, kalender-quellen.js) ─────
   Trainings, Lager und Rennen stehen im Kalender ohnehin getrennt (die
   Art des Termins). Was darüber hinaus gebraucht wird — "Rennplan",
   "Elternanlässe" —, legt die Leitung hier an; ein Termin kann einem
   davon zugeordnet werden. Lesen dürfen alle in der Gruppe. */
export async function ladeGruppenKalender(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'kalender'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
}

export async function gruppenKalenderAnlegen(gid, uid, { name, farbe }) {
  const ref = await addDoc(collection(db, 'groups', gid, 'kalender'), {
    name, farbe, erstelltVon: uid, erstelltAm: serverTimestamp(),
  });
  return ref.id;
}

/* Die Termine darin behalten ihr Feld und stehen danach wieder unter
   ihrer Art (quelleVon kennt den Kalender nicht mehr). */
export function gruppenKalenderLoeschen(gid, kid) {
  return deleteDoc(doc(db, 'groups', gid, 'kalender', kid));
}

export function gruppeAendern(gid, patch) {
  const erlaubt = ['name', 'farbe', 'artFarben', 'bereiche', 'inviteToken', 'icsToken'];
  const daten = Object.fromEntries(
    Object.entries(patch).filter(([k]) => erlaubt.includes(k)));
  if (!Object.keys(daten).length) return Promise.resolve();
  return updateDoc(gruppeRef(gid), daten);
}

export function bereichSchalten(gid, schluessel, an) {
  return updateDoc(gruppeRef(gid), { [`bereiche.${schluessel}`]: !!an });
}

/* Die Leitung nimmt Athleten auf; weitere Trainer ernennt der Kopf.
   Die Regeln lehnen alles andere ab — hier steht es nur, damit die
   Oberfläche gar nicht erst etwas anbietet, das scheitern würde. */
export function mitgliedAufnehmen(gid, uid, rolle = 'mitglied') {
  if (rolle === 'head') throw new Error('Eine Gruppe hat genau einen Kopf.');
  return writeBatch(db)
    .set(mitgliedRef(gid, uid), { uid, rolle, seit: serverTimestamp() })
    .commit();
}

export function rolleSetzen(gid, uid, rolle) {
  if (rolle !== 'staff' && rolle !== 'mitglied') {
    throw new Error('Nur staff oder mitglied. Den Kopf wechselt die Übergabe.');
  }
  return updateDoc(mitgliedRef(gid, uid), { rolle });
}

/* Mit der Mitgliedschaft geht die Kontaktkarte — im selben Batch, damit
   keine Telefonnummer von jemandem liegen bleibt, der nicht mehr dabei
   ist. Die Regel fuer kontakte sieht beim Batch den Stand davor. */
export function mitgliedEntfernen(gid, uid) {
  return writeBatch(db)
    .delete(kontaktRef(gid, uid))
    .delete(mitgliedRef(gid, uid))
    .commit();
}

/* Der Kopf geht nicht einfach — sonst bliebe eine Gruppe zurück, die
   niemand mehr verwalten kann. Er übergibt zuerst. */
export function gruppeVerlassen(gid, uid) {
  return writeBatch(db)
    .delete(kontaktRef(gid, uid))
    .delete(mitgliedRef(gid, uid))
    .commit();
}

/* ── Kontakte ──────────────────────────────────────────────────────
   Die Karte einer Person. Lesen und schreiben duerfen die Leitung und
   die Person selbst — firestore.rules, match /groups/{gid}/kontakte.
   Was hineinkommt, bereinigt kontakte.js; hier wird nur gespeichert. */
export function kontaktRef(gid, uid) {
  return doc(db, 'groups', gid, 'kontakte', uid);
}

export async function ladeKontakt(gid, uid) {
  const snap = await getDoc(kontaktRef(gid, uid));
  return snap.exists() ? { ...snap.data(), uid } : { uid };
}

/** Alle Karten der Gruppe — nur fuer die Leitung, fuer den Verteiler. */
export async function ladeKontakte(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'kontakte'));
  return snap.docs.map(d => ({ ...d.data(), uid: d.id }));
}

/* Die ganze Karte wird geschrieben, nicht einzelne Felder: wer im
   Formular ein Feld leert, will es weg haben, und ein merge liesse es
   stehen. */
export function kontaktSpeichern(gid, uid, kontakt, vonUid) {
  return writeBatch(db)
    .set(kontaktRef(gid, uid), {
      ...kontakt,
      uid,
      geaendertVon: vonUid,
      geaendertAm: serverTimestamp(),
    })
    .commit();
}

export function uebergeben(gid, neuerKopfUid) {
  return updateDoc(gruppeRef(gid), { headUid: neuerKopfUid });
}

/* ── Aktive Gruppe ─────────────────────────────────────────────────
   Welche Gruppe der dritte Tab gerade zeigt. Das ist eine Vorliebe des
   Geräts, keine Eigenschaft des Kontos — wer am Handy den Kader offen
   hat, will am Rechner vielleicht die Familie sehen. Darum
   localStorage und nicht das Profil. */

const SCHLUESSEL = 'firn.gruppe';

export function aktiveGruppeId() {
  try { return localStorage.getItem(SCHLUESSEL) || ''; }
  catch { return ''; }
}

export function aktiveGruppeSetzen(gid) {
  const vorher = aktiveGruppeId();
  try { localStorage.setItem(SCHLUESSEL, gid || ''); }
  catch { /* privater Modus — dann eben jedes Mal die erste Gruppe */ }
  /* EIN Merker, und wer ihn zeigt, erfaehrt vom Wechsel: die Leiste
     schreibt den neuen Namen, die Gruppenseite zeichnet die neue Gruppe.
     Vorher wusste die Leiste davon erst beim naechsten Seitenwechsel. */
  if ((gid || '') !== vorher) {
    globalThis.window?.dispatchEvent?.(new CustomEvent('firn-gruppe', { detail: { gid: gid || '' } }));
  }
}

/* Seit die Seiten im Router stehen bleiben (v.35.53.0), leben mehrere
   Dokumente nebeneinander: die Seite oben und die geparkten Rahmen. Wer
   in einem die Gruppe wechselt, schreibt den Merker — die anderen hören
   es über 'storage' und schalten mit um, sonst zeigte die geparkte
   Gruppe beim Zurückkommen noch die alte. */
globalThis.window?.addEventListener?.('storage', event => {
  if (event.key !== SCHLUESSEL) return;
  globalThis.window.dispatchEvent(new CustomEvent('firn-gruppe', { detail: { gid: event.newValue || '' } }));
});

/* Die gemerkte Gruppe kann verschwunden sein: verlassen, entfernt,
   gelöscht. Dann fällt die Wahl auf die erste vorhandene, statt einen
   leeren Tab zu zeigen. */
export function waehleAktive(gruppen) {
  if (!gruppen?.length) return null;
  const gemerkt = aktiveGruppeId();
  return gruppen.find(g => g.id === gemerkt) || gruppen[0];
}

/* ── Beitreten ─────────────────────────────────────────────────────
   Ohne diesen Weg gäbe es gar keinen. Die Leitung kann Leute nur über
   ihre uid aufnehmen — und die kennt kein Trainer.

   Ein Code zeigt auf genau eine Gruppe und gilt für beliebig viele
   Beitritte. Das unterscheidet ihn von memberInvites, die an eine
   E-Mail gebunden und einmalig sind: ein Kader lädt zehn Athleten mit
   demselben Zettel ein, nicht mit zehn Zetteln. Zurückziehen heisst
   löschen — danach trägt der Code ins Leere, und wer schon drin ist,
   bleibt drin.

   Seit v.35.53.0 kurz und mit Ablauf (`bis`, einladung.js): acht
   Zeichen statt 24, und nach sieben Tagen lässt die Regel niemanden
   mehr damit herein. */

export async function einladungErzeugen(gid, uid, { bis = ablaufAb() } = {}) {
  const kennung = neuerCode();
  await writeBatch(db)
    .set(doc(db, 'groupInvites', kennung),
         { gid, createdBy: uid, createdAt: serverTimestamp(), bis: Timestamp.fromDate(bis) })
    .commit();
  return { code: kennung, bis };
}

export function einladungZuruecknehmen(kennung) {
  return deleteDoc(doc(db, 'groupInvites', kennung));
}

/* Die Einladungen einer Gruppe — nur für ihre Leitung, und nur mit dem
   Filter auf die Gruppe (die Regel verlangt ihn). Abgelaufene räumt die
   Leitung dabei weg, damit sie nicht liegen bleiben; die gültigen kommen
   zurück, die neueste zuerst. So bekommt, wer zweimal auf "Einladen"
   tippt, denselben Link und nicht jedes Mal einen neuen. */
export async function gruppenEinladungen(gid) {
  const snap = await getDocs(query(collection(db, 'groupInvites'), where('gid', '==', gid)));
  const jetzt = new Date();
  const alle = snap.docs.map(d => ({ code: d.id, ...d.data() }));
  const alt = alle.filter(e => e.bis && abgelaufen(e, jetzt));
  await Promise.all(alt.map(e => deleteDoc(doc(db, 'groupInvites', e.code)).catch(() => {})));
  return alle
    .filter(e => e.bis && !abgelaufen(e, jetzt))
    .map(e => ({ ...e, bis: e.bis?.toDate ? e.bis.toDate() : new Date(e.bis) }))
    .sort((a, b) => b.bis - a.bis);
}

export async function beitreten(kennung, uid) {
  const sauber = codeSauber(kennung);
  if (!sauber) throw new Error(String(kennung ?? '').trim() ? 'Das ist kein gültiger Code.' : 'Der Code fehlt.');

  const snap = await getDoc(doc(db, 'groupInvites', sauber));
  if (!snap.exists()) throw new Error('Diesen Code gibt es nicht (mehr).');

  const gid = snap.data().gid;
  if (!gid) throw new Error('Der Code zeigt auf keine Gruppe.');
  /* Die Regel prüft den Ablauf ohnehin; hier nur, damit die Meldung
     sagt, was los ist, statt "keine Berechtigung". Alte Codes ohne
     `bis` lässt die Regel noch bis zum 15. Oktober 2026 zu. */
  if (snap.data().bis && abgelaufen(snap.data())) {
    throw new Error('Diese Einladung ist abgelaufen. Frag nach einem neuen Link.');
  }

  /* Wer schon drin ist, bleibt, wie er ist — ein zweites Schreiben wäre
     für die Regel ein Ändern, und das darf nur der Kopf. */
  try {
    if ((await getDoc(mitgliedRef(gid, uid))).exists()) return gid;
  } catch { /* nicht lesbar heisst: noch nicht drin */ }

  /* Immer als 'mitglied' — wer beitritt, ernennt sich nicht selbst zum
     Trainer. Die Regel besteht ohnehin darauf. Der Code bleibt im
     Dokument: die Regel kann nur prüfen, was geschrieben wird, und
     nebenbei ist damit nachvollziehbar, über welche Einladung jemand
     hereinkam. */
  await writeBatch(db)
    .set(mitgliedRef(gid, uid),
         { uid, rolle: 'mitglied', seit: serverTimestamp(), code: sauber })
    .commit();
  return gid;
}

/* ── Termine ───────────────────────────────────────────────────────
   Training, Lager, Rennen. Was ein Termin IST, steht in termine.js —
   dort ohne Firebase, damit es sich testen lässt. Hier nur das Lesen
   und Schreiben.

   Wer den Kalender führt, führt auch die Termine: die Leitung
   schreibt, alle Mitglieder lesen. Die Regeln erzwingen das; hier
   steht es, damit die Oberfläche gar nicht erst etwas anbietet, das
   scheitern würde. */

export function terminRef(gid, eid) {
  return doc(db, 'groups', gid, 'events', eid);
}

export function beobachteTermine(gid, cb) {
  return onSnapshot(
    collection(db, 'groups', gid, 'events'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    /* Fehlende Regel, fehlender Index, gerade entfernt worden — für die
       Ansicht ist das alles dasselbe: keine Termine. Eine leere Liste
       ist ehrlicher als eine Seite, die nie fertig lädt. */
    () => cb([]),
  );
}

export async function ladeTermine(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'events'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* Leere Felder werden weggelassen statt als '' geschrieben. Die Regel
   erlaubt zwar beides, aber ein Termin mit zeit:'' liest sich später
   wie "es gibt eine Uhrzeit, sie ist bloss leer" — und genau daran
   scheitert dann istMehrtaegig oder die Zusammenfassung. */
function ohneLeere(objekt) {
  return Object.fromEntries(
    Object.entries(objekt).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

export async function terminAnlegen(gid, uid, termin) {
  const ref = doc(collection(db, 'groups', gid, 'events'));
  await writeBatch(db)
    .set(ref, ohneLeere({
      art: termin.art,
      /* Das eigene Wort — nur, wenn es eins gibt; ohneLeere laesst ein
         leeres weg, damit die Regel es nicht pruefen muss. */
      bezeichnung: String(termin.bezeichnung ?? '').trim(),
      titel: String(termin.titel ?? '').trim(),
      von: termin.von,
      bis: termin.bis,
      zeit: termin.zeit,
      ort: termin.ort,
      notiz: termin.notiz,
      disziplin: termin.disziplin,
      startnummer: termin.startnummer,
      /* Was bis v.35.49.0 nur die Reise konnte (programm.js): Ende am
         Tag, das Programm und die Seite, aus der es kommt. */
      bisZeit: termin.bisZeit,
      programm: Array.isArray(termin.programm) && termin.programm.length ? termin.programm : null,
      planHtml: termin.planHtml,
      planUrl: termin.planUrl,
      packliste: Array.isArray(termin.packliste) && termin.packliste.length ? termin.packliste : null,
      abfahrten: termin.abfahrten && Object.keys(termin.abfahrten).length ? termin.abfahrten : null,
      /* Ein Kalender der Gruppe (v.35.60.0) — ohne steht der Termin unter
         seiner Art. */
      kalender: termin.kalender,
      createdBy: uid,
      createdAt: serverTimestamp(),
    }))
    .commit();
  return ref.id;
}

/* 'art' fehlt bewusst: aus einem Rennen ein Training zu machen liesse
   Startnummer und Ergebnis sinnlos daneben stehen. Wer sich vertan
   hat, löscht und legt neu an — dieselbe Überlegung wie bei der
   Gruppenart. Die Regeln lehnen es ohnehin ab.

   Ein leeres Feld wird GELÖSCHT, nicht als '' geschrieben — aus
   demselben Grund wie bei ohneLeere: zeit:'' hiesse "es gibt eine
   Uhrzeit, sie ist bloss leer". */
export const TERMIN_AENDERBAR = Object.freeze([
  'bezeichnung', 'titel', 'von', 'bis', 'zeit', 'bisZeit', 'ort', 'notiz',
  'disziplin', 'startnummer', 'ergebnis', 'programm', 'planHtml', 'planUrl',
  'abfahrten', 'packliste', 'kalender',
]);
export function terminAendern(gid, eid, patch) {
  const daten = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!TERMIN_AENDERBAR.includes(k)) continue;
    const leer = v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)
      || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
    daten[k] = leer ? deleteField() : (typeof v === 'string' ? v.trim() : v);
  }
  if (!Object.keys(daten).length) return Promise.resolve();
  return updateDoc(terminRef(gid, eid), daten);
}

/* Mit dem Termin gehen seine Unterlagen und die Haken der Packliste.
   Firestore löscht Untersammlungen nicht mit — ohne das blieben sie als
   Waisen liegen (die Zusagen bleiben: sie sind klein, und ein
   versehentlich gelöschter Termin verliert so nicht auch noch, wer
   zugesagt hatte). */
export async function terminLoeschen(gid, eid) {
  for (const unter of ['anhaenge', 'gepackt']) {
    const snap = await getDocs(collection(db, 'groups', gid, 'events', eid, unter)).catch(() => null);
    await Promise.all((snap?.docs || []).map(d => deleteDoc(d.ref).catch(() => {})));
  }
  return deleteDoc(terminRef(gid, eid));
}

/* ── Das Programm am Termin (programm.js) ──────────────────────────
   Die Punkte pflegt die Leitung — abgehakt wird ein Programm nicht
   (Michel, v.35.50.0): was vorbei ist, ist vorbei. */

export function programmSetzen(gid, eid, programm) {
  return updateDoc(terminRef(gid, eid), {
    programm: Array.isArray(programm) && programm.length ? programm : deleteField(),
  });
}

/* ── Die Packliste ─────────────────────────────────────────────────
   Die Punkte ("Yogamatte", "Aussen-Turnschuhe") legt die Leitung am
   Termin an (packliste). Abgehakt wird für jede Person einzeln, unter
   ihrer uid — dort stehen auch Punkte, die sie nur für sich dazuschreibt. */

const gepacktRef = (gid, eid, uid) => doc(db, 'groups', gid, 'events', eid, 'gepackt', uid);

export function beobachteGepackt(gid, eid, uid, cb) {
  return onSnapshot(
    gepacktRef(gid, eid, uid),
    snap => cb(snap.exists() ? snap.data() : { uid, erledigt: {}, eigene: [] }),
    () => cb({ uid, erledigt: {}, eigene: [] }),
  );
}

export function gepacktSetzen(gid, eid, uid, { erledigt = {}, eigene = [] } = {}) {
  return setDoc(gepacktRef(gid, eid, uid), {
    uid, erledigt, eigene: eigene.slice(0, 100), am: Date.now(),
  });
}

/** Wie viele schon alles gepackt haben — für die Leitung. */
export async function ladeGepackt(gid, eid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'events', eid, 'gepackt'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ── Gäste ─────────────────────────────────────────────────────────
   Wer den Link hat (guest.html?g=&termin=&token=), legt ein Gastkonto
   an und sieht GENAU diesen Termin: Programm, Seite, einen Chat mit der
   Person, die ihn angelegt hat. Das Token steht am Termin (gastToken);
   die Regel vergleicht es bei jedem Lesen, also zieht ein neues Token
   alle alten Links zurück. Übernommene Reisen tragen das Token der
   Reise weiter — ihre alten Links (guest.html?trip=) gehen weiter. */

export function gastTokenSetzen(gid, eid, token) {
  return updateDoc(terminRef(gid, eid), { gastToken: token });
}

export async function ladeGaeste(eid) {
  const [neu, alt] = await Promise.all([
    getDocs(query(collection(db, 'guestAccess'), where('eid', '==', eid))),
    /* Gäste einer übernommenen Reise: dieselbe Kennung, alte Form. */
    getDocs(query(collection(db, 'guestAccess'), where('tripId', '==', eid))).catch(() => null),
  ]);
  const zugaenge = [...neu.docs, ...(alt?.docs || [])].map(d => ({ docId: d.id, ...d.data() }));
  return Promise.all(zugaenge.map(async z => {
    const p = await getDoc(doc(db, 'guestProfiles', z.uid)).catch(() => null);
    const profil = p?.exists() ? p.data() : {};
    return { ...z, name: profil.name || profil.email || z.uid, lastActiveAt: profil.lastActiveAt || null };
  }));
}

export function gastEntfernen(docId) {
  return deleteDoc(doc(db, 'guestAccess', docId));
}

/* ── Reisen werden Termine (reise-uebernahme.js) ───────────────────
   Die Leitung übernimmt die Reisen ihrer Gruppe, sobald sie Kalender
   oder Gruppe öffnet. Einmal je Sitzung und Reise versucht — scheitert
   es, geht es beim nächsten Öffnen weiter. */

const FS = {
  doc, collection, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp,
};
const inUebernahme = new Set();

export function eineReiseUebernehmen(reise, uid, gruppenart) {
  if (!reise?.id || reise.uebernommen || inUebernahme.has(reise.id)) return Promise.resolve(false);
  inUebernahme.add(reise.id);
  return reiseUebernehmen({ db, fs: FS, reise, uid, gruppenart });
}

export async function reisenDerGruppeUebernehmen(gid, uid, gruppenart) {
  const snap = await getDocs(query(collection(db, 'trips'), where('familyId', '==', gid)));
  let n = 0;
  for (const d of snap.docs) {
    if (await eineReiseUebernehmen({ id: d.id, ...d.data() }, uid, gruppenart)) n += 1;
  }
  return n;
}

/* ── Kalender-Abo ──────────────────────────────────────────────────
   Eine Adresse, die den Gruppenkalender als iCalendar ausliefert.
   Eltern abonnieren sie in Apple Calendar, OHNE ein Konto bei Firn zu
   haben — kein Mail, kein Passwort, keine Installation.

   Das Token ist ein EIGENES, nicht der Beitrittscode: wer den Kalender
   liest, soll nicht beitreten können. Zwei Dinge, zwei Codes. Der Kopf
   kann eines neu setzen, ohne das andere zu berühren.

   Neu setzen heisst gleichzeitig zurückziehen: die alte Adresse trägt
   danach ins Leere. Das ist der Weg, wenn jemand den Verein verlässt
   und den Kalender nicht mehr sehen soll. */

export function abonnementAdresse(basis, gid, token) {
  if (!basis || !token) return '';
  return `${String(basis).replace(/\/+$/, '')}/ics/${encodeURIComponent(gid)}?t=${encodeURIComponent(token)}`;
}

/** Erzeugt ein neues Abo-Token und gibt es zurück. */
export async function abonnementErneuern(gid) {
  const token = code();
  await updateDoc(gruppeRef(gid), { icsToken: token });
  return token;
}

/* ── Trainingspläne ────────────────────────────────────────────────
   'fuer' ist das Feld, um das es geht: 'alle' für den ganzen Kader
   oder die uid eines Athleten. Damit gibt ein Trainer sechs Athleten
   sechs verschiedene Pläne, ohne sechs Gruppen anzulegen — genau das
   ging im alten Modell nicht.

   'json' ist dasselbe Format wie users/{uid}/trainingPrograms, also
   liest der vorhandene Parser einen Gruppenplan unverändert. */

export const PLAN_FUER_ALLE = 'alle';

export function planRef(gid, planId) {
  return doc(db, 'groups', gid, 'plaene', planId);
}

/**
 * Die Pläne, die mich etwas angehen.
 *
 * Der Filter ist nicht bloss Höflichkeit: die Regel prüft jedes
 * Ergebnisdokument einzeln, und eine Abfrage, die einen fremden Plan
 * zurückgäbe, fällt vollständig. Die Leitung darf alles sehen und
 * fragt deshalb ungefiltert.
 */
export async function ladePlaene(gid, uid, alsLeitung = false) {
  const sammlung = collection(db, 'groups', gid, 'plaene');
  const abfrage = alsLeitung
    ? sammlung
    : query(sammlung, where('fuer', 'in', [PLAN_FUER_ALLE, uid]));
  const snap = await getDocs(abfrage);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* Ein Plan, direkt gelesen — für den Player. Dieselbe Regel wie beim
   Auflisten greift auch hier (allow get, list): ein Athlet bekommt nur,
   was für alle oder für ihn bestimmt ist, die Leitung alles in ihrer
   Gruppe. Bis v.35.40.0 holte der Player den Plan über die Abfrage
   eines Athleten — auch für die Leitung, die den Plan eines Athleten
   öffnete und ihn darum nie fand. */
export async function ladePlan(gid, planId) {
  const snap = await getDoc(planRef(gid, planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function planVeroeffentlichen(gid, uid, { titel, json, fuer, notiz } = {}) {
  const sauber = String(titel ?? '').trim();
  if (!sauber) throw new Error('Der Plan braucht einen Titel.');
  if (typeof json !== 'string' || !json) throw new Error('Der Plan ist leer.');
  /* Dieselbe Grenze wie in den Regeln — ein
     Dokument darf 1 MiB, wir bleiben darunter. */
  if (json.length > 900000) throw new Error('Der Plan ist zu gross.');

  const ref = doc(collection(db, 'groups', gid, 'plaene'));
  await writeBatch(db)
    .set(ref, ohneLeere({
      titel: sauber,
      json,
      fuer: fuer || PLAN_FUER_ALLE,
      notiz,
      erstelltVon: uid,
      erstelltAm: serverTimestamp(),
    }))
    .commit();
  return ref.id;
}

export function planLoeschen(gid, planId) {
  return deleteDoc(planRef(gid, planId));
}

/* Die eigenen eingelesenen Wochenprogramme — die Quelle, aus der ein
   Trainer einen Gruppenplan veröffentlicht. Sie liegen weiterhin unter
   users/{uid} und bleiben privat; veröffentlicht wird eine Kopie.

   Das ist Absicht: ein Trainer probiert an seinem eigenen Programm
   herum, und der Kader soll davon erst etwas sehen, wenn er es
   bewusst herausgibt. */
export async function eigeneProgramme(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'trainingPrograms'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ── Trainingsprotokoll ────────────────────────────────────────────
   Was ein Athlet an einem Tag tatsächlich gemacht hat.

   Es liegt an der Gruppe und nicht unter users/{uid}/trainingLogs,
   weil ein Trainer sehen muss, ob der Plan gemacht wurde — und ein
   owner-only Dokument gibt das nicht her. Das Persönliche bleibt
   persönlich: trainingLogs ist unberührt und trägt weiterhin das
   eigene Training. Hier steht nur, was zu einem Plan DIESER Gruppe
   gehört.

   Geschrieben wird nur das eigene. Ein Trainer, der einträgt, was ein
   Athlet geschafft habe, macht aus einem Protokoll eine Behauptung. */

export function protokollId(uid, datum) {
  return `${uid}__${datum}`;
}

export function protokollRef(gid, uid, datum) {
  return doc(db, 'groups', gid, 'protokoll', protokollId(uid, datum));
}

export async function ladeProtokoll(gid, uid, datum) {
  const snap = await getDoc(protokollRef(gid, uid, datum));
  return snap.exists() ? snap.data() : { uid, datum, units: {} };
}

/** Alle Tage eines Athleten — für die Trainerübersicht. */
export async function ladeProtokolle(gid, uid) {
  const snap = await getDocs(
    query(collection(db, 'groups', gid, 'protokoll'), where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* Je Übung, nicht das ganze Dokument (v.35.64.0, siehe einheit.js
   "Zwischen Geräten"). Bis dahin schrieb protokollSpeichern mit set()
   den ganzen Tag — ein zweites Gerät mit altem Stand löschte, was das
   erste eingetragen hatte. Die Transaktion liest den Stand des Servers
   und schreibt nur, was dort nicht neuer ist. Offline scheitert sie; das
   Eingetragene bleibt dann im Gerät (protokoll-sicherung.js) und geht
   hinaus, sobald wieder Netz ist. */
export function protokollAbgleichen(gid, uid, datum, aenderungen, planId = '') {
  const ref = protokollRef(gid, uid, datum);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const server = snap.exists() ? snap.data() : null;
    const { units, geschrieben, verworfen } = aenderungenPruefen(server, aenderungen);
    if (geschrieben.length) {
      const daten = {};
      for (const [unitId, u] of Object.entries(units)) {
        daten[unitId] = { ...(planId ? { plan: planId } : {}), items: u.items };
      }
      tx.set(ref, { uid, datum, units: daten, updatedAt: serverTimestamp() }, { merge: true });
    }
    return { server, geschrieben, verworfen };
  });
}

/* Die Protokolle eines Tages — für die Übersicht der Leitung (v.35.65.0).
   Die Regel lässt die Leitung alle auflisten (leadsGroup); ein Athlet
   bekäme mit dieser Abfrage nichts und fragt sie nie. Live, damit die
   Leitung am Rand der Halle sieht, wie weit alle sind. */
export function beobachteProtokolleAm(gid, datum, cb, fehler) {
  return onSnapshot(query(collection(db, 'groups', gid, 'protokoll'), where('datum', '==', datum)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), fehler);
}

/* ── Vorlagen (v.35.65.0) ───────────────────────────────────────────
   Ein Wochenplan, den die Leitung wiederverwendet. Vorlage, Zuweisung
   (plaene) und Trainiertes (protokoll) sind drei Dinge: ein Plan aus
   einer Vorlage ist eine KOPIE — ändert sich die Vorlage, bleibt jeder
   Plan und jedes Protokoll, wie es war. Nur die Leitung (Regel). */
export async function ladeVorlagen(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'vorlagen'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.titel || '').localeCompare(String(b.titel || ''), 'de'));
}

export async function vorlageSpeichern(gid, uid, { titel, json }) {
  const ref = await addDoc(collection(db, 'groups', gid, 'vorlagen'), {
    titel: String(titel || '').slice(0, 120), json, erstelltVon: uid, erstelltAm: serverTimestamp(),
  });
  return ref.id;
}

export function vorlageLoeschen(gid, id) {
  return deleteDoc(doc(db, 'groups', gid, 'vorlagen', id));
}

/* Live: was ein anderes Gerät einträgt, erscheint hier (v.35.64.0). */
export function beobachteProtokoll(gid, uid, datum, cb, fehler) {
  return onSnapshot(protokollRef(gid, uid, datum), { includeMetadataChanges: true },
    snap => cb({ daten: snap.exists() ? snap.data() : null, ausSpeicher: snap.metadata.fromCache }),
    fehler);
}

/* Private Notizen (v.35.64.0). Michel: "Private Notizen bleiben privat."
   Das Protokoll der Gruppe liest die Leitung — eine Notiz dort sieht
   sie. Was nur für einen selbst ist, liegt unter
   users/{uid}/trainingLogs/{datum} (nur die Person, Regel seit jeher,
   schema 1), je Gruppe und Einheit: units["gid~unitId"].items[key].privat. */
const privatRef = (uid, datum) => doc(db, 'users', uid, 'trainingLogs', datum);
export const privatEinheit = (gid, unitId) => `${gid}~${unitId}`;

export async function ladePrivat(uid, datum) {
  const snap = await getDoc(privatRef(uid, datum));
  return snap.exists() ? (snap.data().units || {}) : {};
}

export function privatSetzen(uid, datum, gid, unitId, key, text) {
  return setDoc(privatRef(uid, datum), {
    schema: 1,
    units: { [privatEinheit(gid, unitId)]: { items: { [key]: { privat: String(text || '').slice(0, 500) } } } },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* ── Rennergebnisse ────────────────────────────────────────────────
   Eines pro Athlet und Rennen. Die zusammengesetzte Dokument-ID
   verhindert Dubletten, ohne dass jemand danach suchen müsste — wie
   bei shares/{owner__target__module}.

   Gespeichert werden Zeiten, nicht Punkte. Die Punkte rechnet
   fispunkte.js aus Zeit, Siegerzeit und Disziplin; stünden sie hier,
   wären sie falsch, sobald die FIS einen Faktor ändert. */

export function ergebnisId(eventId, uid) {
  return `${eventId}__${uid}`;
}

export function ergebnisRef(gid, eventId, uid) {
  return doc(db, 'groups', gid, 'ergebnisse', ergebnisId(eventId, uid));
}

/** Alle Ergebnisse einer Gruppe, oder die eines einzelnen Athleten. */
export async function ladeErgebnisse(gid, uid = null) {
  const sammlung = collection(db, 'groups', gid, 'ergebnisse');
  const abfrage = uid ? query(sammlung, where('uid', '==', uid)) : sammlung;
  const snap = await getDocs(abfrage);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function ergebnisSpeichern(gid, ergebnis, erfasstVon) {
  const { eventId, uid } = ergebnis;
  if (!eventId || !uid) throw new Error('Ergebnis ohne Rennen oder Athlet.');

  return writeBatch(db)
    .set(ergebnisRef(gid, eventId, uid), ohneLeere({
      uid,
      eventId,
      rang: ergebnis.rang,
      zeit: ergebnis.zeit,
      siegerZeit: ergebnis.siegerZeit,
      zuschlag: ergebnis.zuschlag,
      notiz: ergebnis.notiz,
      erfasstVon,
      erfasstAm: serverTimestamp(),
    }))
    .commit();
}

export function ergebnisLoeschen(gid, eventId, uid) {
  return deleteDoc(ergebnisRef(gid, eventId, uid));
}

/* ── Absagen ───────────────────────────────────────────────────────
   Nicht löschen. Wer ein Rennen löscht, das zwölf Leute im Kalender
   haben, hinterlässt zwölf Menschen, die am Samstag an den Lift
   fahren. Der Termin bleibt stehen, sichtbar abgesagt, mit Grund. */

export function terminAbsagen(gid, eid, grund = '') {
  return updateDoc(terminRef(gid, eid), {
    abgesagt: true,
    absageGrund: String(grund ?? '').trim().slice(0, 200),
  });
}

export function absageZuruecknehmen(gid, eid) {
  /* Der Grund wird mitgelöscht: ein alter Absagegrund an einem wieder
     stattfindenden Rennen wäre schlimmer als keiner. */
  return updateDoc(terminRef(gid, eid), { abgesagt: false, absageGrund: '' });
}

/* ── Anhänge am Termin ─────────────────────────────────────────────
   Bei einem Lager oder Rennen kommt die Ausschreibung als PDF, und sie
   gehört an den Termin — nicht in eine Mail, die drei Wochen später
   niemand mehr findet.

   Die Datei liegt als Data-URL im Dokument, wie bei den Reisen. Das
   ist der Weg ohne Cloud Storage, den Spark zulässt. */

/* Firestore erlaubt 1 MiB pro Dokument. Die Grenze gilt für die
   CODIERTE Zeichenkette — Base64 bläht um etwa ein Drittel auf, also
   passen rund 700 KB echtes PDF hinein. */
export const ANHANG_MAX = 950000;

export function anhangRef(gid, eid, id) {
  return doc(db, 'groups', gid, 'events', eid, 'anhaenge', id);
}

export async function ladeAnhaenge(gid, eid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'events', eid, 'anhaenge'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Eine Datei als Data-URL lesen. Wirft, wenn sie zu gross ist. */
export function alsDataUrl(datei) {
  return new Promise((fertig, scheitert) => {
    const leser = new FileReader();
    leser.onerror = () => scheitert(new Error('Die Datei liess sich nicht lesen.'));
    leser.onload = () => {
      const url = String(leser.result || '');
      if (url.length > ANHANG_MAX) {
        /* Die Grenze steht in der Regel und hier. Sie erst beim
           Schreiben zu erfahren hiesse, den Nutzer eine Minute warten
           zu lassen und dann abzulehnen. */
        scheitert(new Error('Die Datei ist zu gross — rund 700 KB sind das Maximum.'));
        return;
      }
      fertig({ url, laenge: url.length });
    };
    leser.readAsDataURL(datei);
  });
}

/* Ein Foto vom Handy hat drei, vier Megabyte — verkleinert passt es.
   Die Reise tat das schon (fileToStored im Kalender); seit Termine und
   Reisen eins sind (v.35.50.0), laden auch Mitglieder Bilder an einen
   Termin, und die sollen nicht an der Grenze scheitern. */
function bildAlsDataUrl(datei) {
  return new Promise(fertig => {
    const bild = new Image();
    const adresse = URL.createObjectURL(datei);
    bild.onload = () => {
      URL.revokeObjectURL(adresse);
      const zeichne = (kante, guete) => {
        const faktor = Math.min(1, kante / Math.max(bild.width, bild.height));
        const leinwand = document.createElement('canvas');
        leinwand.width = Math.round(bild.width * faktor);
        leinwand.height = Math.round(bild.height * faktor);
        leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);
        try { return leinwand.toDataURL('image/jpeg', guete); } catch { return ''; }
      };
      for (const [kante, guete] of [[1600, 0.82], [1400, 0.7], [1200, 0.6], [1000, 0.5]]) {
        const url = zeichne(kante, guete);
        if (url && url.length <= ANHANG_MAX) { fertig({ url, laenge: url.length }); return; }
      }
      fertig(null);
    };
    bild.onerror = () => { URL.revokeObjectURL(adresse); fertig(null); };
    bild.src = adresse;
  });
}

export async function anhangSpeichern(gid, eid, uid, datei, id = null) {
  const bild = String(datei?.type || '').startsWith('image/') && (datei.size || 0) > ANHANG_MAX * 0.7
    ? await bildAlsDataUrl(datei) : null;
  const { url, laenge } = bild || await alsDataUrl(datei);
  const ref = id
    ? anhangRef(gid, eid, id)
    : doc(collection(db, 'groups', gid, 'events', eid, 'anhaenge'));

  await writeBatch(db)
    .set(ref, {
      name: String(datei.name || 'Ausschreibung').slice(0, 200),
      type: bild ? 'image/jpeg' : (datei.type || 'application/pdf'),
      size: laenge,
      dataUrl: url,
      by: uid,
      at: Date.now(),
    })
    .commit();
  return ref.id;
}

/** Nur umbenennen — die Datei bleibt, wie sie ist. */
export async function anhangUmbenennen(gid, eid, id, name, uid) {
  const snap = await getDoc(anhangRef(gid, eid, id));
  if (!snap.exists()) throw new Error('Diesen Anhang gibt es nicht mehr.');
  const alt = snap.data();

  /* Die Regel verlangt das ganze Dokument mit allen Pflichtfeldern und
     by == eigene uid. Ein updateDoc mit nur dem Namen wuerde daran
     scheitern — also wird das Dokument vollstaendig neu geschrieben. */
  return writeBatch(db)
    .set(anhangRef(gid, eid, id), {
      ...alt,
      name: String(name ?? '').trim().slice(0, 200) || alt.name,
      by: uid,
      at: Date.now(),
    })
    .commit();
}

export function anhangLoeschen(gid, eid, id) {
  return deleteDoc(anhangRef(gid, eid, id));
}

/** Eine Data-URL wieder zu einem Blob, zum Öffnen oder Herunterladen. */
export function alsBlob(dataUrl) {
  const [kopf, teil] = String(dataUrl ?? '').split(',');
  if (!teil) return null;
  const typ = (kopf.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const binaer = atob(teil);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return new Blob([bytes], { type: typ });
}

/* ── Zusagen ───────────────────────────────────────────────────────
   Die Dokument-ID ist die uid. Dadurch kann niemand für jemand anderen
   zusagen, ohne dass die Regel es eigens verbieten müsste. */

export const ANTWORTEN = Object.freeze(['ja', 'nein', 'vielleicht']);

export function zusagen(gid, eid, uid, antwort) {
  if (!ANTWORTEN.includes(antwort)) throw new Error('Unbekannte Antwort.');
  return writeBatch(db)
    .set(doc(db, 'groups', gid, 'events', eid, 'zusagen', uid),
         { uid, antwort, am: serverTimestamp() })
    .commit();
}

export async function ladeZusagen(gid, eid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'events', eid, 'zusagen'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
