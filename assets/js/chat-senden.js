/* ══════════════════════════════════════════════════════════════════
   Eine Nachricht in den Firn-Chat schicken — von ausserhalb des Chats.

   Die Gruppe verschickt ihre Einladung so (v.35.53.0, Michel: "es sollte
   möglich sein, diese Einladung einfach über den Firn-Chat zu
   verschicken … gleich an mehrere"). Dieselbe Form wie das Senden in
   pages/messages.html — die Regel für dms/{cid} kennt nur diese:
   Unterhaltung mit genau zwei Beteiligten (sortiert, Kennung a__b),
   Nachricht mit text, sender, createdAt.
   ══════════════════════════════════════════════════════════════════ */

import { db } from './firebase-config.js';
import {
  collection, doc, setDoc, addDoc, getDocs, query, where, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const gespraechsId = (a, b) => [a, b].sort().join('__');

/** Mit wem man schon schreibt — die Namen stehen in der Unterhaltung. */
export async function gespraechspartner(ich) {
  try {
    const snap = await getDocs(query(collection(db, 'dms'), where('participants', 'array-contains', ich)));
    return snap.docs.map(d => {
      const daten = d.data();
      const uid = (daten.participants || []).find(p => p !== ich);
      return uid ? { uid, name: daten.participantNames?.[uid] || '' } : null;
    }).filter(Boolean);
  } catch { return []; }
}

/** Eine Nachricht an eine Person. Wirft, wenn die Regel ablehnt. */
export async function nachrichtSenden({ ich, meinName, an, anName, text }) {
  const inhalt = String(text || '').trim().slice(0, 4000);
  if (!inhalt || !an || an === ich) return;
  const ref = doc(db, 'dms', gespraechsId(ich, an));
  await setDoc(ref, {
    participants: [ich, an].sort(),
    participantNames: { [ich]: meinName || '', [an]: anName || '' },
    lastMessage: inhalt.slice(0, 140),
    lastAt: serverTimestamp(),
    lastSender: ich,
    unread: { [an]: increment(1), [ich]: 0 },
  }, { merge: true });
  await addDoc(collection(ref, 'messages'), { text: inhalt, sender: ich, createdAt: serverTimestamp() });
}

/** An mehrere — jede für sich; wer scheitert, hält die anderen nicht auf. */
export async function anMehrere({ ich, meinName, empfaenger, text }) {
  const ergebnis = await Promise.allSettled(empfaenger.map(e =>
    nachrichtSenden({ ich, meinName, an: e.uid, anName: e.name, text })));
  return {
    gesendet: ergebnis.filter(r => r.status === 'fulfilled').length,
    fehler: ergebnis.filter(r => r.status === 'rejected').length,
  };
}
