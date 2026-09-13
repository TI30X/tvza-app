/* ══════════════════════════════════════════════════════════════════
   Wem gehört eine Excel? (v.35.43.0)

   Michel: "Die Excel-Dokumente sind meist auf jeden Athleten einzeln
   kuratiert." Die Kadervorlage trägt den Namen im Kopf ("Name: Van
   Zanten Timothy" — Nachname zuerst). In Firn heisst dasselbe Mitglied,
   wie es sich angemeldet hat: "Timothy", "Timothy van Zanten", "Timo".

   Dieses Modul sagt, welches Mitglied gemeint ist — oder ehrlich, dass
   es das nicht weiss. Lieber einmal fragen als einem Athleten den Plan
   eines anderen geben: passen zwei Mitglieder gleich gut, gibt es keinen
   Vorschlag.

   Ohne DOM und ohne Firebase, damit es prüfbar bleibt.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Die Teile eines Namens, vergleichbar gemacht: klein, Umlaute als
 * ae/oe/ue (so schreibt sie jemand, der sie nicht tippen kann), andere
 * Akzente weg, alles, was kein Buchstabe ist, trennt.
 */
export function namensTeile(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/* Zwei Teile passen: gleich (2 Punkte), oder einer beginnt mit dem
   anderen und der kürzere hat mindestens drei Buchstaben — "Timo" und
   "Timothy" (1 Punkt). Zwei Buchstaben wären "Le" in "Lea" und "Leo". */
function teilPasst(a, b) {
  if (a === b) return 2;
  const [kurz, lang] = a.length <= b.length ? [a, b] : [b, a];
  return kurz.length >= 3 && lang.startsWith(kurz) ? 1 : 0;
}

/* Wie gut ein Name den anderen deckt: jeder Teil von "wenige" muss
   einen Partner in "viele" finden, sonst 0. */
function deckung(wenige, viele) {
  let punkte = 0;
  for (const teil of wenige) {
    const best = Math.max(0, ...viele.map(x => teilPasst(teil, x)));
    if (!best) return 0;
    punkte += best;
  }
  return punkte;
}

/**
 * Das Mitglied zum Namen aus der Excel.
 *
 * @param {string} excelName  "Van Zanten Timothy"
 * @param {Array<{uid:string, name?:string}>} mitglieder
 * @returns {{ uid: string|null, grund: 'passt'|'ohneName'|'unbekannt'|'mehrdeutig' }}
 *
 * Die Reihenfolge der Teile zählt nicht (Nachname zuerst oder zuletzt),
 * und es reicht, wenn einer der beiden Namen ganz im anderen steht: das
 * Mitglied "Timothy" passt zu "Van Zanten Timothy".
 */
export function passendesMitglied(excelName, mitglieder = []) {
  const excel = namensTeile(excelName);
  if (!excel.length) return { uid: null, grund: 'ohneName' };

  const bewertet = (mitglieder || [])
    .map(m => {
      const teile = namensTeile(m?.name);
      if (!teile.length) return { uid: m?.uid, punkte: 0 };
      return { uid: m.uid, punkte: Math.max(deckung(teile, excel), deckung(excel, teile)) };
    })
    .filter(x => x.uid && x.punkte > 0)
    .sort((a, b) => b.punkte - a.punkte);

  if (!bewertet.length) return { uid: null, grund: 'unbekannt' };
  if (bewertet[1] && bewertet[1].punkte === bewertet[0].punkte) return { uid: null, grund: 'mehrdeutig' };
  return { uid: bewertet[0].uid, grund: 'passt' };
}
