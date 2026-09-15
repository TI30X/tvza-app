/* Der Chat mit Firebase (v.35.61.0) — was chat-modell.js rechnet, hier
   gelesen und geschrieben. Die Liste der Unterhaltungen braucht der Chat
   selbst, die Leiste (der Punkt am Tab, nav.js) und Start (die Zahl an
   der Kachel) — darum ein Modul und nicht dreimal dieselben Abfragen. */

import { db } from './firebase-config.js';
import {
  collection, doc, onSnapshot, query, where, setDoc, addDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { beobachteMeineGruppen } from './groups.js';
import { unterhaltungen } from './chat-modell.js';

/**
 * Alle Unterhaltungen live: die zu zweit und die Gruppenchats (dms), die
 * Chats der eigenen Gruppen (je ein kleines Dokument chatMeta/letzte) und
 * was man selbst dazu weiss (users/{uid}/chat: stumm, gelesen).
 * cb(liste, { dms, gruppen })
 */
export function beobachteUnterhaltungen(uid, cb) {
  let dms = [];
  let gruppen = [];
  let stand = new Map();
  const meta = new Map();
  const metaAbos = new Map();
  const melden = () => cb(unterhaltungen({ ich: uid, dms, gruppen, meta, stand }), { dms, gruppen });

  const ab = [
    onSnapshot(query(collection(db, 'dms'), where('participants', 'array-contains', uid)), s => {
      dms = s.docs.map(d => ({ id: d.id, ...d.data() }));
      melden();
    }, () => {}),
    onSnapshot(collection(db, 'users', uid, 'chat'), s => {
      stand = new Map(s.docs.map(d => [d.id, d.data()]));
      melden();
    }, () => {}),
    beobachteMeineGruppen(uid, liste => {
      gruppen = liste;
      const ids = new Set(liste.map(g => g.id));
      for (const gid of [...metaAbos.keys()]) {
        if (ids.has(gid)) continue;
        metaAbos.get(gid)();
        metaAbos.delete(gid);
        meta.delete(gid);
      }
      for (const g of liste) {
        if (metaAbos.has(g.id)) continue;
        metaAbos.set(g.id, onSnapshot(doc(db, 'groups', g.id, 'chatMeta', 'letzte'), s => {
          if (s.exists()) meta.set(g.id, s.data()); else meta.delete(g.id);
          melden();
        }, () => {}));
      }
      melden();
    }),
  ];
  return () => { ab.forEach(f => f?.()); metaAbos.forEach(f => f()); metaAbos.clear(); };
}

/** stumm, gelesen — nur die Person selbst. */
export function standSetzen(uid, schluessel, daten) {
  return setDoc(doc(db, 'users', uid, 'chat', schluessel), daten, { merge: true });
}

/**
 * In den Chat einer Gruppe schreiben — aus dem Chat und vom Assistenten,
 * wenn er einen Termin einträgt (dann mit termin, der Karte).
 */
export async function gruppenNachricht({ gid, ich, meinName = '', text, termin = null }) {
  const inhalt = String(text || '').trim().slice(0, 4000);
  if (!inhalt || !gid || !ich) return;
  await addDoc(collection(db, 'groups', gid, 'chat'), {
    text: inhalt, sender: ich, senderName: String(meinName).slice(0, 80), createdAt: serverTimestamp(),
    ...(termin ? { termin } : {}),
  });
  await setDoc(doc(db, 'groups', gid, 'chatMeta', 'letzte'), {
    text: inhalt.slice(0, 140), sender: ich, senderName: String(meinName).slice(0, 80), at: serverTimestamp(),
  });
}
