/* ══════════════════════════════════════════════════════════════════
   Skelett und Gelenkwinkel — die Rechnung.

   Ein Posenmodell liefert pro Bild 33 Punkte mit Koordinaten und einer
   Sichtbarkeit. Was ein Trainer davon braucht, sind nicht die Punkte,
   sondern Winkel über die Zeit: Wie tief geht das Knie? Wann kippt die
   Hüfte in die neue Kurve?

   ── Die eine Regel, die alles trägt ───────────────────────────────
   Ein Winkel aus einem Punkt, den das Modell nicht sicher gesehen hat,
   ist keine Messung — er ist eine Zahl, die wie eine Messung aussieht.
   Beim Skifahren passiert das dauernd: Schnee staubt, ein Bein
   verschwindet hinter dem anderen, der Fahrer dreht sich weg.

   Darum gibt JEDE Funktion hier null zurück, statt zu raten. Eine
   Lücke in einer Kurve ist ehrlich; ein Wert, der aus einem
   halluzinierten Knie stammt, ist es nicht — und ein Trainer, der
   danach das Training umstellt, hat einen Schaden davon.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein DOM, kein Modell, kein Netz. Das Posenmodell läuft in der Seite
   und schickt seine Punkte hierher. So lässt sich die Geometrie
   prüfen, ohne ein 6-MB-Modell zu laden.
   ══════════════════════════════════════════════════════════════════ */

/* Die Punkte, die wir benutzen — Nummerierung von MediaPipe Pose.
   Nur diese elf; die Hand- und Gesichtspunkte sagen über einen Schwung
   nichts. */
export const PUNKT = Object.freeze({
  schulterL: 11, schulterR: 12,
  hueftL: 23, hueftR: 24,
  knieL: 25, knieR: 26,
  knoechelL: 27, knoechelR: 28,
  fussL: 31, fussR: 32,
});

/* Unterhalb dieser Sichtbarkeit wird nicht gerechnet. 0.5 ist der
   Wert, ab dem MediaPipe selbst von einer Schätzung spricht — darunter
   rät es, und wir raten nicht mit. */
export const MINDESTSICHT = 0.5;

/* ── Punkte ────────────────────────────────────────────────────────*/

/** Ein Punkt, oder null wenn er fehlt oder zu unsicher ist. */
export function punkt(landmarks, index, mindest = MINDESTSICHT) {
  const p = landmarks?.[index];
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;

  /* Fehlt die Sichtbarkeit ganz, kommen die Daten aus einer Quelle,
     die keine liefert — dann wird der Punkt genommen. Ist sie da und
     zu klein, nicht. */
  const sicht = p.visibility;
  if (typeof sicht === 'number' && sicht < mindest) return null;

  return { x: p.x, y: p.y, z: typeof p.z === 'number' ? p.z : 0 };
}

/* ── Winkel ────────────────────────────────────────────────────────*/

/**
 * Der Winkel bei B, gebildet aus A–B–C, in Grad.
 *
 * 180° heisst gestreckt, kleiner heisst gebeugt. Gerechnet wird in der
 * Bildebene (x/y) und nicht in 3D: die Tiefe eines Posenmodells aus
 * einer einzelnen Kamera ist geschätzt, und ein Winkel aus geschätzter
 * Tiefe wäre wieder eine Zahl, die mehr behauptet als sie weiss.
 */
export function winkel(a, b, c) {
  if (!a || !b || !c) return null;

  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;

  const laengeBA = Math.hypot(bax, bay);
  const laengeBC = Math.hypot(bcx, bcy);
  /* Fallen zwei Punkte zusammen, gibt es keinen Winkel. Das passiert
     bei einem verdeckten Bein regelmässig. */
  if (laengeBA < 1e-9 || laengeBC < 1e-9) return null;

  const kosinus = (bax * bcx + bay * bcy) / (laengeBA * laengeBC);
  /* Rundungsfehler können den Kosinus knapp über 1 schieben, und
     Math.acos gäbe dann NaN. */
  const grad = (Math.acos(Math.min(1, Math.max(-1, kosinus))) * 180) / Math.PI;
  return Math.round(grad * 10) / 10;
}

/**
 * Die Winkel, die einen Schwung beschreiben — je Seite.
 * Fehlende Punkte ergeben null an dieser einen Stelle, nicht überall.
 */
