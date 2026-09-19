/* ══════════════════════════════════════════════════════════════════
   Essen in einer Gruppe — der Zugriff auf Firestore.

   Das Modell steht in essen-modell.js; hier steht nur, wie es auf die
   Platte kommt. Zwei Sammlungen, beide unter der Gruppe:

       groups/{gid}/essen/{uid}__{datum}
       groups/{gid}/essenFreigabe/{uid}

   Nichts davon liegt unter foodlog/{uid} — der persönliche Ordner
   bleibt persönlich, und die Leitung hat auf ihn keinen Weg. Wer in
   einer Gruppe erfasst, hat damit KEINEN Eintrag in seinem privaten
   Tracker, und umgekehrt wird kein alter privater Eintrag je zu einem
   geteilten. Das ist Absicht: "geteilt" soll man tun, nicht aus
   Versehen gewesen sein.
   ══════════════════════════════════════════════════════════════════ */

import { db, reportClientError } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, query, where, onSnapshot,
  setDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  tagId, tagPayload, EINWILLIGUNG, ISO_TAG, TAGE_MAX, zeitraumTage,
} from './essen-modell.js';

const essenColl = gid => collection(db, 'groups', gid, 'essen');
const freigabeColl = gid => collection(db, 'groups', gid, 'essenFreigabe');

export const essenRef = (gid, uid, datum) => doc(db, 'groups', gid, 'essen', tagId(uid, datum));
export const freigabeRef = (gid, uid) => doc(db, 'groups', gid, 'essenFreigabe', uid);

/* ── Die Freigabe ──────────────────────────────────────────────────
   Ein Dokument, das nur zwei Dinge sagt: teilt diese Person mit der
   Leitung, und auf welchen Text hat sie sich eingelassen. Mehr steht
   nicht darin — kein Name, keine Adresse; wer die Gruppe liest, weiss
   ohnehin, wer darin ist. */

export async function freigabeSetzen(gid, uid, an) {
  await setDoc(freigabeRef(gid, uid), {
    uid,
    an: !!an,
    fassung: an ? EINWILLIGUNG : 0,
    seit: serverTimestamp(),
  });
}

