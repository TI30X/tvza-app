/* ══════════════════════════════════════════════════════════════════
   Die Einträge des Kalenders — rein, ohne Firebase und ohne DOM.

   Bis v.35.48.0 rechnete der Kalender jeden Eintrag in eine Liste je
   TAG um (eventMap, dayProgramMap). Ein Lager von vier Tagen stand
   darum viermal in der Liste und als vier einzelne Schnipsel im Monat,
   und zwei Termine zur selben Zeit lagen in der Woche übereinander.

   Hier ist ein Eintrag, was er ist: ein Zeitraum von…bis. Daraus
   rechnen drei Funktionen die drei Ansichten:

     agenda()        die Liste — ein Lager steht einmal, an seinem
                     Anfang, und heute noch einmal, solange es läuft
     monatsWochen()  der Monat — mehrtägiges als ein Balken über die
                     Tage, in Spuren, damit nichts übereinander liegt
     zeitRaster()    Tag / 3 Tage / Woche — ganztägiges oben als
                     Balken, der Rest nach Uhrzeit, Überschneidungen
                     nebeneinander

   Alles mit ISO-Tagen ('2026-09-18') und Uhrzeiten ('18:00') als
   Zeichenketten — die vergleichen sich richtig, ohne Zeitzonen.
   ══════════════════════════════════════════════════════════════════ */

import { artName, istAbgesagt, istIsoTag } from '../../termine.js';
import { plusTage, montagVon } from '../../wochenplan.js';

/* ── Tage und Zeiten ──────────────────────────────────────────────── */

/** Wie viele Tage von a bis b (b − a), über Mittag gerechnet. */
export function tageZwischen(a, b) {
  const von = new Date(`${a}T12:00:00`), bis = new Date(`${b}T12:00:00`);
  return Math.round((bis - von) / 864e5);
}

