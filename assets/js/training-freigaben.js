/* ══════════════════════════════════════════════════════════════════
   Training teilen — der Zugriff auf Firestore.

   Das Modell steht in training-teilen.js. Hier steht nur, wie ein
   Auszug hinaus- und wieder hereinkommt:

       trainingShares/{code}   ein Auszug, ein Link, ein Ablauf

   Eine Sammlung, keine Untersammlung: sie gehört WEDER der Gruppe
   NOCH hängt sie an ihr. Genau das ist der Punkt — die Leitung soll
   nicht einmal sehen können, DASS geteilt wird.
   ══════════════════════════════════════════════════════════════════ */

import { db, reportClientError } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy,
  setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  neuerCode, codeGueltig, ablaufAb, umfangSauber, auszugText,
  LABEL_MAX, GUELTIG_TAGE,
} from './training-teilen.js';

const freigabenColl = () => collection(db, 'trainingShares');
export const freigabeRef = code => doc(db, 'trainingShares', code);

/**
 * Eine neue Freigabe anlegen.
 *
 * Der Code entsteht im Browser und nicht auf dem Server — es gibt
 * keinen. Er ist damit genauso gut wie der Zufall des Geräts, und
 * neuerCode() nimmt nur Web Crypto; ohne die wird gar nichts angelegt.
 */
export async function freigabeAnlegen(uid, { label, umfang, daten, tage = GUELTIG_TAGE } = {}) {
  const code = neuerCode();
  const bis = Timestamp.fromDate(ablaufAb(tage));
  const dokument = {
    ownerUid: uid,
    label: String(label || '').trim().slice(0, LABEL_MAX),
    umfang: umfangSauber(umfang),
    daten: auszugText(daten),
    bis,
    erstellt: serverTimestamp(),
    stand: Date.now(),
  };
  await setDoc(freigabeRef(code), dokument);
  /* Was zurückkommt, ist das, was die Liste sofort zeichnet.
     serverTimestamp() ist dort nur ein Platzhalter — ohne diese zwei
     Zeilen stünde an der frischen Karte "Erstellt:" und dahinter
     nichts, bis jemand die Seite neu lädt. */
  return { code, ...dokument, bis: bis.toDate(), erstellt: new Date() };
}

/** Den Auszug auffrischen — der Link bleibt, der Inhalt wird neu. */
export async function freigabeAuffrischen(code, { daten, umfang } = {}) {
  if (!codeGueltig(code)) throw new Error('teilen: ungültiger Code');
  const patch = { daten: auszugText(daten), stand: Date.now() };
  if (umfang) patch.umfang = umfangSauber(umfang);
  await updateDoc(freigabeRef(code), patch);
}

/** Verlängern — dieselbe Frist noch einmal, vom heutigen Tag an. */
export async function freigabeVerlaengern(code, tage = GUELTIG_TAGE) {
  await updateDoc(freigabeRef(code), { bis: Timestamp.fromDate(ablaufAb(tage)) });
}

/** Zurückziehen heisst löschen: der Link ist im selben Augenblick tot. */
export async function freigabeZurueckziehen(code) {
  await deleteDoc(freigabeRef(code));
}

/** Die eigenen Freigaben. Die Abfrage filtert auf ownerUid — die Regel verlangt es. */
export async function meineFreigaben(uid) {
  try {
    const qs = await getDocs(query(freigabenColl(), where('ownerUid', '==', uid), orderBy('erstellt', 'desc')));
    return qs.docs.map(d => ({ code: d.id, ...d.data() }));
  } catch (e) {
    reportClientError('teilen/meine', e);
    /* Ohne Index scheitert orderBy — dann lieber ungeordnet als gar nicht. */
    try {
      const qs = await getDocs(query(freigabenColl(), where('ownerUid', '==', uid)));
      return qs.docs.map(d => ({ code: d.id, ...d.data() }));
    } catch (e2) { reportClientError('teilen/meine-ohne-folge', e2); return null; }
  }
}

/**
 * Den Auszug zu einem Code lesen — das tut die Empfängerin.
 *
 * Es gibt hier kein Konto und keine Anmeldung: der Code IST der
 * Zugang. Was zurückkommt, ist entweder der Auszug oder nichts;
 * warum es nichts ist (abgelaufen, zurückgezogen, nie existiert),
 * sagt die Ansicht bewusst nicht genauer — sonst wäre die Antwort
 * eine Auskunft darüber, welche Codes es einmal gab.
 */
export async function auszugHolen(code) {
  if (!codeGueltig(code)) return null;
  try {
    const snap = await getDoc(freigabeRef(code));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      code,
      label: d.label || '',
      umfang: d.umfang || {},
      stand: d.stand || 0,
      bis: d.bis || null,
      daten: JSON.parse(d.daten || '{}'),
    };
  } catch (e) {
    reportClientError('teilen/auszug', e);
    return null;
  }
}
