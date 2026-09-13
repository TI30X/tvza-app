/* Attrappe der Firebase-Anmeldung — siehe firebase-firestore.js.

   Wer angemeldet ist, steht in localStorage['firn.attrappe.uid']
   (Vorgabe: michel, die Leitung). Umschalten über die Adresse:
   ?attrappe-als=timo — und ?attrappe-als= (leer) meldet ab. Die
   Anmeldeseite funktioniert: jede E-Mail aus den Startdaten meldet
   diese Person an, jede andere legt ein neues Konto an. */

import { KONTEN } from './daten.js';

const SCHLUESSEL = 'firn.attrappe.uid';
const als = new URLSearchParams(location.search).get('attrappe-als');
if (als !== null) localStorage.setItem(SCHLUESSEL, als);

function nutzer() {
  const uid = localStorage.getItem(SCHLUESSEL) ?? 'michel';
  if (!uid) return null;
  const k = KONTEN[uid] || { email: `${uid}@firn.test`, name: uid };
  return {
    uid, email: k.email, displayName: k.name, emailVerified: true, isAnonymous: false,
    providerData: [], metadata: {},
    getIdToken: async () => 'attrappe',
    reload: async () => {},
  };
}

const beobachter = new Set();
const AUTH = {
  currentUser: nutzer(),
  onAuthStateChanged: cb => onAuthStateChanged(AUTH, cb),
};
function melden() { for (const cb of beobachter) setTimeout(() => cb(AUTH.currentUser), 0); }

export const getAuth = () => AUTH;
export function onAuthStateChanged(auth, cb) {
  beobachter.add(cb);
  setTimeout(() => cb(AUTH.currentUser), 0);
  return () => beobachter.delete(cb);
}
export const browserLocalPersistence = { type: 'LOCAL' };
export const indexedDBLocalPersistence = { type: 'LOCAL' };
export const setPersistence = async () => {};

function anmelden(uid) {
  localStorage.setItem(SCHLUESSEL, uid);
  AUTH.currentUser = nutzer();
  melden();
  return { user: AUTH.currentUser };
}
const uidZu = email => Object.entries(KONTEN).find(([, k]) => k.email === String(email).trim().toLowerCase())?.[0];

export async function signInWithEmailAndPassword(auth, email) {
  const uid = uidZu(email);
  if (!uid) { const e = new Error('auth/invalid-credential'); e.code = 'auth/invalid-credential'; throw e; }
  return anmelden(uid);
}
export async function createUserWithEmailAndPassword(auth, email) {
  return anmelden(uidZu(email) || String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'neu');
}
export async function signOut() {
  localStorage.setItem(SCHLUESSEL, '');
  AUTH.currentUser = null;
  melden();
}
export const sendEmailVerification = async () => {};
export const reload = async () => {};
export const deleteUser = async () => { await signOut(); };
