/* ══════════════════════════════════════════════════════════════════
   FIS-Punkte — die Rechnung.

   Im alpinen Skirennsport misst eine Punktzahl den Rückstand auf den
   Sieger, nicht die Platzierung. Ein zweiter Platz in einem starken
   Feld ist mehr wert als ein Sieg in einem schwachen — deshalb zählt
   die Zeit und nicht der Rang, und deshalb sind WENIGER Punkte besser.

   ── Die Formel ────────────────────────────────────────────────────

       Rennpunkte = (F × Tx / To) − F

   Tx ist die eigene Zeit in Sekunden, To die des Siegers, F der
   Disziplinfaktor. Bei gleicher Zeit wie der Sieger wird der Ausdruck
   zu F − F = 0. Der Faktor bestimmt, wie stark ein prozentualer
   Rückstand zu Buche schlägt: in der Abfahrt (1250) härter als im
   Slalom (730), weil dieselbe Sekunde dort einen kleineren Anteil der
   Fahrzeit ausmacht.

   ── Was hier NICHT gerechnet wird, und warum ──────────────────────
   Die offizielle Punktzahl eines Rennens ist

       Rennpunkte + Zuschlag

   Der Zuschlag ("penalty") entsteht aus den FIS-Punkten der besten
   Fünf am Start und den besten Zehn im Ziel. Dafür bräuchte man die
   Punktestände des ganzen Feldes — also die FIS-Datenbank, nicht
   unsere. Dieses Modul rechnet deshalb die Rennpunkte und nimmt den
   Zuschlag entgegen, wenn er bekannt ist. Er wird NICHT geraten:
   eine Zahl, die nach amtlich aussieht und keine ist, wäre schlimmer
   als gar keine.

   Was das Modul liefert, ist damit ehrlich beschriftet: "Rennpunkte"
   ohne Zuschlag, "FIS-Punkte" nur, wenn ein Zuschlag eingetragen ist.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein Firebase, kein DOM, kein Netz. Eine Formel gehört getestet,
   nicht beteuert.
   ══════════════════════════════════════════════════════════════════ */

/* Disziplinfaktoren der FIS. Sie werden gelegentlich angepasst; wenn
   die FIS sie ändert, ändert sich diese Tabelle und sonst nichts. */
export const F_FAKTOR = Object.freeze({
  SL: 730,    // Slalom
  RS: 1010,   // Riesenslalom  (FIS: GS)
  SG: 1190,   // Super-G
  DH: 1250,   // Abfahrt
});

/* ── Zeiten ────────────────────────────────────────────────────────*/

/**
 * "1:23.45" → 83.45 · "58.12" → 58.12 · "2:01:30.5" → 7290.5
 * Gibt null zurück, wenn nichts Brauchbares darin steht — lieber keine
 * Zahl als eine erfundene.
 */
export function inSekunden(zeit) {
  if (typeof zeit === 'number') return Number.isFinite(zeit) && zeit > 0 ? zeit : null;
  const roh = String(zeit ?? '').trim().replace(',', '.');
  if (!roh) return null;

  /* Erlaubt: ss.hh, mm:ss.hh, hh:mm:ss.hh — nichts sonst. */
  if (!/^(\d+:){0,2}\d+(\.\d+)?$/.test(roh)) return null;

  const teile = roh.split(':').map(Number);
  if (teile.some(n => !Number.isFinite(n))) return null;

  const sekunden = teile.reduce((summe, n) => summe * 60 + n, 0);
  return sekunden > 0 ? sekunden : null;
}

/** 83.45 → "1:23.45". Für die Anzeige, nicht zum Speichern. */
export function alsZeit(sekunden) {
  if (!Number.isFinite(sekunden) || sekunden < 0) return '';
  const min = Math.floor(sekunden / 60);
  const rest = sekunden - min * 60;
  const s = rest.toFixed(2).padStart(min > 0 ? 5 : 4, '0');
  return min > 0 ? `${min}:${s}` : s.replace(/^0(?=\d)/, '');
}

/* ── Die Rechnung ──────────────────────────────────────────────────*/

/**
 * Rennpunkte aus zwei Zeiten und der Disziplin.
 * Weniger ist besser; der Sieger hat 0.
 * @returns {number|null} auf zwei Stellen gerundet, wie die FIS es tut
 */
export function rennpunkte(eigeneZeit, siegerZeit, disziplin) {
  const F = F_FAKTOR[disziplin];
  if (!F) return null;

  const tx = inSekunden(eigeneZeit);
  const to = inSekunden(siegerZeit);
  if (tx == null || to == null) return null;

  /* Schneller als der Sieger heisst: da stimmt etwas nicht — ein
     Tippfehler oder die falsche Siegerzeit. Negative Punkte gibt es
     nicht, also lieber nichts behaupten. */
  if (tx < to) return null;

  return Math.round(((F * tx) / to - F) * 100) / 100;
}