export async function ladeFreigabe(gid, uid) {
  try {
    const snap = await getDoc(freigabeRef(gid, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { reportClientError('essen/freigabe', e); return null; }
}

/** Alle Freigaben der Gruppe — nur die Leitung darf auflisten. */
export async function ladeFreigaben(gid) {
  try {
    const qs = await getDocs(freigabeColl(gid));
    const raus = {};
    for (const d of qs.docs) raus[d.id] = d.data()?.an === true;
    return raus;
  } catch (e) { reportClientError('essen/freigaben', e); return null; }
}

/** Live — damit die Athletin auf zwei Geräten denselben Schalter sieht. */
export function beobachteFreigabe(gid, uid, cb, fehler) {
  return onSnapshot(freigabeRef(gid, uid),
    snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    e => { reportClientError('essen/freigabe-strom', e); fehler?.(e); });
}

/* ── Ein Tag ───────────────────────────────────────────────────────*/

/**
 * Den Tag schreiben, wie er jetzt ist.
 *
 * Ein set() über das ganze Dokument und nicht ein Abgleich je Mahlzeit
 * wie beim Trainingsprotokoll (Falle 26): dort tragen zwei Geräte
 * gleichzeitig in DASSELBE Training ein, hier isst ein Mensch. Wer
 * seine Mahlzeiten am Handy erfasst, tut es nicht gleichzeitig am
 * Laptop. `stand` steht trotzdem im Dokument, damit man beim nächsten
 * Mal sieht, welcher Schreibvorgang der jüngere war.
 */
export async function tagSchreiben(gid, uid, datum, mahlzeiten, finde) {
  const daten = tagPayload(uid, datum, mahlzeiten, finde);
  await setDoc(essenRef(gid, uid, datum), { ...daten, aktualisiert: serverTimestamp() });
  return daten;
}

/** Den Tag wegnehmen — die letzte Mahlzeit gelöscht heisst kein Tag. */
export async function tagLoeschen(gid, uid, datum) {
  await deleteDoc(essenRef(gid, uid, datum));
}

export async function ladeTag(gid, uid, datum) {
  try {
    const snap = await getDoc(essenRef(gid, uid, datum));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { reportClientError('essen/tag', e); return null; }
}

export function beobachteTag(gid, uid, datum, cb, fehler) {
  return onSnapshot(essenRef(gid, uid, datum),
    snap => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    e => { reportClientError('essen/tag-strom', e); fehler?.(e); });
}

/* ── Ein Zeitraum ──────────────────────────────────────────────────
   Für die Leitung: alle Tage der Gruppe zwischen zwei Daten. Der
   Filter steht auf `datum`, einem einzelnen Feld — damit braucht die
   Abfrage keinen zusammengesetzten Index.

   Ein Athlet ruft dieselbe Funktion mit nurUid=seiner uid: dann
   filtert die Abfrage zusätzlich auf uid, und genau das verlangt die
   Regel von ihm. Ohne diesen Filter lehnt Firestore die GANZE Abfrage
   ab — Regeln sind keine Filter. */
export async function ladeZeitraum(gid, von, bis, { nurUid = '' } = {}) {
  if (!ISO_TAG.test(String(von)) || !ISO_TAG.test(String(bis))) return [];
  const bedingungen = [where('datum', '>=', von), where('datum', '<=', bis)];
  if (nurUid) bedingungen.unshift(where('uid', '==', nurUid));
  try {
    const qs = await getDocs(query(essenColl(gid), ...bedingungen));
    return qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { reportClientError('essen/zeitraum', e); throw e; }
}

/** Dasselbe live — die Trainerin sieht das Mittagessen, während es entsteht. */
export function beobachteZeitraum(gid, von, bis, cb, fehler, { nurUid = '' } = {}) {
  const bedingungen = [where('datum', '>=', von), where('datum', '<=', bis)];
  if (nurUid) bedingungen.unshift(where('uid', '==', nurUid));
  return onSnapshot(query(essenColl(gid), ...bedingungen),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    e => { reportClientError('essen/zeitraum-strom', e); fehler?.(e); });
}

/* ── Zurücknehmen ──────────────────────────────────────────────────
   "Nicht mehr teilen" ist zweierlei, und beides muss es geben:

     · künftig nicht mehr — die Freigabe aus, nichts wird mehr
       geschrieben. Was schon da ist, bleibt.
     · auch rückwirkend — der Verlauf in DIESER Gruppe wird gelöscht.

   Das Zweite ist kein Aufräumen, sondern der Widerruf: was die
   Leitung einmal gesehen hat, kann man nicht ungesehen machen, aber
   die Daten selbst nimmt man zurück. Darum steht es als eigener
   Knopf und passiert nicht nebenbei beim Umlegen des Schalters.

   Gelöscht wird in Stapeln zu 400: ein Kader mit einem Jahr Verlauf
   hat mehr Tage, als ein writeBatch verträgt (500). */
export async function verlaufLoeschen(gid, uid) {
  let weg = 0;
  const qs = await getDocs(query(essenColl(gid), where('uid', '==', uid)));
  const docs = qs.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const stapel = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) stapel.delete(d.ref);
    await stapel.commit();
    weg += Math.min(400, docs.length - i);
  }
  return weg;
}

/* ── Ein Lebensmittel vorschlagen ──────────────────────────────────
   Was die Tabelle nicht kennt, schlägt man vor; der Admin gibt es
   frei, und dann steht es allen zur Verfügung (customFoods). Das gab
   es im Food Tracker schon — hier, damit die Gruppe denselben Weg
   nimmt und nicht einen zweiten.

   foodRequests trägt die eigene Adresse, weil die Regel genau das
   verlangt: schreiben darf man nur einen Vorschlag, der von einem
   selbst kommt. */
export async function lebensmittelVorschlagen({ name, notiz = '', barcode = '', marke = '', uid, email } = {}) {
  const sauber = String(name || '').trim();
  if (!sauber || !uid) throw new Error('essen: Vorschlag braucht Name und Konto');
  await setDoc(doc(collection(db, 'foodRequests')), {
    name: sauber.slice(0, 120),
    note: String(notiz || (marke ? `Marke: ${marke}` : '')).slice(0, 200),
    barcode: String(barcode || '').slice(0, 40),
    brand: String(marke || '').slice(0, 80),
    requestedByUid: uid,
    requestedByEmail: String(email || '').toLowerCase(),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

/* Die eigenen Tage — für "was habe ich in dieser Gruppe geteilt?".
   Begrenzt auf TAGE_MAX, damit die Antwort eine Seite bleibt. */
export async function eigeneTage(gid, uid, von, bis) {
  const tage = zeitraumTage(von, bis);
  if (!tage.length) return [];
  return ladeZeitraum(gid, tage[0], tage[tage.length - 1], { nurUid: uid });
}

export { TAGE_MAX };
