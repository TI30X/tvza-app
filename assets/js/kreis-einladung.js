/* ══════════════════════════════════════════════════════════════════
   In den TVZA-Kreis einladen — mit einem Link (v.35.56.0).

   Michel: "Kann ich jemand einfach in TVZA einladen?" — bis dahin ging
   das in zwei Schritten: die Person legt ein Konto an, dann setzt der
   Admin im Admin-Bereich "Im TVZA-Kreis". Jetzt erzeugt der Admin einen
   Link (dieselbe kurze Form wie die Einladung in eine Gruppe,
   einladung.js: Adresse der App + ?k=<code>), und wer ihn öffnet — neu
   oder schon mit Konto —, ist danach im Kreis.

   Ein Link gilt für EINE Person und sieben Tage: TVZA ist für
   ausgewählte Freunde und Familie, ein weitergeleiteter Link soll nicht
   zehn Fremde hineinlassen. Beim Einlösen verschwindet er im selben
   Stapel, in dem das Profil in den Kreis kommt — die Regel
   (kreisEinladungen, Selbst-Zweig bei users) verlangt genau das.

   Was die Person bekommt, ist dasselbe wie beim Häkchen des Admins:
   kreis = true, die Kreisliste (kreis/{uid}) und die TVZA-Bereiche frei.
   Warum, steht nirgends.
   ══════════════════════════════════════════════════════════════════ */

import { db, imKreis, TVZA_BEREICHE } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, writeBatch, deleteDoc, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { neuerCode, codeSauber, ablaufAb, abgelaufen } from './einladung.js';

const SAMMLUNG = 'kreisEinladungen';

/** Nur der Admin. `fuer` ist ein Merkwort für ihn ("Grosi"), kein Konto. */
export async function kreisEinladungErzeugen(uid, { fuer = '', bis = ablaufAb() } = {}) {
  const code = neuerCode();
  const merkwort = String(fuer || '').trim().slice(0, 60);
  await writeBatch(db).set(doc(db, SAMMLUNG, code), {
    createdBy: uid, createdAt: serverTimestamp(), bis: Timestamp.fromDate(bis),
    ...(merkwort ? { fuer: merkwort } : {}),
  }).commit();
  return { code, bis, fuer: merkwort };
}

/** Die offenen — abgelaufene räumt der Admin dabei weg. */
export async function kreisEinladungen() {
  const snap = await getDocs(collection(db, SAMMLUNG));
  const jetzt = new Date();
  const alle = snap.docs.map(d => ({ code: d.id, ...d.data() }));
  await Promise.all(alle.filter(e => abgelaufen(e, jetzt))
    .map(e => deleteDoc(doc(db, SAMMLUNG, e.code)).catch(() => {})));
  return alle.filter(e => !abgelaufen(e, jetzt))
    .map(e => ({ ...e, bis: e.bis?.toDate ? e.bis.toDate() : new Date(e.bis) }))
    .sort((a, b) => b.bis - a.bis);
}

export function kreisEinladungZuruecknehmen(code) {
  return deleteDoc(doc(db, SAMMLUNG, code));
}

/** Ist das ein Link in den Kreis (und nicht in eine Gruppe)? */
export async function istKreisEinladung(code) {
  const sauber = codeSauber(code);
  if (!sauber) return false;
  try { return (await getDoc(doc(db, SAMMLUNG, sauber))).exists(); }
  catch { return false; }
}

/* Welche TVZA-Bereiche nach dem Einladen gleich auf Start stehen. Frei
   sind alle; die Maturaarbeit ist Timos Schularbeit und bleibt aus, bis
   jemand sie in den Einstellungen einschaltet. Ohne das stand auf Start
   "Noch kein Bereich eingeschaltet" — im Rundgang so gesehen. */
export const KREIS_SICHTBAR = Object.freeze(['food', 'watch', 'projects']);

/** Was ins Profil geht: der Kreis, alle TVZA-Bereiche frei, die üblichen
    gleich eingeschaltet (rein). */
export function kreisProfil(profil = {}, code) {
  const frei = { ...(profil.allowedModules || {}) };
  for (const key of TVZA_BEREICHE) frei[key] = true;
  const sichtbar = { ...(profil.modules || {}) };
  for (const key of KREIS_SICHTBAR) sichtbar[key] = true;
  return { kreis: true, kreisCode: code, allowedModules: frei, modules: sichtbar };
}

/**
 * Tritt mit einem Link in den Kreis. Wer schon drin ist, verbraucht den
 * Link nicht. Wirft mit einer lesbaren Meldung.
 */
export async function kreisBeitreten(code, uid) {
  const sauber = codeSauber(code);
  const einladung = await getDoc(doc(db, SAMMLUNG, sauber));
  if (!einladung.exists()) throw new Error('Diese Einladung gibt es nicht (mehr).');
  if (abgelaufen(einladung.data())) throw new Error('Diese Einladung ist abgelaufen. Frag nach einem neuen Link.');

  const profilDoc = await getDoc(doc(db, 'users', uid));
  const profil = profilDoc.exists() ? profilDoc.data() : {};
  const allesFrei = TVZA_BEREICHE.every(key => profil.allowedModules?.[key] === true);
  if (imKreis(profil) && allesFrei && profil.kreis === true) return { kreis: true, schon: true };

  /* Profil, Kreisliste und Verbrauch des Links in EINEM Stapel — die
     Regel prüft, dass der Link vorher da war und danach weg ist. */
  await writeBatch(db)
    .update(doc(db, 'users', uid), kreisProfil(profil, sauber))
    .set(doc(db, 'kreis', uid), { seit: serverTimestamp() })
    .delete(doc(db, SAMMLUNG, sauber))
    .commit();
  return { kreis: true, schon: false };
}
