/* ══════════════════════════════════════════════════════════════════
   Team-Termine im Kalender.

   Bis v.35.30.0 zeigte der Kalender-Tab nur das alte Familienmodell
   (families, Reisen, eigene Kalendertage). Die Termine der Gruppen —
   groups/{gid}/events, das, was ein Kader, ein Verein, ein Gym eintraegt —
   standen unter "Gruppe" und in "Heute", im Kalender aber nirgends. Wer
   in zwei Teams ist, hatte also genau dort, wo man nachschaut, was diese
   Woche ansteht, eine Luecke.

   Hier steht, wie aus Gruppen und ihren Terminen Kalendereintraege
   werden. Jede Gruppe ist eine Quelle mit eigener Farbe, einzeln ein-
   und ausschaltbar; ein Lager steht an jedem seiner Tage; ein
   abgesagter Termin bleibt sichtbar, aber als abgesagt (termine.js
   erklaert, warum Absagen nicht Loeschen ist).

   Reines Modul: kein Firebase, kein DOM. Das Lesen macht planner.html
   ueber groups.js, hier steht nur die Umrechnung — damit sie echt
   testbar ist.
   ══════════════════════════════════════════════════════════════════ */

import { artName, istAbgesagt, istIsoTag, istMehrtaegig, zeitraum } from './termine.js';

/* Wie ueberall: tOr, nicht t() — und ohne i18n.js (Tests, erster Start)
   werden die Platzhalter trotzdem eingesetzt. */
function t(key, deutsch, vars) {
  const i18n = globalThis.window?.TVZAI18n;
  if (i18n) return i18n.tOr(key, deutsch, vars);
  return String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) =>
    (vars && vars[name] !== undefined ? vars[name] : ganz));
}

/** Die Farbe eines Teams: die gewaehlte, wenn sie in der Palette steht,
    sonst eine feste aus der Kennung — dieselbe Regel wie fuer die
    Kalendergruppen, damit ein Team nicht bei jedem Laden die Farbe
    wechselt. */
export function teamFarbe(gruppe, palette) {
  if (palette.includes(gruppe?.farbe)) return gruppe.farbe;
  const hash = [...String(gruppe?.id || '')]
    .reduce((wert, zeichen) => ((wert * 31) + zeichen.charCodeAt(0)) | 0, 0);
  return palette[Math.abs(hash) % palette.length];
}

/** Die Farben ALLER Teams einer Person — verschieden, solange die
    Palette reicht. Zwei Teams in derselben Farbe machen die Quellen
    wertlos; genau das passierte mit teamFarbe allein (acht Farben, und
    die Kennung trifft zufaellig). Gewaehlte Farben gehen vor, die
    uebrigen Teams bekommen in fester Reihenfolge ihre Wunschfarbe aus
    der Kennung oder, wenn die vergeben ist, die naechste freie. */
export function teamFarben(gruppen, palette) {
  const raus = new Map();
  const vergeben = new Set();
  const liste = [...(gruppen || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const g of liste) {
    if (palette.includes(g.farbe)) { raus.set(g.id, g.farbe); vergeben.add(g.farbe); }
  }
  for (const g of liste) {
    if (raus.has(g.id)) continue;
    const wunsch = palette.indexOf(teamFarbe({ id: g.id }, palette));
    let farbe = palette[wunsch];
    for (let i = 0; i < palette.length && vergeben.has(farbe); i++) {
      farbe = palette[(wunsch + i + 1) % palette.length];
    }
    raus.set(g.id, farbe);
    vergeben.add(farbe);
  }
  return raus;
}

/** Die Tage, an denen ein Termin im Raster steht — von bis bis, hoechstens
    400, wie die uebrigen Eintraege des Kalenders. */
export function tageVon(termin) {
  if (!istIsoTag(termin?.von)) return [];
  const ende = istMehrtaegig(termin) ? termin.bis : termin.von;
  const tage = [];
  const tag = new Date(`${termin.von}T12:00:00`);
  const letzter = new Date(`${ende}T12:00:00`);
  while (tag <= letzter && tage.length < 400) {
    const m = String(tag.getMonth() + 1).padStart(2, '0');
    const d = String(tag.getDate()).padStart(2, '0');
    tage.push(`${tag.getFullYear()}-${m}-${d}`);
    tag.setDate(tag.getDate() + 1);
  }
  return tage;
}

/**
 * Aus Gruppen und ihren Terminen die Kalendereintraege, nach Tag.
 *
 * @param gruppen          [{ id, name, art, farbe }]
 * @param termineJeGruppe  Map gid → Termine
 * @param versteckt        Set der ausgeschalteten Gruppen
 * @param palette          die Kalenderfarben
 * @returns                { 'JJJJ-MM-TT': [eintrag, …] }
 */
export function teamEintraege(gruppen, termineJeGruppe, { versteckt = new Set(), palette } = {}) {
  const raus = {};
  /* Aus ALLEN Teams gerechnet, nicht nur den sichtbaren: sonst wechselte
     ein Team die Farbe, sobald man ein anderes ausschaltet. */
  const farben = teamFarben(gruppen, palette);
  for (const gruppe of gruppen || []) {
    if (versteckt.has(gruppe.id)) continue;
    const farbe = farben.get(gruppe.id);
    for (const termin of termineJeGruppe?.get(gruppe.id) || []) {
      if (!istIsoTag(termin?.von)) continue;
      const art = artName(termin, gruppe.art);
      const titel = String(termin.titel || '').trim() || art;
      const abgesagt = istAbgesagt(termin);
      /* Eine Uhrzeit hat nur der eintaegige Termin. Ein Lager mit
         Anreisezeit stuende sonst an allen sieben Tagen um 08:00. */
      const zeit = !istMehrtaegig(termin) && termin.zeit ? termin.zeit : '';
      for (const tag of tageVon(termin)) {
        (raus[tag] ||= []).push({
          kind: 'team',
          color: farbe,
          title: abgesagt ? t('kal.abgesagt', 'Abgesagt: {titel}', { titel }) : titel,
          time: zeit,
          sourceName: gruppe.name || t('nav.gruppe', 'Gruppe'),
          art,
          abgesagt,
          /* location: so liest die Listenansicht des Kalenders den Ort,
             ohne dass sie fuer Team-Termine eine eigene Zeile braucht. */
          ref: { ...termin, location: termin.ort || '', gid: gruppe.id, gruppenName: gruppe.name || '' },
        });
      }
    }
  }
  return raus;
}

/** Der Text der Terminkarte: Art, Zeitraum, Ort, Gruppe — und die Notiz. */
export function teamTerminText(eintrag) {
  const termin = eintrag?.ref || {};
  const zeile = [eintrag?.art, zeitraum(termin), termin.ort, termin.gruppenName]
    .map(teil => String(teil || '').trim())
    .filter(Boolean)
    .join(' · ');
  const notiz = String(termin.notiz || '').trim();
  const grund = String(termin.absageGrund || '').trim();
  const absage = !eintrag?.abgesagt ? ''
    : grund ? t('kal.abgesagtGrund', 'Abgesagt: {grund}', { grund })
    : t('kal.abgesagtHinweis', 'Dieser Termin ist abgesagt.');
  return [zeile, absage, notiz].filter(Boolean).join('\n\n');
}
