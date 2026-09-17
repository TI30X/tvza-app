/* ══════════════════════════════════════════════════════════════════
   Der Überblick auf Start — rein (v.35.66.0).

   Michel: "Home darf nie leer sein" — ein Athlet in einer Gruppe sah
   "Keine Bereiche aktiviert" und sonst nichts —, und die Karte mit den
   wichtigen Infos "erscheint nur selten". Belegt im Code (heute.js bis
   v.35.65.0):
   - die Karte wartete 1,2 s auf die eigenen Termine und dann höchstens
     0,9 s auf die der Gruppen; was später kam, fiel weg und wurde nie
     nachgezeichnet — am Handy mit schwachem Netz fast immer;
   - sie zählte nur, was HEUTE (am Abend: morgen) anstand; stand erst
     übermorgen ein Rennen an, schwieg sie (Regel 2 aus briefing.js);
   - Trainings aus den Plänen kamen gar nicht vor.

   Hier steht, WAS gezeigt wird. Geladen und gezeichnet wird in
   feature/start/ueberblick.js. Nichts wird erfunden: Vergangenes,
   Abgehaktes und Abgesagtes ausserhalb des Fensters fällt weg; ein neuer
   Plan zählt drei Tage lang als neu.
   ══════════════════════════════════════════════════════════════════ */

import { planEinheiten, plusTage } from './wochenplan.js';
import { uebungen, fortschritt } from './einheit.js';

export const VORSCHAU = 14;          // Tage nach dem Stichtag
export const ABEND = 18;             // ab dann zeigt die Karte morgen
export const NEU_TAGE = 3;           // so lange ist ein Plan "neu"

const zwei = n => String(n).padStart(2, '0');
export const isoVon = d => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;

