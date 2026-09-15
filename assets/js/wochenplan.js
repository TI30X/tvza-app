/* ══════════════════════════════════════════════════════════════════
   Der Wochenplan — die Woche so, wie der Trainer sie gebaut hat.

   ── Warum es das gibt ─────────────────────────────────────────────
   training-parser.js liest aus der Kadervorlage ein Raster: sieben
   Tage mal Vormittag/Nachmittag, und in jeder Zelle steht, welche
   Einheit dran ist. Der Parser ordnet jedem Eintrag sogar sein
   Einheitenblatt zu (matchUnit).

   Die Gruppenseite hat davon nie etwas gezeigt. Sie listete die
   Blätter — alphabetisch, ohne Tag, ohne Datum. Wer am Dienstag früh
   im Kraftraum steht, muss aber nicht wissen, wie das Blatt heisst,
   sondern was heute dran ist. Die alte persönliche Seite
   (pages/training.html) konnte das; beim Umbau auf Gruppen ging es
   verloren.

   ── Kein DOM, kein Firebase ───────────────────────────────────────
   Damit das prüfbar bleibt. Was der Browser dazutut, steht in
   assets/js/feature/gruppe/.
   ══════════════════════════════════════════════════════════════════ */

import { uebungen, fortschritt } from './einheit.js';

/**
 * Die Tage der Woche, flach genug zum Zeichnen.
 *
 * Der Parser schachtelt Tag → Slot → Einträge. Zum Zeichnen ist der
 * Slot aber kein Behälter, sondern eine Beschriftung ("Vormittag"),
 * darum wandert er in den Eintrag hinein.
 *
 * @param {object} programm Ein geparstes Programm
 * @returns {Array<{key:string,name:string,datum:string,eintraege:Array}>}
 */
export function wochenTage(programm) {
  const tage = Array.isArray(programm?.days) ? programm.days : [];
  return tage
    .filter(t => t && t.key)
    .map(t => ({
      key: t.key,
      name: t.name || t.key,
      datum: t.date || '',
      eintraege: (Array.isArray(t.slots) ? t.slots : []).flatMap(s =>
        (Array.isArray(s?.items) ? s.items : [])
          .filter(i => i && String(i.title || '').trim())
          .map(i => ({
            titel: String(i.title).trim(),
            /* Leer heisst: im Plan genannt, aber ohne Blatt. "evtl.
               Spiel (Tennis…)" ist kein Versehen des Trainers,
               sondern eine Ansage ohne Übungen. */
            unit: String(i.unit || ''),
            /* "9–11 Uhr" aus der Zelle darunter (training-parser.js). */
            zeit: String(i.time || ''),
            slot: s.name || '',
            slotKey: s.key || '',
          }))),
    }));
}

/** Der Tag mit diesem Datum, oder null. */
export function tagFuer(tage, iso) {
  if (!iso) return null;
  return (tage || []).find(t => t.datum === iso) || null;
}

/**
 * Welcher Tag beim Öffnen gezeigt wird.
 *
 * Heute, wenn die Woche heute enthält — das ist der Normalfall und
 * der ganze Zweck der Ansicht. Sonst der erste Tag, an dem etwas
 * geplant ist: bei einer vergangenen oder künftigen Woche ist ein
 * leerer Sonntag die schlechteste Antwort.
 */
export function standardTag(tage, heute) {
  const liste = tage || [];
  if (!liste.length) return '';
  const heutiger = tagFuer(liste, heute);
  if (heutiger) return heutiger.key;
  return (liste.find(t => t.eintraege.length) || liste[0]).key;
}

/**
 * Die Protokolle nach Datum, damit ein Tag sein eigenes findet.
 *
 * ladeProtokolle() gibt eine Liste; gezeichnet wird pro Tag. Ohne
 * diesen Schritt suchte jeder Tag die ganze Liste noch einmal durch.
 */