export function gelenkwinkel(landmarks, mindest = MINDESTSICHT) {
  const p = i => punkt(landmarks, i, mindest);

  const seite = (schulter, hueft, knie, knoechel, fuss) => ({
    /* Knie: Hüfte–Knie–Knöchel. Der Wert, den ein Trainer meint, wenn
       er "tiefer" sagt. */
    knie: winkel(p(hueft), p(knie), p(knoechel)),
    /* Hüfte: Schulter–Hüfte–Knie. Zeigt den Oberkörpereinsatz. */
    huefte: winkel(p(schulter), p(hueft), p(knie)),
    /* Sprunggelenk: Knie–Knöchel–Fussspitze. Beim Skifahren durch den
       Schuh begrenzt, aber der Unterschied zwischen den Seiten sagt
       etwas über die Belastung. */
    sprung: winkel(p(knie), p(knoechel), p(fuss)),
  });

  return {
    links: seite(PUNKT.schulterL, PUNKT.hueftL, PUNKT.knieL, PUNKT.knoechelL, PUNKT.fussL),
    rechts: seite(PUNKT.schulterR, PUNKT.hueftR, PUNKT.knieR, PUNKT.knoechelR, PUNKT.fussR),
  };
}

/**
 * Wie unterschiedlich die beiden Seiten stehen.
 *
 * Das ist die Zahl, die einem Trainer am ehesten etwas sagt: ein
 * gleichmässiger Fahrer hat auf beiden Seiten ähnliche Kniewinkel, ein
 * einseitiger nicht. Fehlt eine Seite, gibt es keinen Vergleich —
 * nicht etwa null Grad Unterschied.
 */
export function seitenunterschied(winkelPaar, gelenk = 'knie') {
  const l = winkelPaar?.links?.[gelenk];
  const r = winkelPaar?.rechts?.[gelenk];
  if (typeof l !== 'number' || typeof r !== 'number') return null;
  return Math.round(Math.abs(l - r) * 10) / 10;
}

/* ── Über die Zeit ─────────────────────────────────────────────────*/

/**
 * Gleitender Mittelwert über ein ungerades Fenster.
 *
 * Posenschätzungen zittern von Bild zu Bild um mehrere Grad. Ohne
 * Glättung sieht jede Kurve aus wie ein Erdbeben, und man sieht die
 * Bewegung nicht mehr.
 *
 * Lücken (null) werden NICHT überbrückt: sie bleiben Lücken, und ein
 * Fenster, das über eine Lücke fällt, mittelt nur über das, was da
 * ist. Ein geglätteter Wert über einer Lücke wäre erfundene Bewegung.
 */
export function glaetten(reihe, fenster = 5) {
  const werte = Array.isArray(reihe) ? reihe : [];
  const halb = Math.max(0, Math.floor(fenster / 2));
  if (halb === 0) return werte.slice();

  return werte.map((wert, i) => {
    if (typeof wert !== 'number') return null;

    let summe = 0;
    let anzahl = 0;
    for (let j = Math.max(0, i - halb); j <= Math.min(werte.length - 1, i + halb); j += 1) {
      if (typeof werte[j] === 'number') { summe += werte[j]; anzahl += 1; }
    }
    return anzahl ? Math.round((summe / anzahl) * 10) / 10 : null;
  });
}

/**
 * Der seitliche Versatz zwischen Hüfte und Knöcheln.
 *
 * Beim Kurvenfahren wandert die Hüfte nach innen, während die Füsse
 * aussen bleiben. Das Vorzeichen sagt, in welche Richtung — und ein
 * Vorzeichenwechsel ist der Übergang in die nächste Kurve.
 *
 * Positiv heisst: Hüfte rechts der Knöchel im BILD. Ob das
 * Rechts- oder Linkskurve heisst, hängt davon ab, ob von vorn oder von
 * hinten gefilmt wurde — das weiss dieses Modul nicht und behauptet es
 * darum auch nicht.
 */
