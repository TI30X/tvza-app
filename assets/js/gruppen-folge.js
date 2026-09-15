/* ══════════════════════════════════════════════════════════════════
   Die eigene Reihenfolge der Gruppen (v.35.68.0) — rein.

   Michel: "Gruppen pro Nutzer sortieren — Drag-and-drop und Hoch/Runter,
   am Desktop und am Handy; im Backend pro Nutzer gespeichert, in allen
   Listen und Wählern gleich, auf anderen Geräten dieselbe Reihenfolge;
   neue Gruppen setzen sie nicht zurück."

   Die Folge ist eine Liste von Kennungen. Was darin steht, kommt in
   dieser Reihenfolge; eine Gruppe, die noch nicht darin steht (neu, oder
   von vor der Sortierung), kommt danach, nach dem Namen. So bleibt die
   eigene Ordnung, wenn eine Gruppe dazukommt.
   ══════════════════════════════════════════════════════════════════ */

export const FOLGE_MAX = 50;

/** Nur Kennungen, jede einmal, höchstens FOLGE_MAX. */
export function folgeSauber(folge) {
  const raus = [];
  for (const id of Array.isArray(folge) ? folge : []) {
    const s = String(id ?? '').trim();
    if (s && s.length <= 128 && !raus.includes(s)) raus.push(s);
    if (raus.length >= FOLGE_MAX) break;
  }
  return raus;
}

/** Die Gruppen in der eigenen Folge; Unbekannte hinten, nach dem Namen. */
export function nachFolge(gruppen, folge = []) {
  const stelle = new Map(folgeSauber(folge).map((id, i) => [id, i]));
  return [...(gruppen || [])].sort((a, b) => {
    const pa = stelle.has(a?.id) ? stelle.get(a.id) : Infinity;
    const pb = stelle.has(b?.id) ? stelle.get(b.id) : Infinity;
    if (pa !== pb) return pa - pb;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'de');
  });
}

/** Eine Gruppe um `um` Plätze verschieben (−1 hoch, +1 runter). */
export function verschieben(gruppen, id, um) {
  const ids = (gruppen || []).map(g => g.id);
  const von = ids.indexOf(id);
  if (von === -1) return ids;
  const nach = Math.max(0, Math.min(ids.length - 1, von + um));
  ids.splice(von, 1);
  ids.splice(nach, 0, id);
  return ids;
}

/** Eine Gruppe an eine Stelle legen (Ziehen). */
export function anStelle(gruppen, id, stelle) {
  const ids = (gruppen || []).map(g => g.id).filter(x => x !== id);
  ids.splice(Math.max(0, Math.min(ids.length, stelle)), 0, id);
  return ids;
}
