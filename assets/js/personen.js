/* ══════════════════════════════════════════════════════════════════
   Personen — wer jemand ist, ohne dass man sein Profil liest.

   Bis v.35.46.0 durfte jedes Mitglied jedes Profil lesen und auflisten
   (users/{uid}: get und list für isMember()). Ein Profil trägt die
   E-Mail, die Freigaben, die Sprache — und die Auswahl "Wem schreiben?"
   im Chat zeigte darum jedem Konto Namen und E-Mail ALLER Konten, auch
   die von Minderjährigen aus einem Kader, in dem man gar nicht ist.

   Seit v.35.47.0 gibt es zwei Dinge:

       users/{uid}      das Profil — nur die Person selbst und der Admin
       personen/{uid}   die Namenskarte { name, aktualisiert } — jedes
                        Mitglied darf eine Karte lesen, deren uid es
                        kennt, aber niemand ausser dem Admin darf sie
                        auflisten

   Wen man kennt, ergibt sich aus den Gruppen (kontakte() in groups.js).

   Jede Person schreibt ihre Karte selbst, beim Öffnen von Start und
   Gruppe (eigeneKarte). Für die, die länger nicht da waren, trägt der
   Admin sie nach (kartenNachtragen) — er darf die Profile lesen.
   ══════════════════════════════════════════════════════════════════ */

import { db, auth, imKreis } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { nameAus, fehlendeKarten, kreisAbgleich } from './bekannte.js';

/* Der Zwischenspeicher hält das Versprechen, nicht den Namen: fragen
   zwanzig Zeilen gleichzeitig nach derselben Person, wird einmal
   gelesen. Er gilt für die Lebensdauer der Seite — ein Name, der sich
   währenddessen ändert, ist beim nächsten Öffnen richtig. */
const speicher = new Map();

export function nameVon(uid) {
  if (!uid) return Promise.resolve('');
  if (!speicher.has(uid)) speicher.set(uid, lies(uid));
  return speicher.get(uid);
}

async function lies(uid) {
  try {
    const karte = await getDoc(doc(db, 'personen', uid));
    const name = karte.exists() ? String(karte.data().name || '').trim() : '';
    if (name) return name;
  } catch { /* Karte nicht lesbar — weiter mit dem Übergang */ }
  /* Übergang: wer seit v.35.47.0 weder Start geöffnet hat noch vom Admin
     nachgetragen wurde, hat noch keine Karte. Solange die alten Regeln
     gelten, steht der Name noch im Profil; danach scheitert das still,
     und es steht eben kein Name da. */
  try {
    const profil = await getDoc(doc(db, 'users', uid));
    if (profil.exists()) return nameAus(profil.data());
  } catch { /* fremdes Profil nicht lesbar — seit v.35.47.0 der Normalfall */ }
  return '';
}

/* Die eigene Karte schreiben, wenn sie fehlt oder nicht mehr stimmt. Ein
   Merker im Gerät spart den Lesezugriff bei jedem Öffnen; fehlt er,
   wird einmal gelesen. Scheitert es — alte Regeln, offline —, bleibt
   alles wie es war, und beim nächsten Öffnen wird es erneut versucht. */
/* ── Finden über die E-Mail (v.35.62.0) ─────────────────────────────
   Michel: "beim Gruppenchat sollten nicht einfach alle Leute aufgelistet
   sein — da sollte man die E-Mail eintragen können … wenn du die E-Mail
   eingibst, sollte sich der Name zeigen und das Konto".

   Jede Person legt unter emailKarten/{sha256 ihrer E-Mail} ihre uid und
   ihren Namen ab. Die Adresse selbst steht nirgends; lesen kann eine Karte
   nur, wer die Adresse schon kennt (get, nie list), und die Regel prüft,
   dass die Kennung wirklich der Hash der eigenen, angemeldeten Adresse ist
   — niemand legt eine Karte unter fremder Adresse ab. */
export async function emailHash(email) {
  const sauber = String(email || '').trim().toLowerCase();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sauber));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const istEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/** { uid, name } zu einer E-Mail — oder null, wenn es kein Konto gibt. */