export function hueftversatz(landmarks, mindest = MINDESTSICHT) {
  const hL = punkt(landmarks, PUNKT.hueftL, mindest);
  const hR = punkt(landmarks, PUNKT.hueftR, mindest);
  const kL = punkt(landmarks, PUNKT.knoechelL, mindest);
  const kR = punkt(landmarks, PUNKT.knoechelR, mindest);
  if (!hL || !hR || !kL || !kR) return null;

  const hueftMitte = (hL.x + hR.x) / 2;
  const knoechelMitte = (kL.x + kR.x) / 2;

  /* Normiert auf die Schulterbreite wäre schöner, aber die Hüftbreite
     im Bild ist stabiler, wenn der Oberkörper sich dreht. Das Ergebnis
     ist ein Verhältnis, keine Länge — sonst hinge es davon ab, wie
     nah die Kamera stand. */
  const breite = Math.abs(hR.x - hL.x);
  if (breite < 1e-6) return null;

  return Math.round(((hueftMitte - knoechelMitte) / breite) * 100) / 100;
}

/**
 * Die Bildnummern, an denen der Versatz das Vorzeichen wechselt — die
 * Schwungwechsel.
 *
 * @param {Array<number|null>} reihe   Versatz je Bild
 * @param {object} optionen
 *   schwelle: wie weit der Versatz ausschlagen muss, damit ein
 *     Nulldurchgang als Wechsel zählt. Ohne das zählt jedes Zittern um
 *     die Mitte als Schwung, und ein Stillstand hätte fünfzig davon.
 *   mindestAbstand: wie viele Bilder zwischen zwei Wechseln liegen
 *     müssen. Ein Schwung dauert bei 30 Bildern/s mindestens ein
 *     halbes Dutzend Bilder.
 */
export function schwungwechsel(reihe, { schwelle = 0.15, mindestAbstand = 6 } = {}) {
  const werte = Array.isArray(reihe) ? reihe : [];
  const wechsel = [];

  let letztesVorzeichen = 0;
  let letzterWechsel = -Infinity;

  for (let i = 0; i < werte.length; i += 1) {
    const w = werte[i];
    if (typeof w !== 'number') continue;

    /* Nur ein deutlicher Ausschlag setzt ein Vorzeichen. Zwischen den
       Schwellen bleibt das alte stehen — so überlebt eine Kurve die
       Bilder, in denen der Fahrer gerade durch die Mitte geht. */
    if (Math.abs(w) < schwelle) continue;
    const vorzeichen = w > 0 ? 1 : -1;

    if (letztesVorzeichen !== 0 && vorzeichen !== letztesVorzeichen
        && i - letzterWechsel >= mindestAbstand) {
      wechsel.push(i);
      letzterWechsel = i;
    }
    letztesVorzeichen = vorzeichen;
  }

  return wechsel;
}

/**
 * Wie lange die Schwünge dauerten, in Bildern.
 * Aus den Wechseln, nicht aus der Zeit — die Bildrate kennt der Aufrufer.
 */
export function schwungdauern(wechsel) {
  const w = Array.isArray(wechsel) ? wechsel : [];
  const dauern = [];
  for (let i = 1; i < w.length; i += 1) dauern.push(w[i] - w[i - 1]);
  return dauern;
}

/**
 * Ein knapper Befund über eine ganze Aufnahme.
 * Alles, was sich nicht belegen lässt, ist null — nicht null Grad.
 */
export function befund(bilder, bildrate = 30) {
  const reihen = Array.isArray(bilder) ? bilder : [];
  if (!reihen.length) return null;

  const knieL = glaetten(reihen.map(b => gelenkwinkel(b).links.knie));
  const knieR = glaetten(reihen.map(b => gelenkwinkel(b).rechts.knie));
  const versatz = glaetten(reihen.map(b => hueftversatz(b)), 7);

  const zahlen = liste => liste.filter(v => typeof v === 'number');
  const kleinster = liste => (zahlen(liste).length ? Math.min(...zahlen(liste)) : null);

  const wechsel = schwungwechsel(versatz);
  const dauern = schwungdauern(wechsel);
  const schnitt = dauern.length
    ? Math.round((dauern.reduce((s, d) => s + d, 0) / dauern.length / bildrate) * 100) / 100
    : null;

  return {
    bilder: reihen.length,
    /* Der tiefste Kniewinkel ist der Moment der stärksten Beugung. */
    tiefsteBeugungLinks: kleinster(knieL),
    tiefsteBeugungRechts: kleinster(knieR),
    /* Wie viele Bilder überhaupt auswertbar waren. Steht diese Zahl
       tief, sagt der Rest wenig — und das soll man sehen. */
    auswertbar: zahlen(knieL).length,
    schwuenge: wechsel.length,
    schwungdauerSekunden: schnitt,
  };
}
