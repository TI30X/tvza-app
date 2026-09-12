/* ══════════════════════════════════════════════════════════════════
   Die Gruppe wechseln — ein Baustein fuer die Leiste und die Gruppenseite.

   Bis v.35.30.0 war der Wechsel ein Auswahlfeld des Browsers, und nur
   auf der Gruppenseite. In der Leiste stand der Name EINER Gruppe, und
   nichts verriet, dass es weitere gibt. Wer Athlet im Kader und Trainer
   im Verein ist, musste das wissen.

   Jetzt: Karten mit Plaettchen, Name und der eigenen Rolle, die aktive
   markiert. Die Farbe des Plaettchens ist dieselbe wie die der Gruppe
   im Kalender (teamFarben) — ein Team hat EINE Farbe, wo immer es steht.

   Die Rollenwoerter und das Merken der Wahl kommen als Parameter herein
   (aus groups.js). So bleibt dieser Teil ohne Firebase und testbar.
   ══════════════════════════════════════════════════════════════════ */

import { waehle } from './dialog.js';
import { teamFarben } from './kalender-teams.js';
import { CALENDAR_COLORS, calendarColorInk } from './calendar-view.js';

const PALETTE = CALENDAR_COLORS.map(farbe => farbe.value);

const t = (key, deutsch, vars) => globalThis.window?.TVZAI18n?.tOr(key, deutsch, vars)
  ?? String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

/** Zwei Buchstaben fuer das Plaettchen: die Anfaenge der ersten zwei
    Woerter ("SC Einsiedeln" → SE), sonst die ersten zwei ("Kader" → KA). */
export function kuerzel(name) {
  const woerter = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!woerter.length) return '·';
  if (woerter.length === 1) return woerter[0].slice(0, 2).toUpperCase();
  return (woerter[0][0] + woerter[1][0]).toUpperCase();
}

/** Die Farbe einer Gruppe samt lesbarer Schrift darauf, als CSS-Variablen. */
export function gruppenStil(gruppen) {
  const farben = teamFarben(gruppen, PALETTE);
  return id => {
    const farbe = farben.get(id) || PALETTE[0];
    return `--tint:${farbe};--deep:${calendarColorInk(farbe)}`;
  };
}

/* Die Art einer Gruppe, deutsch als Rueckfall. Ohne eigene Sprachwahl
   laedt i18n.js keinen Katalog — mit '' als Rueckfall stand dann nur
   "Athlet" da, ohne "Rennkader". In der ersten Probe genau so gesehen. */
const ART = { kader: 'Rennkader', organisation: 'Verein oder Gym', familie: 'Familie oder Freunde' };

/** Die Karten: Name, "Athlet · Rennkader", Plaettchen in der Teamfarbe. */
export function gruppenOptionen(gruppen, aktivId, rolleWort = () => '') {
  const stil = gruppenStil(gruppen);
  return (gruppen || []).map(g => ({
    wert: g.id,
    titel: g.name || t('nav.gruppe', 'Gruppe'),
    text: [rolleWort(g.art, g.meineRolle), ART[g.art] ? t(`grp.art.${g.art}.titel`, ART[g.art]) : '']
      .filter(Boolean).join(' · '),
    kuerzel: kuerzel(g.name),
    stil: stil(g.id),
    aktiv: g.id === aktivId,
  }));
}

/**
 * Oeffnet die Wahl. Gibt die gewaehlte Gruppe zurueck (oder null) und
 * merkt sie ueber `setzen`, wenn es eine andere ist als die aktive.
 */
export async function gruppeWaehlen(gruppen, aktivId, { rolleWort, setzen } = {}) {
  const gid = await waehle({
    titel: t('grp.wechseln', 'Gruppe wechseln'),
    optionen: gruppenOptionen(gruppen, aktivId, rolleWort),
  });
  if (gid && gid !== aktivId) setzen?.(gid);
  return gid;
}