export function nachDatum(protokolle) {
  const raus = {};
  for (const p of protokolle || []) {
    if (p?.datum) raus[p.datum] = p;
  }
  return raus;
}

/**
 * Wie weit ein Eintrag an seinem Tag gediehen ist.
 *
 * null heisst "nichts zu zählen" — ein Eintrag ohne Blatt hat keine
 * Übungen, und 0/0 wäre eine Behauptung über etwas, das die App gar
 * nicht kennt.
 */
export function eintragFortschritt(programm, eintrag, datum, protokolleNachDatum) {
  if (!eintrag?.unit) return null;
  const items = uebungen(programm, eintrag.unit);
  if (!items.length) return null;
  const protokoll = (protokolleNachDatum || {})[datum] || { units: {} };
  return fortschritt(items, protokoll, eintrag.unit);
}

/**
 * Ein Punkt je Eintrag mit Blatt — für den Wochenstreifen.
 *
 * Sieben Tage nebeneinander haben keinen Platz für "3/8". Ein voller
 * Punkt sagt genug: an dem Tag ist etwas fertig geworden.
 */
export function tagPunkte(programm, tag, protokolleNachDatum) {
  return (tag?.eintraege || [])
    .map(e => eintragFortschritt(programm, e, tag.datum, protokolleNachDatum))
    .filter(Boolean)
    .map(f => ({ fertig: f.fertig }));
}

/**
 * Der Kopf der Woche: was für eine Woche das ist und für wen.
 *
 * Nur die Bausteine, nicht der fertige Satz — Datumsformate gehören
 * durch Intl und damit in die Ansicht, nicht in ein Modul, das keine
 * Sprache kennt.
 */
export function wochenKopf(programm) {
  return {
    kw: Number.isFinite(programm?.kw) ? programm.kw : null,
    tw: Number.isFinite(programm?.trainingWeek) ? programm.trainingWeek : null,
    von: programm?.dateRange?.start || '',
    bis: programm?.dateRange?.end || '',
    athlet: String(programm?.athlete || ''),
    label: String(programm?.weekLabel || ''),
  };
}

/**
 * Das Ziel eines Eintrags: der Einheiten-Player, am richtigen Tag.
 *
 * Das Datum wandert MIT. Ein Protokoll hängt an einem Tag, und der
 * Tag, der zählt, ist der geplante — nicht der, an dem jemand die
 * Zeile antippt. Sonst stünde eine am Mittwoch nachgeholte
 * Dienstagseinheit für immer als offen im Dienstag.
 */
export function einheitZiel(gid, planId, eintrag, datum, zurueck = '') {
  const q = new URLSearchParams({ g: gid, p: planId });
  if (eintrag?.unit) q.set('u', eintrag.unit);
  if (datum) q.set('d', datum);
  /* Woher man kam, damit "Zurueck" im Player dorthin fuehrt. Nur ein
     Name aus RUECKWEGE — die Adresse ist sichtbar und aenderbar, und
     ein freier Pfad darin waere ein Weg, jemanden anderswohin zu
     schicken. */
  if (RUECKWEGE[zurueck]) q.set('z', zurueck);
  return `./einheit.html?${q.toString()}`;
}

/** Die Seiten, in die der Player zurueckfuehren darf. */
export const RUECKWEGE = Object.freeze({
  gruppe: './gruppe.html',
  training: './training.html',
  kalender: './planner.html',
});

/** Wohin "Zurueck" im Player fuehrt — ein Unbekannter faellt auf die Gruppe. */
export function rueckweg(z) {
  return RUECKWEGE[z] || RUECKWEGE.gruppe;
}

/**
 * Was eine eingelesene Datei enthaelt — fuer die Vorschau, bevor ein
 * Trainer sie veroeffentlicht. Er soll sehen, dass die Woche richtig
 * gelesen wurde, BEVOR der Kader sie bekommt: sieben Tage, welche
 * Einheiten, wie viele Uebungen.
 */