/**
 * Die Punktzahl, die zählt: Rennpunkte plus Zuschlag.
 * Ohne bekannten Zuschlag gibt es keine FIS-Punkte, nur Rennpunkte —
 * das ist der Unterschied zwischen "so schnell warst du" und "so
 * stark war das Feld".
 */
export function gesamtpunkte(punkte, zuschlag) {
  if (!Number.isFinite(punkte)) return null;
  if (zuschlag == null || zuschlag === '') return null;
  const z = Number(zuschlag);
  if (!Number.isFinite(z) || z < 0) return null;
  return Math.round((punkte + z) * 100) / 100;
}

/* ── Der Punktestand eines Athleten ────────────────────────────────
   Die FIS-Liste bildet den Durchschnitt der zwei besten Ergebnisse
   einer Disziplin im Zeitraum. Weniger ist besser, also sind die
   "besten" die kleinsten.

   Bei nur einem Ergebnis rechnet die FIS mit Zuschlägen, die von der
   Kategorie des Rennens abhängen. Diese Regeln bilden wir NICHT nach —
   stattdessen steht dann das eine Ergebnis da, ausdrücklich als
   vorläufig gekennzeichnet. Eine halb nachgebaute Regel wäre eine
   Zahl, die amtlich aussieht und keine ist. */

export function punktestand(punkteListe) {
  /* Erst aussortieren, DANN umrechnen. Number(null) ist 0 und
     Number("") ebenfalls — ein fehlender Wert wuerde also zur
     perfekten Punktzahl und den Stand nach unten ziehen. Genau das
     ist beim ersten Anlauf passiert. */
  const werte = (Array.isArray(punkteListe) ? punkteListe : [])
    .filter(v => v !== null && v !== undefined && v !== "" && typeof v !== "boolean")
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (!werte.length) return { punkte: null, aus: 0, vorlaeufig: true };

  if (werte.length === 1) {
    return { punkte: werte[0], aus: 1, vorlaeufig: true };
  }

  const schnitt = (werte[0] + werte[1]) / 2;
  return { punkte: Math.round(schnitt * 100) / 100, aus: werte.length, vorlaeufig: false };
}

/**
 * Was ein zusätzliches Ergebnis am Stand ändern würde — die Frage, die
 * ein Athlet vor einem Rennen wirklich hat: "was muss ich fahren, damit
 * es besser wird?"
 */
export function standMit(punkteListe, neuePunkte) {
  const vorher = punktestand(punkteListe);
  const nachher = punktestand([...(punkteListe || []), neuePunkte]);
  const besser = vorher.punkte != null && nachher.punkte != null
    ? Math.round((vorher.punkte - nachher.punkte) * 100) / 100
    : null;
  return { vorher, nachher, verbesserung: besser };
}

/**
 * Umgekehrt: welche Zeit bräuchte es für einen Zielwert?
 * Aus P = F·Tx/To − F folgt Tx = To · (P + F) / F.
 */
export function zeitFuerPunkte(zielPunkte, siegerZeit, disziplin) {
  const F = F_FAKTOR[disziplin];
  const to = inSekunden(siegerZeit);
  if (!F || to == null) return null;
  const p = Number(zielPunkte);
  if (!Number.isFinite(p) || p < 0) return null;
  return Math.round(to * ((p + F) / F) * 100) / 100;
}

/* Punkte pro Disziplin aus einer Liste von Ergebnissen. Ein Athlet hat
   keinen einzelnen Punktestand, sondern einen je Disziplin — im Slalom
   stark und in der Abfahrt schwach zu sein ist der Normalfall. */
export function standJeDisziplin(ergebnisse) {
  const nach = {};
  for (const e of Array.isArray(ergebnisse) ? ergebnisse : []) {
    const d = e?.disziplin;
    if (!F_FAKTOR[d]) continue;
    /* Dieselbe Falle wie in punktestand(): null und "" werden zu 0. */
    if (e.punkte === null || e.punkte === undefined || e.punkte === "") continue;
    const p = Number(e.punkte);
    if (!Number.isFinite(p) || p < 0) continue;
    (nach[d] ||= []).push(p);
  }
  return Object.fromEntries(
    Object.keys(F_FAKTOR)
      .filter(d => nach[d]?.length)
      .map(d => [d, punktestand(nach[d])]),
  );
}