function msVon(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (Number.isFinite(t.seconds)) return t.seconds * 1000;
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param o.jetzt        Date
 * @param o.uid          die eigene uid
 * @param o.gruppen      [{ id, name, meineRolle }]
 * @param o.termine      [{ ...termin, gid }]   aus allen eigenen Gruppen
 * @param o.plaene       [{ gid, plan, programm }]
 * @param o.protokolle   { gid: { datum: protokoll } }  die eigenen
 * @param o.erinnerungen [{ title, date, time, completed }]
 * @param o.eigene       [{ title, date, time }]  calendarDays
 * @returns {{ stichtag, abend, jetzt: Eintrag[], demnaechst: Eintrag[], alle: Eintrag[], nichts: boolean }}
 */
export function wichtigeInfos({
  jetzt = new Date(), uid = '', gruppen = [], termine = [], plaene = [], protokolle = {},
  erinnerungen = [], eigene = [], abendAb = ABEND,
} = {}) {
  const heute = isoVon(jetzt);
  const abend = jetzt.getHours() >= abendAb;
  const stichtag = abend ? plusTage(heute, 1) : heute;
  const bis = plusTage(stichtag, VORSCHAU);
  const name = gid => gruppen.find(g => g.id === gid)?.name || '';
  const liste = [];

  /* Trainings: die Pläne für alle und die eigenen (wie der Kalender),
     mit dem eigenen Fortschritt. */
  const meine = plaene.filter(q => q?.programm && q.plan && (q.plan.fuer === 'alle' || q.plan.fuer === uid));
  const quellen = meine.map(q => ({ gid: q.gid, plan: q.plan, programm: q.programm, gruppe: name(q.gid) }));
  for (const e of planEinheiten(quellen, heute)) {
    if (e.datum < heute || e.datum > bis) continue;
    const q = quellen.find(x => x.plan.id === e.planId && x.gid === e.gid);
    const items = q && e.unit ? uebungen(q.programm, e.unit) : [];
    const f = items.length ? fortschritt(items, protokolle?.[e.gid]?.[e.datum] || {}, e.unit) : null;
    liste.push({
      art: 'training', datum: e.datum, zeit: e.zeit || '', slot: e.slot || '', titel: e.titel,
      gid: e.gid, gruppe: e.gruppe, planId: e.planId, unit: e.unit, fortschritt: f,
    });
  }

  /* Termine der Gruppen. Ein Lager, das läuft, steht heute; ein
     abgesagter Termin im Fenster wird als Absage genannt — genau das
     will man wissen. */
  for (const t of termine) {
    if (!t?.von) continue;
    const ende = t.bis && t.bis > t.von ? t.bis : t.von;
    if (ende < heute || t.von > bis) continue;
    liste.push({
      art: t.abgesagt === true ? 'absage' : 'termin',
      datum: t.von < heute ? heute : t.von, zeit: t.zeit || '', titel: t.titel || '',
      gid: t.gid, gruppe: name(t.gid), id: t.id || '', notiz: String(t.notiz || '').trim(),
      laeuft: t.von < heute, bis: ende,
    });
  }

  /* Offene Erinnerungen; überfällige gehören nach heute. */
  for (const r of erinnerungen) {
    if (!r || r.completed || !r.date || r.date > bis) continue;
    liste.push({
      art: 'erinnerung', datum: r.date < heute ? heute : r.date, zeit: r.time || '',
      titel: r.title || '', ueberfaellig: r.date < heute,
    });
  }

  /* Eigene Einträge im Kalender. */
  for (const d of eigene) {
    if (!d?.date || d.date < heute || d.date > bis) continue;
    liste.push({ art: 'eigen', datum: d.date, zeit: d.time || '', titel: d.title || '' });
  }

  /* Ein neuer Plan — drei Tage lang. */
  for (const q of meine) {
    const ms = msVon(q.plan.erstelltAm);
    if (!ms || jetzt.getTime() - ms > NEU_TAGE * 86400000 || ms > jetzt.getTime() + 60000) continue;
    liste.push({ art: 'plan', datum: heute, titel: q.plan.titel || '', gid: q.gid, gruppe: name(q.gid), planId: q.plan.id });
  }

  const reihenfolge = x => `${x.datum}${x.art === 'plan' ? '0' : '1'}${x.zeit || '99:99'}`;
  liste.sort((a, b) => reihenfolge(a).localeCompare(reihenfolge(b)));

  /* Jetzt: der Stichtag, neue Pläne, Überfälliges — und am Abend das
     Training von heute, solange es nicht fertig ist. */
  const jetztig = liste.filter(x => x.datum === stichtag
    || x.art === 'plan'
    || x.ueberfaellig
    || (x.art === 'training' && x.datum === heute && !x.fortschritt?.fertig)
    || (x.laeuft && x.bis >= stichtag));
  const demnaechst = liste.filter(x => !jetztig.includes(x) && x.datum > stichtag);
  return {
    stichtag, abend,
    /* Kompakt (Michel): fünf für jetzt, drei danach; der Rest steht im Kalender. */
    jetzt: jetztig.slice(0, 5),
    mehrJetzt: Math.max(0, jetztig.length - 5),
    demnaechst: demnaechst.slice(0, 3),
    /* Der sichtbare Ueberblick bleibt kompakt. Fuer den EINEN lokalen
       Assistentenhinweis braucht Start aber die vollstaendige sortierte
       Auswahl, damit nicht zufaellig der sechste Eintrag gewinnt. */
    alle: liste,
    nichts: !liste.length,
  };
}

/**
 * Der eine Assistentenhinweis auf Start. Rein und ohne KI-Aufruf: Die
 * vorhandenen Daten bestimmen nur, welcher vorbereitete Satz ins Feld
 * kommt. Ein Gruppenassistent bekommt ausschliesslich Eintraege seiner
 * Gruppe; Eigenes und Erinnerungen brauchen den persoenlichen Assistenten.
 */
export function assistentVorschlag({
  jetzt = new Date(), info = {}, gruppen = [], aktiveGid = '', assistenten = [],
} = {}) {
  if (!assistenten.length) return null;
  const persoenlich = assistenten.find(a => a?.persoenlich || a?.wer === 'ich') || null;
  const fuerGruppe = gid => assistenten.find(a => a?.wer === gid && !a?.persoenlich) || null;
  const passend = eintrag => (eintrag?.gid ? fuerGruppe(eintrag.gid) : persoenlich);
  const alle = Array.isArray(info.alle)
    ? info.alle
    : [...(info.jetzt || []), ...(info.demnaechst || [])];
  const heute = isoVon(jetzt);
  const nimm = (art, prueft) => {
    const eintrag = alle.find(x => prueft(x) && passend(x));
    return eintrag ? { art, eintrag, assistent: passend(eintrag) } : null;
  };

  const ueberfaellig = nimm('ueberfaellig', x => x?.art === 'erinnerung' && x.ueberfaellig);
  if (ueberfaellig) return ueberfaellig;

  const heuteOffen = nimm('heute', x => x?.datum === heute && x.art !== 'absage'
    && (x.art === 'termin' || x.art === 'eigen'
      || (x.art === 'training' && !x.fortschritt?.fertig)));
  if (heuteOffen) return heuteOffen;

  const naechstes = nimm('naechstes', x => x?.art !== 'absage' && x?.datum >= heute
    && ['training', 'termin', 'eigen', 'plan', 'erinnerung'].includes(x.art));
  if (naechstes) return naechstes;

  const aktiv = gruppen.find(g => g?.id === aktiveGid) || gruppen[0] || null;
  const gruppenAssistent = aktiv ? fuerGruppe(aktiv.id) : null;
  if (aktiv && gruppenAssistent && ['head', 'staff'].includes(aktiv.meineRolle)) {
    return { art: 'planung', gruppe: aktiv, assistent: gruppenAssistent };
  }

  const assistent = persoenlich || gruppenAssistent || assistenten[0];
  const gruppe = assistent?.persoenlich || assistent?.wer === 'ich'
    ? null
    : (gruppen.find(g => g.id === assistent.wer)
      || { id: assistent.wer, name: assistent.gruppe || '' });
  return assistent ? { art: 'woche', gruppe, assistent } : null;
}

/**
 * Was der Überblick zeigen soll, wenn es keine Daten gibt — die vier
 * Fälle aus Michels Liste auseinander: lädt, offline, gescheitert, leer.
 */
export function zustand({ laedt = false, offline = false, fehler = 0, quellen = 0, nichts = false } = {}) {
  if (laedt) return 'laedt';
  if (quellen && fehler >= quellen) return offline ? 'offline' : 'fehler';
  if (nichts) return offline ? 'offline-leer' : 'leer';
  return 'daten';
}