export async function personPerEmail(email) {
  if (!istEmail(email)) return null;
  try {
    const karte = await getDoc(doc(db, 'emailKarten', await emailHash(email)));
    if (!karte.exists()) return null;
    const { uid, name } = karte.data();
    return uid ? { uid, name: String(name || '') } : null;
  } catch { return null; }
}

async function eigeneEmailKarte(uid, name) {
  const email = auth.currentUser?.email;
  if (!email) return;
  const merker = `firn.emailkarte.${uid}`;
  const stand = `${email.toLowerCase()}|${name}`;
  try { if (localStorage.getItem(merker) === stand) return; } catch { /* dann eben schreiben */ }
  try {
    await setDoc(doc(db, 'emailKarten', await emailHash(email)), { uid, name, aktualisiert: serverTimestamp() });
    try { localStorage.setItem(merker, stand); } catch { /* nicht schlimm */ }
  } catch { /* Regel noch nicht ausgerollt oder offline: beim nächsten Mal */ }
}

export async function eigeneKarte(uid, profil) {
  const name = nameAus(profil);
  if (!uid || !name) return false;
  void eigeneEmailKarte(uid, name);
  const merker = `firn.karte.${uid}`;
  try { if (localStorage.getItem(merker) === name) return false; } catch { /* ohne Speicher eben lesen */ }
  try {
    const karte = await getDoc(doc(db, 'personen', uid));
    if (!karte.exists() || karte.data().name !== name) {
      await setDoc(doc(db, 'personen', uid), { name, aktualisiert: serverTimestamp() });
    }
    speicher.set(uid, Promise.resolve(name));
    try { localStorage.setItem(merker, name); } catch { /* nicht schlimm */ }
    return true;
  } catch { return false; }
}

/* Der Admin trägt fehlende Karten nach und richtet die Liste des
   TVZA-Kreises nach den Profilen (v.35.48.0) — einmal am Tag, beim
   Öffnen der App. Nur er darf alle Profile, Karten und die Kreisliste
   auflisten; bei allen anderen wäre schon das Lesen abgelehnt. In
   Stapeln zu 400, unter der Grenze von 500 Schreibvorgängen je Stapel. */
export async function kartenNachtragen() {
  const heute = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('firn.karten.nachgetragen') === heute) return 0; } catch { /* dann eben jetzt */ }
  /* Die Kreisliste für sich: fehlt ihre Regel noch (Code vor Regeln
     ausgerollt), sollen wenigstens die Karten entstehen. */
  const [profilSnap, karten, kreis] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'personen')),
    getDocs(collection(db, 'kreis')).catch(() => null),
  ]);
  const profile = profilSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
  const fehlend = fehlendeKarten(
    profile,
    new Map(karten.docs.map(d => [d.id, String(d.data().name || '')])),
  );
  const { hinzu, weg } = kreis
    ? kreisAbgleich(profile, new Set(kreis.docs.map(d => d.id)), imKreis)
    : { hinzu: [], weg: [] };
  const schritte = [
    ...fehlend.map(p => s => s.set(doc(db, 'personen', p.uid), { name: p.name, aktualisiert: serverTimestamp() })),
    ...hinzu.map(uid => s => s.set(doc(db, 'kreis', uid), { seit: serverTimestamp() })),
    ...weg.map(uid => s => s.delete(doc(db, 'kreis', uid))),
  ];
  for (let i = 0; i < schritte.length; i += 400) {
    const stapel = writeBatch(db);
    schritte.slice(i, i + 400).forEach(schritt => schritt(stapel));
    await stapel.commit();
  }
  fehlend.forEach(p => speicher.set(p.uid, Promise.resolve(p.name)));
  try { localStorage.setItem('firn.karten.nachgetragen', heute); } catch { /* nicht schlimm */ }
  return schritte.length;
}

/* Wer im Kreis ist — für die Kontakte im Chat und beim Teilen. Nur wer
   selbst im Kreis ist, darf die Liste lesen; alle anderen bekommen
   still eine leere. */
export async function kreisMitglieder() {
  try {
    const snap = await getDocs(collection(db, 'kreis'));
    return Promise.all(snap.docs.map(async d => ({ uid: d.id, name: await nameVon(d.id) })));
  } catch { return []; }
}
