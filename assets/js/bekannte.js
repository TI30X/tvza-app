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

/* Die Liste des TVZA-Kreises (kreis/{uid}) nach den Profilen richten:
   wer laut Profil im Kreis ist (`imKreis`, aus firebase-config.js), aber
   nicht auf der Liste steht, kommt dazu; wer draussen ist, aber noch
   darauf steht, geht. `bestehend` ist die Menge der uids auf der Liste. */
export function kreisAbgleich(profile, bestehend, imKreis) {
  const drin = new Set((profile || []).filter(p => p?.uid && imKreis(p)).map(p => p.uid));
  return {
    hinzu: [...drin].filter(uid => !bestehend.has(uid)),
    weg: [...bestehend].filter(uid => !drin.has(uid)),
  };
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
   hier nicht mehr. Gross/klein egal, Akzente auch ("Lea" findet "Léa").
   Seit v.35.67.0 auch "Mueller" für "Müller" (und umgekehrt) und mehrere
   Wörter in beliebiger Folge ("van zanten tim"). */
const flach = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const passt = (text, woerter) => { const f = flach(text); return woerter.every(w => f.includes(w)); };
const woerterAus = suche => flach(suche).split(/\s+/).filter(Boolean);
export function sucheBekannte(liste, suche) {
  const woerter = woerterAus(suche);
  if (!woerter.length) return liste;
  return liste.filter(b => passt(`${b.name} ${(b.gruppen || []).join(' ')}`, woerter));
}

/* Die eigenen Gruppen beim Namen (v.35.67.0) — derselbe Vergleich. */
export function sucheGruppen(gruppen, suche) {
  const woerter = woerterAus(suche);
  if (!woerter.length) return [];
  return (gruppen || []).filter(g => g?.id && passt(g.name, woerter));
}