/** Minuten seit Mitternacht aus '18:30'; null ohne gültige Zeit. */
export function minutenVon(zeit) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(zeit || '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const hoechstens = (a, b) => (a > b ? b : a);
const mindestens = (a, b) => (a < b ? b : a);

/* ── Aus den Quellen ein Eintrag ──────────────────────────────────────
   Ein Eintrag: { id, art, von, bis, zeit, bisZeit, titel, ort, quelle,
   farbe, typ, abgesagt, erledigt, stops, ref }. art ist 'team' (ein
   Termin der Gruppe), 'reise' (ein geteilter Termin der Gruppe mit
   Programm), 'tag' (ein eigener Termin) oder 'erinnerung'. */

export function ausTeamTermin(termin, gruppe, farbe) {
  if (!istIsoTag(termin?.von)) return null;
  let von = termin.von;
  let bis = istIsoTag(termin.bis) && termin.bis > termin.von ? termin.bis : termin.von;
  /* Seit v.35.50.0 trägt ein Termin ein Programm (was vorher nur die
     Reise konnte). Wie dort: reicht es über Von–Bis hinaus, reicht der
     Eintrag mit. */
  const programm = Array.isArray(termin.programm) ? termin.programm : [];
  for (const stop of programm) {
    if (!istIsoTag(stop?.date)) continue;
    if (stop.date < von) von = stop.date;
    if (stop.date > bis) bis = stop.date;
  }
  const eintaegig = von === bis && von === termin.von;
  const typ = artName(termin, gruppe?.art);
  return {
    id: `team:${gruppe?.id || ''}:${termin.id || termin.von}`,
    art: 'team',
    von,
    bis,
    /* Eine Uhrzeit hat nur der eintägige Termin — ein Lager mit
       Anreisezeit stünde sonst an allen Tagen um 08:00. */
    zeit: eintaegig ? String(termin.zeit || '') : '',
    bisZeit: eintaegig && termin.zeit ? String(termin.bisZeit || '') : '',
    titel: String(termin.titel || '').trim() || typ,
    ort: String(termin.ort || ''),
    quelle: gruppe?.name || '',
    farbe,
    typ,
    abgesagt: istAbgesagt(termin),
    erledigt: false,
    stops: programm,
    ref: { ...termin, location: termin.ort || '', gid: gruppe?.id || '', gruppenName: gruppe?.name || '' },
  };
}

/* Ein Programm (aus einer eingelesenen HTML) kann Tage ausserhalb des
   eigenen Von–Bis tragen; der Eintrag reicht dann bis dorthin. */
export function ausReise(reise, farbe, quelle) {
  const programm = (reise?.itinerary || []).filter(stop => istIsoTag(stop?.date));
  let von = istIsoTag(reise?.startDate) ? reise.startDate : '';
  let bis = istIsoTag(reise?.endDate) && reise.endDate >= von ? reise.endDate : von;
  for (const stop of programm) {
    if (!von || stop.date < von) von = stop.date;
    if (!bis || stop.date > bis) bis = stop.date;
  }
  if (!von) return null;
  return {
    id: `reise:${reise.id}`,
    art: 'reise',
    von,
    bis: bis || von,
    zeit: von === bis ? String(reise.startTime || '') : '',
    bisZeit: von === bis ? String(reise.endTime || '') : '',
    titel: String(reise.name || '').trim() || 'Termin',
    ort: String(reise.destination || ''),
    quelle,
    farbe,
    typ: '',
    abgesagt: false,
    erledigt: false,
    stops: reise.itinerary || [],
    ref: reise,
  };
}

export function ausTag(tag, farbe, quelle) {
  if (!istIsoTag(tag?.date)) return null;
  const bis = istIsoTag(tag.endDate) && tag.endDate > tag.date ? tag.endDate : tag.date;
  return {
    id: `tag:${tag.id}`,
    art: 'tag',
    von: tag.date,
    bis,
    zeit: String(tag.startTime || ''),
    bisZeit: String(tag.endTime || ''),
    titel: String(tag.title || '').trim() || 'Termin',
    ort: String(tag.location || ''),
    quelle,
    farbe,
    typ: '',
    abgesagt: false,
    erledigt: false,
    stops: [],
    ref: tag,
  };
}

export function ausErinnerung(erinnerung, farbe, quelle) {
  if (!istIsoTag(erinnerung?.date)) return null;
  return {
    id: `erinnerung:${erinnerung.id}`,
    art: 'erinnerung',
    von: erinnerung.date,
    bis: erinnerung.date,
    zeit: String(erinnerung.time || ''),
    bisZeit: '',
    titel: String(erinnerung.title || '').trim() || 'Erinnerung',
    ort: '',
    quelle,
    farbe,
    typ: '',
    abgesagt: false,
    erledigt: erinnerung.completed === true,
    stops: [],
    ref: erinnerung,
  };
}

/** Ganztägig: ohne Uhrzeit, oder über mehrere Tage. */
export const ganztaegig = e => !e.zeit || e.bis > e.von;

/* Die feste Reihenfolge an einem Tag: Ganztägiges zuerst (es rahmt den
   Tag), dann nach Uhrzeit, dann nach Titel — und Erledigtes ans Ende. */
export function vergleiche(a, b) {
  return Number(!!a.erledigt) - Number(!!b.erledigt)
    || Number(!ganztaegig(a)) - Number(!ganztaegig(b))
    || String(a.zeit).localeCompare(String(b.zeit))
    || (tageZwischen(b.von, b.bis) - tageZwischen(a.von, a.bis))
    || a.titel.localeCompare(b.titel, 'de');
}

/**
 * Alle sichtbaren Einträge aus den Quellen des Kalenders.
 *
 * @param {object} q
 * @param q.tage         eigene Termine (calendarDays)
 * @param q.erinnerungen eigene Erinnerungen
 * @param q.reisen       Termine der Gruppen mit Programm (trips)
 * @param q.teams        [{ gruppe, termine }] — die Termine je Gruppe
 * @param q.persoenlich  eigene Termine und Erinnerungen zeigen?
 * @param q.farbePersoenlich
 * @param q.farbeVon     gid → Farbe
 * @param q.nameVon      gid → Name der Gruppe
 */
export function sammeln({
  tage = [], erinnerungen = [], reisen = [], teams = [],
  persoenlich = true, farbePersoenlich, farbeVon = () => '', nameVon = () => '',
  persoenlichName = 'Persönlich',
} = {}) {
  const raus = [];
  if (persoenlich) {
    for (const tag of tage) raus.push(ausTag(tag, farbePersoenlich, persoenlichName));
    for (const r of erinnerungen) raus.push(ausErinnerung(r, farbePersoenlich, persoenlichName));
  }
  for (const reise of reisen) raus.push(ausReise(reise, farbeVon(reise.familyId), nameVon(reise.familyId)));
  for (const { gruppe, termine } of teams) {
    for (const termin of termine || []) raus.push(ausTeamTermin(termin, gruppe, farbeVon(gruppe.id)));
  }
  return raus.filter(Boolean).sort((a, b) => a.von.localeCompare(b.von) || vergleiche(a, b));
}

/** Die Programmpunkte eines Eintrags an einem Tag — nach Reihenfolge, sonst Zeit. */
export function stopsAm(eintrag, tag) {
  return (eintrag?.stops || [])
    .filter(stop => stop.date === tag || (!stop.date && tag === eintrag.von))
    .sort((a, b) => (Number.isFinite(a.order) && Number.isFinite(b.order)
      ? a.order - b.order
      : String(a.time || '99:99').localeCompare(String(b.time || '99:99'))));
}

/* ── Die Liste ─────────────────────────────────────────────────────── */

/**
 * Die Tage der Liste ab `ab`: jeder Tag mit etwas darin, und heute
 * immer (auch leer — sonst fehlt der Bezugspunkt).
 *
 * Ein mehrtägiger Eintrag steht EINMAL: an seinem ersten Tag (oder am
 * ersten Tag der Liste, wenn er vorher begann). Läuft er heute noch,
 * steht er heute ein zweites Mal, als "Tag 3 von 4" — heute ist der
 * Tag, an dem man nachschaut. Ein Programm mit Punkten an weiteren
 * Tagen steht an jedem dieser Tage mit seinen Punkten.
 *
 * @returns [{ tag, heute, vergangen, freiDavor, eintraege: [{ e, rolle, tagNr, tage, stops }] }]
 *          rolle: 'einzeln' | 'beginn' | 'weiter' (begann vor der Liste)
 *                 | 'laeuft' (heute, mittendrin) | 'programm'
 *                 | 'ueberfaellig' (offene Erinnerung von früher, bei heute)
 */
export function agenda(eintraege, { ab, heute }) {
  const nachTag = new Map();
  const legen = (tag, eintrag) => {
    if (!nachTag.has(tag)) nachTag.set(tag, []);
    nachTag.get(tag).push(eintrag);
  };
  for (const e of eintraege) {
    /* Eine offene Erinnerung von gestern ist heute noch zu tun — sie
       steht bei heute, als überfällig, nicht irgendwo oberhalb. */
    if (e.art === 'erinnerung' && !e.erledigt && e.von < heute && heute >= ab) {
      legen(heute, { e, rolle: 'ueberfaellig', tagNr: 1, tage: 1, stops: [] });
      continue;
    }
    if (e.bis < ab) continue;
    const tage = tageZwischen(e.von, e.bis) + 1;
    const erster = mindestens(e.von, ab);
    const rolle = tage === 1 ? 'einzeln' : e.von < ab ? 'weiter' : 'beginn';
    legen(erster, { e, rolle, tagNr: tageZwischen(e.von, erster) + 1, tage, stops: stopsAm(e, erster) });
    const belegt = new Set([erster]);
    if (tage > 1 && heute > erster && heute <= e.bis) {
      legen(heute, { e, rolle: 'laeuft', tagNr: tageZwischen(e.von, heute) + 1, tage, stops: stopsAm(e, heute) });
      belegt.add(heute);
    }
    for (const stop of e.stops || []) {
      if (!istIsoTag(stop.date) || stop.date < ab || belegt.has(stop.date)) continue;
      belegt.add(stop.date);
      legen(stop.date, {
        e, rolle: 'programm', tagNr: tageZwischen(e.von, stop.date) + 1, tage, stops: stopsAm(e, stop.date),
      });
    }
  }
  if (heute >= ab && !nachTag.has(heute)) nachTag.set(heute, []);
  const tage = [...nachTag.keys()].sort();
  return tage.map((tag, i) => ({
    tag,
    heute: tag === heute,
    vergangen: tag < heute,
    freiDavor: i ? tageZwischen(tage[i - 1], tag) - 1 : 0,
    eintraege: nachTag.get(tag).sort((a, b) =>
      Number(b.rolle === 'ueberfaellig') - Number(a.rolle === 'ueberfaellig') || vergleiche(a.e, b.e)),
  }));
}

/* ── Spuren ────────────────────────────────────────────────────────
   Balken über mehrere Spalten, so auf Zeilen verteilt, dass keiner
   einen anderen überdeckt: der längste zuerst, dann jeder in die
   oberste Zeile, in der er Platz hat. */
function spurenVerteilen(balken) {
  balken.sort((a, b) => a.start - b.start
    || (b.ende - b.start) - (a.ende - a.start)
    || vergleiche(a.e, b.e));
  const frei = [];
  for (const b of balken) {
    let spur = frei.findIndex(ende => ende < b.start);
    if (spur === -1) { spur = frei.length; frei.push(-1); }
    frei[spur] = b.ende;
    b.spur = spur;
  }
  return frei.length;
}

/** Balken eines Eintrags über eine Reihe von Tagen (Spalten). */
function balkenIn(e, tage) {
  const erster = tage[0], letzter = tage.at(-1);
  if (e.bis < erster || e.von > letzter) return null;
  return {
    e,
    start: tageZwischen(erster, mindestens(e.von, erster)),
    ende: tageZwischen(erster, hoechstens(e.bis, letzter)),
    links: e.von < erster,
    rechts: e.bis > letzter,
  };
}

/* ── Der Monat ─────────────────────────────────────────────────────── */

/**
 * Die Wochen eines Monats — nur so viele, wie der Monat braucht (4 bis 6).
 * Jede Woche trägt ihre Tage und ihre Balken in Spuren. Erledigte
 * Erinnerungen stehen im Monat nicht; sie sind abgehakt.
 *
 * @returns [{ montag, tage: [{ tag, imMonat, heute, wochenende }], balken, spuren }]
 */
export function monatsWochen(anker, eintraege, { heute } = {}) {
  const monat = anker.slice(0, 7);
  const [jahr, m] = monat.split('-').map(Number);
  const letzter = plusTage(`${m === 12 ? jahr + 1 : jahr}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  const erstesMontag = montagVon(`${monat}-01`);
  const anzahl = tageZwischen(erstesMontag, montagVon(letzter)) / 7 + 1;
  const sichtbar = eintraege.filter(e => !e.erledigt);
  return Array.from({ length: anzahl }, (_, w) => {
    const montag = plusTage(erstesMontag, w * 7);
    const tage = Array.from({ length: 7 }, (_, i) => plusTage(montag, i));
    const balken = sichtbar.map(e => balkenIn(e, tage)).filter(Boolean);
    const spuren = spurenVerteilen(balken);
    return {
      montag,
      tage: tage.map((tag, i) => ({ tag, imMonat: tag.slice(0, 7) === monat, heute: tag === heute, wochenende: i >= 5 })),
      balken,
      spuren,
    };
  });
}

/* ── Tag, 3 Tage, Woche ────────────────────────────────────────────── */

/**
 * Das Zeitraster über `tage`: oben die Balken für Ganztägiges (in
 * Spuren), darunter je Tag die Blöcke nach Uhrzeit. Was sich zeitlich
 * überschneidet, teilt sich die Breite (spalte von spalten) — bis
 * v.35.48.0 lagen zwei Termine um 18:00 genau übereinander.
 * Programmpunkte mit Uhrzeit stehen als eigene Blöcke im Raster.
 *
 * @returns { ganztags: { balken, spuren }, spalten: [{ tag, bloecke }] }
 */
export function zeitRaster(tage, eintraege) {
  const sichtbar = eintraege.filter(e => !e.erledigt);
  const ganz = sichtbar.filter(ganztaegig).map(e => balkenIn(e, tage)).filter(Boolean);
  const spuren = spurenVerteilen(ganz);
  const spalten = tage.map(tag => {
    const bloecke = [];
    for (const e of sichtbar) {
      if (!ganztaegig(e) && e.von === tag) {
        const start = minutenVon(e.zeit);
        if (start === null) continue;
        const bis = minutenVon(e.bisZeit);
        bloecke.push({ e, stop: null, start, ende: bis !== null && bis > start ? bis : start + 60 });
      }
      if (e.von <= tag && e.bis >= tag) {
        for (const stop of stopsAm(e, tag)) {
          const start = minutenVon(stop.time);
          if (start === null) continue;
          bloecke.push({ e, stop, start, ende: start + 45 });
        }
      }
    }
    return { tag, bloecke: nebeneinander(bloecke) };
  });
  return { ganztags: { balken: ganz, spuren }, spalten };
}

/* Blöcke, die sich überschneiden, bilden eine Gruppe; in der Gruppe
   bekommt jeder die erste freie Spalte, und alle teilen sich die Breite
   der breitesten Stelle. Ein Block wird mindestens 30 Minuten hoch
   gezeichnet — also überschneidet er sich auch so lange. */
function nebeneinander(bloecke) {
  bloecke.sort((a, b) => a.start - b.start || b.ende - a.ende);
  const raus = [];
  let gruppe = [], gruppenEnde = -1;
  const abschliessen = () => {
    const spaltenEnde = [];
    for (const b of gruppe) {
      let s = spaltenEnde.findIndex(ende => ende <= b.start);
      if (s === -1) { s = spaltenEnde.length; spaltenEnde.push(0); }
      spaltenEnde[s] = Math.max(b.ende, b.start + 30);
      b.spalte = s;
    }
    for (const b of gruppe) b.spalten = spaltenEnde.length;
    raus.push(...gruppe);
    gruppe = [];
  };
  for (const b of bloecke) {
    if (gruppe.length && b.start >= gruppenEnde) abschliessen();
    gruppe.push(b);
    gruppenEnde = Math.max(gruppenEnde, b.ende, b.start + 30);
  }
  if (gruppe.length) abschliessen();
  return raus;
}
