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

/** Der Titel, den der Trainer nicht tippen muss: die Woche selbst. */
export function planTitelVorschlag(programm) {
  const kopf = wochenKopf(programm);
  if (kopf.kw) return kopf.tw ? `KW ${kopf.kw} · TW ${kopf.tw}` : `KW ${kopf.kw}`;
  return kopf.label || '';
}
