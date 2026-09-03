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

import { db } from './firebase-config.js';
import {
  collection, collectionGroup, doc, getDoc, getDocs, query, where,
  onSnapshot, writeBatch, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ── Rollen ────────────────────────────────────────────────────────
   Dieselben drei in beiden Gruppenarten. Nur die Wörter wechseln. */

export const ROLLEN = Object.freeze(['head', 'staff', 'mitglied']);

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
  },
  familie: {
    head:     { key: 'grp.familie.head',     de: 'Verwaltet die Gruppe' },
    staff:    { key: 'grp.familie.staff',    de: 'Verwaltung' },
    mitglied: { key: 'grp.familie.mitglied', de: 'Mitglied' },
    mitglieder: { key: 'grp.familie.mitglieder', de: 'Mitglieder' },
  },
};

export function wort(art, was) {
  const eintrag = (WORTE[art] || WORTE.familie)[was];
  if (!eintrag) return '';
  return window.TVZAI18n?.t(eintrag.key) ?? eintrag.de;
}

/* ── Bereiche ──────────────────────────────────────────────────────
   Was eine neue Gruppe eingeschaltet mitbringt. Der Kern ist überall
   an; alles andere ist die Entscheidung der Gruppe. Eine Familie, die
   kein Training macht, soll davon nichts sehen — und ein Kader nichts
   vom Essen. */

export const VORGABE_BEREICHE = Object.freeze({
  kader:   { termine: true, training: true, video: false, chat: true },
  familie: { termine: true, projekte: true, chat: true },
});

/* ── Lesen ─────────────────────────────────────────────────────────*/

export function gruppeRef(gid) { return doc(db, 'groups', gid); }
export function mitgliedRef(gid, uid) { return doc(db, 'groups', gid, 'members', uid); }

export async function ladeGruppe(gid) {
  const snap = await getDoc(gruppeRef(gid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Namen stehen nicht am Mitgliedsdokument, sondern im Profil. Sie dort
   zu spiegeln hiesse, sie bei jeder Namensänderung in jeder Gruppe
   nachziehen zu müssen — und irgendwann stünde in einer Gruppe ein
   Name, den es nicht mehr gibt.

   Die Regeln erlauben jedem Mitglied, ein Profil zu lesen
   (allow get: … || isMember()), also wird hier nachgeschlagen. Ein
   Kader hat acht bis zwanzig Leute; das ist ein Lesezugriff pro Person
   und einmal pro Aufruf, nicht pro Bildaufbau.

   Der Zwischenspeicher gilt für die Lebensdauer der Seite. Ein Name,
   der sich währenddessen ändert, ist beim nächsten Öffnen richtig —
   das ist der Preis dafür, nicht bei jedem Neuzeichnen zu lesen. */
const namensSpeicher = new Map();

async function nameVon(uid) {
  if (namensSpeicher.has(uid)) return namensSpeicher.get(uid);
  let name = '';
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      name = String(d.displayName || d.name || '').trim();
    }
  } catch { /* fremdes Profil nicht lesbar — dann eben ohne Namen */ }
  namensSpeicher.set(uid, name);
  return name;
}

export async function ladeMitglieder(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'members'));
  const roh = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return Promise.all(roh.map(async m => ({ ...m, name: await nameVon(m.uid) })));
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
async function zuGruppen(mitgliedschaften) {
  const gruppen = await Promise.all(mitgliedschaften.map(async m => {
    try {
      const g = await ladeGruppe(m.gid);
      return g ? { ...g, meineRolle: m.rolle } : null;
    } catch { return null; }
  }));
  return gruppen.filter(Boolean).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'de'));
}

export async function meineGruppen(uid) {
  const snap = await getDocs(eigeneMitgliedschaften(uid));
  return zuGruppen(snap.docs.map(d => ({
    gid: d.ref.parent.parent.id, rolle: d.data().rolle || '',
  })));
}

export function beobachteMeineGruppen(uid, cb) {
  return onSnapshot(eigeneMitgliedschaften(uid), async snap => {
    cb(await zuGruppen(snap.docs.map(d => ({
      gid: d.ref.parent.parent.id, rolle: d.data().rolle || '',
    }))));
  }, () => cb([]));
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
  if (art !== 'familie' && art !== 'kader') throw new Error('Unbekannte Gruppenart.');

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

export function gruppeAendern(gid, patch) {
  const erlaubt = ['name', 'farbe', 'bereiche', 'inviteToken'];
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

export function mitgliedEntfernen(gid, uid) {
  return deleteDoc(mitgliedRef(gid, uid));
}

/* Der Kopf geht nicht einfach — sonst bliebe eine Gruppe zurück, die
   niemand mehr verwalten kann. Er übergibt zuerst. */
export function gruppeVerlassen(gid, uid) {
  return deleteDoc(mitgliedRef(gid, uid));
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
  try { localStorage.setItem(SCHLUESSEL, gid || ''); }
  catch { /* privater Modus — dann eben jedes Mal die erste Gruppe */ }
}

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
   bleibt drin. */

export async function einladungErzeugen(gid, uid) {
  const kennung = code();
  await writeBatch(db)
    .set(doc(db, 'groupInvites', kennung),
         { gid, createdBy: uid, createdAt: serverTimestamp() })
    .commit();
  return kennung;
}

export function einladungZuruecknehmen(kennung) {
  return deleteDoc(doc(db, 'groupInvites', kennung));
}

export async function beitreten(kennung, uid) {
  const sauber = String(kennung ?? '').trim().toLowerCase();
  if (!sauber) throw new Error('Der Code fehlt.');

  const snap = await getDoc(doc(db, 'groupInvites', sauber));
  if (!snap.exists()) throw new Error('Diesen Code gibt es nicht (mehr).');

  const gid = snap.data().gid;
  if (!gid) throw new Error('Der Code zeigt auf keine Gruppe.');

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
      titel: String(termin.titel ?? '').trim(),
      von: termin.von,
      bis: termin.bis,
      zeit: termin.zeit,
      ort: termin.ort,
      notiz: termin.notiz,
      disziplin: termin.disziplin,
      startnummer: termin.startnummer,
      createdBy: uid,
      createdAt: serverTimestamp(),
    }))
    .commit();
  return ref.id;
}

/* 'art' fehlt bewusst: aus einem Rennen ein Training zu machen liesse
   Startnummer und Ergebnis sinnlos daneben stehen. Wer sich vertan
   hat, löscht und legt neu an — dieselbe Überlegung wie bei der
   Gruppenart. Die Regeln lehnen es ohnehin ab. */
export function terminAendern(gid, eid, patch) {
  const erlaubt = ['titel', 'von', 'bis', 'zeit', 'ort', 'notiz',
                   'disziplin', 'startnummer', 'ergebnis'];
  const daten = Object.fromEntries(
    Object.entries(patch).filter(([k]) => erlaubt.includes(k)));
  if (!Object.keys(daten).length) return Promise.resolve();
  return updateDoc(terminRef(gid, eid), daten);
}

export function terminLoeschen(gid, eid) {
  return deleteDoc(terminRef(gid, eid));
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

export async function planVeroeffentlichen(gid, uid, { titel, json, fuer, notiz } = {}) {
  const sauber = String(titel ?? '').trim();
  if (!sauber) throw new Error('Der Plan braucht einen Titel.');
  if (typeof json !== 'string' || !json) throw new Error('Der Plan ist leer.');
  /* Dieselbe Grenze wie in den Regeln und in training-sync.js — ein
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
