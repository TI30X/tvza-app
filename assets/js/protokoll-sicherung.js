/* ══════════════════════════════════════════════════════════════════
   Was noch nicht beim Server ist, liegt im Gerät (v.35.64.0).

   Michel: "Notizen sind verschwunden." Der Player schrieb 900 ms nach
   der letzten Eingabe; wer davor die Seite verliess, verlor sie. Und
   offline hielt nur der Speicher von Firestore die Eingabe — der ging
   verloren, wenn der Browser die Seite vorher beendete.

   Jede Änderung einer Übung landet darum SOFORT (synchron) hier, mit
   ihrem Stand, und bleibt, bis der Server sie bestätigt hat. Beim
   nächsten Öffnen des Players — oder beim nächsten Start der App mit
   Netz — geht hinaus, was noch da liegt. Gelöscht wird ein Eintrag nur,
   wenn der Server genau diesen Stand (oder einen neueren) hat.

   Rein: der Speicher (localStorage) wird hineingereicht.
   ══════════════════════════════════════════════════════════════════ */

import { eintragSchluessel } from './einheit.js';

export const SCHLUESSEL = 'firn.protokoll.offen';

function lesen(speicher) {
  try {
    const roh = JSON.parse(speicher?.getItem(SCHLUESSEL) || '{}');
    return roh && typeof roh === 'object' ? roh : {};
  } catch { return {}; }
}

function schreiben(speicher, alles) {
  try {
    if (Object.keys(alles).length) speicher.setItem(SCHLUESSEL, JSON.stringify(alles));
    else speicher.removeItem(SCHLUESSEL);
  } catch { /* voll oder gesperrt: dann bleibt nur Firestore */ }
}

export const tagSchluessel = (gid, uid, datum) => `${gid}|${uid}|${datum}`;

/**
 * Eine Änderung merken.
 * @param a { unitId, key, eintrag, stand, plan }
 */
export function sichern(speicher, tag, a) {
  const alles = lesen(speicher);
  const tagDaten = alles[tag] || {};
  tagDaten[eintragSchluessel(a.unitId, a.key)] = {
    unitId: a.unitId, key: a.key, eintrag: a.eintrag ?? null, stand: a.stand, plan: a.plan || '',
  };
  alles[tag] = tagDaten;
  schreiben(speicher, alles);
}

/** Bestätigt: weg damit — aber nur, wenn seither nichts Neueres kam. */
export function bestaetigt(speicher, tag, schluessel, stand) {
  const alles = lesen(speicher);
  const tagDaten = alles[tag];
  if (!tagDaten?.[schluessel]) return;
  if ((Number(tagDaten[schluessel].stand) || 0) > (Number(stand) || 0)) return;
  delete tagDaten[schluessel];
  if (!Object.keys(tagDaten).length) delete alles[tag];
  schreiben(speicher, alles);
}

/** Was für diesen Tag noch offen ist: [{ unitId, key, eintrag, stand, plan }]. */
export function offeneFuer(speicher, tag) {
  return Object.values(lesen(speicher)[tag] || {});
}

/** Alle offenen Tage einer Person: [{ gid, datum, tag, aenderungen }]. */
export function alleOffenen(speicher, uid) {
  return Object.entries(lesen(speicher))
    .map(([tag, daten]) => {
      const [gid, wer, datum] = tag.split('|');
      return { gid, uid: wer, datum, tag, aenderungen: Object.values(daten || {}) };
    })
    .filter(x => x.uid === uid && x.gid && x.datum && x.aenderungen.length);
}

export function hatOffene(speicher) {
  return Object.keys(lesen(speicher)).length > 0;
}

/**
 * Was noch im Gerät liegt, hinausschicken — Tag für Tag.
 * @param schreibe  protokollAbgleichen(gid, uid, datum, aenderungen, planId)
 * @param o.ausser  ein Tag, um den sich schon jemand kümmert (der offene Player)
 * @returns wie viele Einträge bestätigt wurden
 */
export async function nachtragen(speicher, uid, schreibe, { ausser = '' } = {}) {
  let n = 0;
  for (const x of alleOffenen(speicher, uid)) {
    if (x.tag === ausser) continue;
    const plan = x.aenderungen.find(a => a.plan)?.plan || '';
    try {
      const r = await schreibe(x.gid, uid, x.datum,
        x.aenderungen.map(a => ({ unitId: a.unitId, key: a.key, eintrag: a.eintrag, stand: a.stand })), plan);
      const fertig = new Set([...(r?.geschrieben || []), ...(r?.verworfen || [])]);
      for (const a of x.aenderungen) {
        const s = eintragSchluessel(a.unitId, a.key);
        if (fertig.has(s)) { bestaetigt(speicher, x.tag, s, a.stand); n += 1; }
      }
    } catch { /* offline oder abgelehnt: bleibt liegen, nächstes Mal */ }
  }
  return n;
}
