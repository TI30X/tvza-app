/* ══════════════════════════════════════════════════════════════════
   Eigene Pläne und eigene Übungen — der Zugriff auf Firestore.

   Zwei Orte, beide nur für die Person selbst:

       users/{uid}/trainingPrograms/{id}   ein eigener Wochenplan
       users/{uid}/uebungen/{id}           eine eigene Übung

   Der erste ist nicht neu: dort lagen schon die Wochen, die ein
   Trainer aus der Excel eingelesen hat, und die Regel dafür steht seit
   jeher (owner-only, json ≤ 900 000). Ein selbst gebauter Plan legt
   sich daneben und trägt `eigen: true` in seinem JSON — daran
   unterscheidet eigenePlaene() beides.

   Der zweite ist neu und braucht eine Regel (firestore.rules,
   users/{uid}/uebungen).

   Was hier NICHT steht: das Protokoll. Ein eigener Plan wird mit
   denselben Funktionen abgehakt wie ein Gruppenplan — groups.js
   verzweigt bei EIGEN auf users/{uid}/trainingLogs. Zwei Wege zum
   Eintragen wären zwei Gelegenheiten, Daten zu verlieren (Falle 26).
   ══════════════════════════════════════════════════════════════════ */

import { db, reportClientError } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { planText, planLesen, SCHEMA, TITEL_MAX } from './plan-bauer.js';
import { uebungSauber, EIGENE_MAX } from './uebungen-bibliothek.js';

const planColl = uid => collection(db, 'users', uid, 'trainingPrograms');
const planDoc = (uid, id) => doc(db, 'users', uid, 'trainingPrograms', id);
const uebungColl = uid => collection(db, 'users', uid, 'uebungen');
const uebungDoc = (uid, id) => doc(db, 'users', uid, 'uebungen', id);

/* ── Pläne ─────────────────────────────────────────────────────────*/

/**
 * Speichern — anlegen oder ändern.
 *
 * Die Felder sind genau die vier, die die Regel zulässt. `titel` steht
 * NICHT darunter: er lebt im Plan selbst (`name`), weil
 * hasOnly(['schema','id','json','updatedAt']) kein fünftes Feld
 * erlaubt und eine Regeländerung dafür nichts brächte.
 */
export async function planSpeichern(uid, plan, id = '') {
  const json = planText(plan);
  const kennung = id || doc(planColl(uid)).id;
  await setDoc(planDoc(uid, kennung), {
    schema: SCHEMA,
    id: kennung,
    json,
    updatedAt: serverTimestamp(),
  });
  return kennung;
}

export async function planHolen(uid, id) {
  try {
    const snap = await getDoc(planDoc(uid, id));
    if (!snap.exists()) return null;
    const plan = planLesen(snap.data().json);
    return plan ? { id: snap.id, plan } : null;
  } catch (e) { reportClientError('eigen/plan', e); return null; }
}

/** Alle eigenen Pläne, der jüngste zuerst. */
export async function meinePlaene(uid) {
  try {
    const snap = await getDocs(planColl(uid));
    return snap.docs
      .map(d => ({ id: d.id, plan: planLesen(d.data().json), updatedAt: d.data().updatedAt }))
      /* Eine Vorlage liegt im selben Speicher, ist aber kein Plan:
         sie hat keine Tage und gehoert nicht in die Woche. */
      .filter(x => x.plan?.eigen === true && x.plan?.vorlage !== true)
      .sort((a, b) => String(b.plan.dateRange?.start || '').localeCompare(String(a.plan.dateRange?.start || '')));
  } catch (e) { reportClientError('eigen/plaene', e); return null; }
}

export function planWeg(uid, id) {
  return deleteDoc(planDoc(uid, id));
}

export const planTitel = plan => String(plan?.name || '').slice(0, TITEL_MAX);

/* ── Eigene Übungen ────────────────────────────────────────────────
   Die mitgelieferte Bibliothek deckt das Übliche ab; alles andere legt
   man selbst an. Eine eigene Übung gehört dem Konto und wird mit
   niemandem geteilt — auch nicht mit der Gruppe, in der sie benutzt
   wird. Was im Plan landet, ist eine KOPIE der Werte (alsItem), keine
   Verknüpfung: wer eine Übung später ändert, ändert keinen Plan, den
   er schon gebaut hat. */

export async function uebungSpeichern(uid, uebung, id = '') {
  const sauber = uebungSauber(uebung);
  const kennung = id || doc(uebungColl(uid)).id;
  await setDoc(uebungDoc(uid, kennung), { ...sauber, id: kennung, updatedAt: serverTimestamp() });
  return kennung;
}

export async function meineUebungen(uid) {
  try {
    const snap = await getDocs(uebungColl(uid));
    return snap.docs.slice(0, EIGENE_MAX).map(d => ({ id: d.id, ...d.data(), eigen: true }));
  } catch (e) { reportClientError('eigen/uebungen', e); return []; }
}

export function uebungWeg(uid, id) {
  return deleteDoc(uebungDoc(uid, id));
}

/* ── Vorlagen ──────────────────────────────────────────────────────
   Eine Einheit, die man wiederverwendet. Sie liegt im Plan-Speicher
   mit einem eigenen Merkmal statt in einer dritten Sammlung: eine
   Vorlage ist ein Plan ohne Tage, und dafür braucht es keine Regel,
   die es noch nicht gibt. */
export async function vorlageSpeichern(uid, vorlage, id = '') {
  const kennung = id || doc(planColl(uid)).id;
  await setDoc(planDoc(uid, kennung), {
    schema: SCHEMA,
    id: kennung,
    json: JSON.stringify({ eigen: true, vorlage: true, schema: SCHEMA, days: [], units: {}, blatt: vorlage }),
    updatedAt: serverTimestamp(),
  });
  return kennung;
}

export async function meineVorlagen(uid) {
  try {
    const snap = await getDocs(planColl(uid));
    return snap.docs
      .map(d => {
        let roh = null;
        try { roh = JSON.parse(d.data().json || '{}'); } catch { return null; }
        return roh?.vorlage === true && roh?.blatt ? { id: d.id, ...roh.blatt } : null;
      })
      .filter(Boolean)
      .sort((a, b) => String(a.titel || '').localeCompare(String(b.titel || ''), 'de'));
  } catch (e) { reportClientError('eigen/vorlagen', e); return []; }
}

export const vorlageWeg = planWeg;