export function planZusammenfassung(programm) {
  const units = programm?.units && typeof programm.units === 'object' ? programm.units : {};
  const einheiten = Object.values(units).filter(u => u?.id);
  const tage = wochenTage(programm);
  return {
    ...wochenKopf(programm),
    einheiten: einheiten.length,
    uebungen: einheiten.reduce((n, u) => n + uebungen(programm, u.id).length, 0),
    tage: tage.map(t => ({
      key: t.key,
      name: t.name,
      datum: t.datum,
      titel: t.eintraege.map(e => e.titel),
    })),
    /* Eintraege ohne Blatt zaehlen — ein Tippfehler im Wochenplan
       ("Kraft Bein" statt "Kraft Beine") zeigt sich genau hier. */
    ohneBlatt: tage.flatMap(t => t.eintraege.filter(e => !e.unit).map(e => e.titel)),
  };
}

/* ══ Die Woche als Kalender (v.35.42.0) ═════════════════════════════
   Bis dahin zeigte die Ansicht EINEN Plan — eine eingelesene Excel —
   und man wechselte über eine Auswahl. Michel: "Kann man nicht Woche
   vor oder zurück?" Und die Termine der Gruppe standen in einer eigenen
   Liste daneben. Jetzt ist die Woche ein Kalender: jede Kalenderwoche
   sammelt, was in ihr liegt — die Tage aller Pläne und alle Termine.

   Alles hier rechnet mit ISO-Tagen ('2026-08-05') in Ortszeit und ohne
   Uhrzeit. Ein Date mit 12 Uhr statt Mitternacht, damit eine
   Zeitumstellung den Tag nicht verschiebt. */

const pad = n => String(n).padStart(2, '0');
const alsTag = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mittag = iso => new Date(`${iso}T12:00:00`);

/** Der Tag n Tage nach iso (n darf negativ sein). */
export function plusTage(iso, n) {
  const d = mittag(iso);
  d.setDate(d.getDate() + n);
  return alsTag(d);
}

/** Der Montag der Woche, in der iso liegt. */
export function montagVon(iso) {
  const d = mittag(iso);
  return plusTage(iso, -((d.getDay() + 6) % 7));
}

/** Die sieben Tage ab einem Montag. */
export function wocheAb(montag) {
  return Array.from({ length: 7 }, (_, i) => plusTage(montag, i));
}

/** Die Kalenderwoche nach ISO 8601 — dieselbe Zahl wie "KW 31" in der Vorlage. */
export function kwVon(iso) {
  const donnerstag = mittag(plusTage(montagVon(iso), 3));
  const jan4 = new Date(donnerstag.getFullYear(), 0, 4, 12);
  const ersteWoche = mittag(montagVon(alsTag(jan4)));
  return 1 + Math.round((donnerstag - ersteWoche) / (7 * 864e5) - 3 / 7);
}

/** Der Montag der ISO-Kalenderwoche kw im Jahr jahr. */
export function montagDerKw(jahr, kw) {
  const jan4 = alsTag(new Date(jahr, 0, 4, 12));
  return plusTage(montagVon(jan4), (kw - 1) * 7);
}

/**
 * Die Tage eines Plans mit Datum.
 *
 * Die Kadervorlage nennt den Zeitraum ("03.08. - 09.08.2026"), und der
 * Parser gibt jedem Tag sein Datum. Fehlt der Zeitraum, aber die KW
 * steht da, liegt der Plan in dieser KW des laufenden Jahres. Ohne
 * beides hat ein Plan keinen Platz im Kalender.
 */
export function planTageMitDatum(programm, heute) {
  const tage = wochenTage(programm);
  if (tage.some(t => t.datum)) return tage.filter(t => t.datum);
  const kw = wochenKopf(programm).kw;
  if (!kw || !heute) return [];
  const montag = montagDerKw(Number(heute.slice(0, 4)), kw);
  return tage.slice(0, 7).map((t, i) => ({ ...t, datum: plusTage(montag, i) }));
}

