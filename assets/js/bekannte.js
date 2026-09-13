/* ══════════════════════════════════════════════════════════════════
   Bekannte — wen man kennt, ohne Firestore.

   Die reinen Rechnungen zu personen.js: welcher Name auf eine
   Namenskarte gehört, welche Karten fehlen, und wer aus den eigenen
   Gruppen als Kontakt gilt. Ohne Firebase, damit die Tests sie direkt
   laden können.
   ══════════════════════════════════════════════════════════════════ */

/* So lang darf ein Name auf der Karte sein — dieselbe Zahl steht in
   firestore.rules (match /personen/{uid}). */
export const NAME_MAX = 80;

/* Der Name aus einem Profil. displayName ist der heutige Weg, name der
   ältere; ohne beides gibt es keine Karte. */
export function nameAus(profil) {
  return String(profil?.displayName || profil?.name || '').trim().slice(0, NAME_MAX);
}

/* Welche Karten der Admin nachtragen muss: jedes Profil mit Namen, dessen
   Karte fehlt oder einen anderen Namen trägt. `karten` ist eine Map
   uid → Name der bestehenden Karten. */
export function fehlendeKarten(profile, karten) {
  return (profile || [])
    .map(p => ({ uid: p?.uid, name: nameAus(p) }))
    .filter(p => p.uid && p.name && karten.get(p.uid) !== p.name);
}

/* Die Kontakte aus den eigenen Gruppen: jede Person einmal, auch wenn
   sie in zwei Gruppen ist, nie man selbst, und nie jemand ohne Namen —
   "Ohne Namen" zehnmal untereinander hilft niemandem beim Wählen. Die
   Gruppen stehen dabei, damit zwei Leute mit demselben Namen
   unterscheidbar bleiben.

   `jeGruppe`: [{ gruppe: 'BSV Perspektivkader', mitglieder: [{ uid, name }] }] */
export function bekannteAus(jeGruppe, ich) {
  const nach = new Map();
  for (const { gruppe, mitglieder } of jeGruppe || []) {
    for (const m of mitglieder || []) {
      const name = String(m?.name || '').trim();
      if (!m?.uid || m.uid === ich || !name) continue;
      const eintrag = nach.get(m.uid) || { uid: m.uid, name, gruppen: [] };
      if (gruppe && !eintrag.gruppen.includes(gruppe)) eintrag.gruppen.push(gruppe);
      nach.set(m.uid, eintrag);
    }
  }
  return [...nach.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/* Die Suche im Chat: nach dem Namen, nicht nach der E-Mail — die gibt es
   hier nicht mehr. Gross/klein egal, Akzente auch ("Lea" findet "Léa"). */
const flach = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function sucheBekannte(liste, suche) {
  const s = flach(suche).trim();
  if (!s) return liste;
  return liste.filter(b => flach(b.name).includes(s) || b.gruppen.some(g => flach(g).includes(s)));
}
