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

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { nameAus, fehlendeKarten } from './bekannte.js';

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
export async function eigeneKarte(uid, profil) {
  const name = nameAus(profil);
  if (!uid || !name) return false;
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

/* Der Admin trägt fehlende Karten nach — einmal am Tag, beim Öffnen von
   Start. Nur er darf alle Profile und alle Karten auflisten; bei allen
   anderen wäre schon das Lesen abgelehnt. In Stapeln zu 400, unter der
   Grenze von 500 Schreibvorgängen je Stapel. */
export async function kartenNachtragen() {
  const heute = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('firn.karten.nachgetragen') === heute) return 0; } catch { /* dann eben jetzt */ }
  const [profile, karten] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'personen')),
  ]);
  const fehlend = fehlendeKarten(
    profile.docs.map(d => ({ uid: d.id, ...d.data() })),
    new Map(karten.docs.map(d => [d.id, String(d.data().name || '')])),
  );
  for (let i = 0; i < fehlend.length; i += 400) {
    const stapel = writeBatch(db);
    for (const p of fehlend.slice(i, i + 400)) {
      stapel.set(doc(db, 'personen', p.uid), { name: p.name, aktualisiert: serverTimestamp() });
    }
    await stapel.commit();
  }
  fehlend.forEach(p => speicher.set(p.uid, Promise.resolve(p.name)));
  try { localStorage.setItem('firn.karten.nachgetragen', heute); } catch { /* nicht schlimm */ }
  return fehlend.length;
}