/**
 * Die Einheiten eines Tages, in der Folge des Plans — nur die mit Blatt
 * (v.35.64.0). Michel: "Aus dem Wochenplan soll ein Athlet die
 * zugewiesene Einheit direkt öffnen … gibt es an einem Tag mehrere,
 * nur diese." Der Player zeigt keine Liste aller Einheiten der Woche
 * mehr, sondern höchstens die des Tages.
 */
export function einheitenAmTag(programm, datum, heute = '') {
  const tag = planTageMitDatum(programm, heute || datum).find(t => t.datum === datum);
  const ids = [];
  for (const e of tag?.eintraege || []) {
    if (e.unit && !ids.includes(e.unit) && uebungen(programm, e.unit).length) ids.push(e.unit);
  }
  return ids;
}

/* Wann ein Plan veröffentlicht wurde — für "der neuere gewinnt". */
function zeitVon(plan) {
  const e = plan?.erstelltAm;
  if (!e) return 0;
  if (typeof e.toMillis === 'function') return e.toMillis();
  if (Number.isFinite(e.seconds)) return e.seconds * 1000;
  const n = Date.parse(e);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Die Woche ab montag: je Tag die Termine und die Einträge der Pläne.
 *
 * @param {object} o
 * @param {string} o.montag
 * @param {Array<{gid:string, plan:object, programm:object, gruppe?:string}>} o.quellen
 * @param {Array<object>} [o.termine]  Termine mit gid (und gruppe) am Termin
 * @param {string} [o.heute]
 *
 * Deckt derselbe Mensch denselben Tag mit zwei Plänen ab — die Excel
 * derselben Woche zweimal eingelesen —, gewinnt der neuere. Ein Plan
 * "für alle" und einer "für Timo" am selben Tag stehen beide da: das
 * sind zwei Ansagen, keine Dublette.
 */
export function agendaTage({ montag, quellen = [], termine = [], heute = '' }) {
  const mitTagen = quellen.map(q => ({ ...q, tage: planTageMitDatum(q.programm, heute) }));
  return wocheAb(montag).map(datum => {
    const beste = new Map();
    for (const q of mitTagen) {
      const tag = q.tage.find(t => t.datum === datum);
      if (!tag) continue;
      const wer = `${q.gid}|${q.plan?.fuer || ''}`;
      const bisher = beste.get(wer);
      if (!bisher || zeitVon(q.plan) > zeitVon(bisher.q.plan)) beste.set(wer, { q, tag });
    }
    const eintraege = [...beste.values()].flatMap(({ q, tag }) =>
      tag.eintraege.map(e => ({ ...e, gid: q.gid, planId: q.plan?.id || '', programm: q.programm, gruppe: q.gruppe || '' })));
    const amTag = termine
      .filter(t => laeuft(t, datum))
      .sort((a, b) => String(a.zeit || '').localeCompare(String(b.zeit || '')));
    return { datum, termine: amTag, eintraege, heute: datum === heute };
  });
}

/* Ein Termin läuft an einem Tag — mehrtägig (Lager) an jedem Tag dazwischen. */
function laeuft(termin, tag) {
  const von = termin?.von;
  if (!von) return false;
  const bis = termin.bis && termin.bis > von ? termin.bis : von;
  return von <= tag && tag <= bis;
}

/**
 * Welche Woche beim Öffnen gezeigt wird.
 *
 * Die laufende, wenn darin etwas steht. Sonst die nächste Woche mit
 * einem Plan, und gibt es keine, die letzte — wer die Excel von KW 31
 * im September einliest, soll nicht sechsmal zurückblättern müssen, um
 * sie zu sehen.
 */
export function startWoche({ heute, quellen = [], termine = [] }) {
  const jetzt = montagVon(heute);
  const inWoche = m => agendaTage({ montag: m, quellen, termine, heute })
    .some(t => t.termine.length || t.eintraege.length);
  if (inWoche(jetzt)) return jetzt;
  const planWochen = [...new Set(quellen.flatMap(q => planTageMitDatum(q.programm, heute).map(t => montagVon(t.datum))))].sort();
  return planWochen.find(m => m > jetzt) || planWochen[planWochen.length - 1] || jetzt;
}

/**
 * Alle Einheiten der Pläne als Liste mit Datum (v.35.59.0) — für den
 * Kalender und den Assistenten. Michel: "wenn ich eine Excel hochlade …
 * steht am Dienstag, 8. September Sprungprogramm — der Assistent hat
 * keine Ahnung von diesem Sprungprogramm". Der Kalender zeigte die Pläne
 * nie, und die Pille schickte nur Termine mit.
 *
 * Dieselbe Regel wie in der Woche (agendaTage): deckt derselbe Mensch
 * denselben Tag mit zwei Plänen ab, gewinnt der neuere.
 *
 * @param {Array<{gid:string, plan:object, programm:object, gruppe?:string}>} quellen
 * @returns [{ datum, titel, zeit, slot, unit, gid, gruppe, planId, fuer }]
 */
export function planEinheiten(quellen = [], heute = '') {
  const beste = new Map();
  for (const q of quellen) {
    for (const tag of planTageMitDatum(q.programm, heute)) {
      const wer = `${q.gid}|${q.plan?.fuer || ''}|${tag.datum}`;
      const bisher = beste.get(wer);
      if (!bisher || zeitVon(q.plan) > zeitVon(bisher.q.plan)) beste.set(wer, { q, tag });
    }
  }
  return [...beste.values()]
    .flatMap(({ q, tag }) => tag.eintraege.map(e => ({
      datum: tag.datum, titel: e.titel, zeit: e.zeit, slot: e.slot, slotKey: e.slotKey, unit: e.unit,
      gid: q.gid, gruppe: q.gruppe || '', planId: q.plan?.id || '', fuer: q.plan?.fuer || '',
    })))
    /* Nur nach Datum — innerhalb des Tages bleibt die Folge des Plans
       (Vormittag vor Nachmittag; das Alphabet sähe das umgekehrt). */
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Welche bestehenden Pläne ein neuer ersetzt (v.35.44.0): derselbe
 * Mensch (fuer — "alle" ist auch einer) und mindestens ein gemeinsamer
 * Tag. In der Woche gewinnt ohnehin der neuere (agendaTage); der ältere
 * läge sonst für immer in Firestore. Gelöscht wird er erst, wenn die
 * Leitung es bestätigt.
 *
 * @param {Array<{fuer:string, programm:object}>} neue
 * @param {Array<{plan:object, programm:object}>} bestehende
 * @returns die Einträge aus bestehende, die ersetzt werden
 */
export function ersetztePlaene(neue = [], bestehende = [], heute = '') {
  const tage = programm => new Set(planTageMitDatum(programm, heute).map(t => t.datum));
  const neuJe = neue.map(n => ({ fuer: n.fuer, tage: tage(n.programm) }));
  return bestehende.filter(b => {
    if (!b?.plan?.fuer || !b.programm) return false;
    const alt = tage(b.programm);
    return neuJe.some(n => n.fuer === b.plan.fuer && [...n.tage].some(d => alt.has(d)));
  });
}

/**
 * Der nächste Termin nach der gezeigten Woche — "Als Nächstes".
 * Wer eine ruhige Woche sieht, soll trotzdem wissen, dass in drei
 * Wochen ein Rennen ist.
 */
export function naechsterNach(termine, montag) {
  const ende = plusTage(montag, 6);
  return [...(termine || [])]
    .filter(t => t?.von && t.von > ende)
    .sort((a, b) => `${a.von}${a.zeit || ''}`.localeCompare(`${b.von}${b.zeit || ''}`))[0] || null;
}

/** Der Titel, den der Trainer nicht tippen muss: die Woche selbst. */
export function planTitelVorschlag(programm) {
  const kopf = wochenKopf(programm);
  if (kopf.kw) return kopf.tw ? `KW ${kopf.kw} · TW ${kopf.tw}` : `KW ${kopf.kw}`;
  return kopf.label || '';
}

/**
 * Wer an einem Tag was trainiert — für die Übersicht der Leitung
 * (v.35.65.0). Michel: "Trainer sollen pro Plan, Datum und Athlet sehen,
 * was begonnen und abgeschlossen ist." Je Person gilt der neueste Plan
 * für sie und der neueste für alle (wie agendaTage); ein Plan für alle
 * gilt für die, die nicht leiten.
 *
 * @param o.quellen    [{ plan, programm }]
 * @param o.mitglieder [{ uid, name, rolle }]
 * @param o.leitet     (rolle) => boolean
 * @returns [{ uid, name, einheiten: [{ planId, fuer, unit, titel, items, zeit }] }]
 */
export function fortschrittZeilen({ quellen = [], mitglieder = [], datum = '', leitet = () => false } = {}) {
  const beste = new Map();
  for (const q of quellen) {
    if (!q?.programm) continue;
    const tag = planTageMitDatum(q.programm, datum).find(t => t.datum === datum);
    if (!tag) continue;
    const fuer = q.plan?.fuer || 'alle';
    const bisher = beste.get(fuer);
    if (!bisher || zeitVon(q.plan) > zeitVon(bisher.q.plan)) beste.set(fuer, { q, tag });
  }
  const einheitenVon = eintrag => {
    if (!eintrag) return [];
    const { q, tag } = eintrag;
    const raus = [];
    for (const e of tag.eintraege) {
      if (!e.unit || raus.some(x => x.unit === e.unit)) continue;
      const items = uebungen(q.programm, e.unit);
      if (!items.length) continue;
      raus.push({
        planId: q.plan?.id || '', fuer: q.plan?.fuer || 'alle', unit: e.unit,
        titel: q.programm?.units?.[e.unit]?.title || e.titel, items, zeit: e.zeit || '',
      });
    }
    return raus;
  };
  const fuerAlle = beste.get('alle');
  return mitglieder
    .filter(m => m?.uid && (beste.has(m.uid) || (fuerAlle && !leitet(m.rolle))))
    .map(m => ({
      uid: m.uid,
      name: m.name || '',
      einheiten: [...einheitenVon(beste.get(m.uid)), ...(leitet(m.rolle) ? [] : einheitenVon(fuerAlle))],
    }))
    .filter(z => z.einheiten.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Eine Vorlage auf eine neue Woche legen (v.35.65.0). Michel: "Trainer
 * sollen wiederverwendbare Vorlagen erstellen und zuweisen können." Die
 * Vorlage bleibt, wie sie ist; der Plan bekommt eine KOPIE mit den Tagen
 * ab montag — was schon trainiert ist, hängt am Protokoll und ändert
 * sich nie mit der Vorlage. Die Kalenderwoche der Excel stimmt danach
 * nicht mehr und fällt weg (keine selbst gerechnete zweite Zahl, siehe
 * Falle 10).
 */
export function vorlageAufWoche(programm, montag) {
  const kopie = JSON.parse(JSON.stringify(programm || {}));
  const tage = Array.isArray(kopie.days) ? kopie.days : [];
  const FOLGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  tage.forEach((t, i) => {
    const n = FOLGE.indexOf(String(t?.key || '').slice(0, 2).toLowerCase());
    const stelle = n >= 0 ? n : i;
    if (t && stelle < 7) t.date = plusTage(montag, stelle);
  });
  kopie.dateRange = { start: montag, end: plusTage(montag, 6) };
  kopie.kw = null;
  kopie.trainingWeek = null;
  kopie.weekLabel = '';
  return kopie;
}
