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

export async function ladeMitglieder(gid) {
  const snap = await getDocs(collection(db, 'groups', gid, 'members'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
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
