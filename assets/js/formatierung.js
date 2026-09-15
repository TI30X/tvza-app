/* ══════════════════════════════════════════════════════════════════
   Formatierter Text (v.35.60.0) — rein, ohne DOM.

   Michel: "das Formatieren der KI wird manchmal nicht richtig geregelt —
   es nimmt ** nicht wahr" und "sollte übrigens auch vom Chat verstanden
   werden". Gemini antwortet in Markdown (**fett**, "* " als Liste); die
   Pille zeigte die Sternchen roh. Hier wird der Text ERST vollständig
   maskiert und DANN um wenige Formen ergänzt — fett, kursiv, Code,
   Überschrift, Listen, Absätze. Nie ein Link, nie ein Bild, nie ein
   Attribut aus dem Text: was jemand schreibt, kann kein HTML werden.

   inline: ein Zusatz für jede Zeile, auf den schon maskierten Text (der
   Chat macht daraus seine Einladungslinks).
   ══════════════════════════════════════════════════════════════════ */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Fett, kursiv, Code in einer schon maskierten Zeile. */
export function zeileFormatiert(maskiert) {
  const codes = [];
  /* \x60 ist der Backtick — ausgeschrieben, damit kein Werkzeug den
     Ausdruck für den Anfang einer Vorlage hält (aufrufe.test.mjs). */
  let s = maskiert.replace(/\x60([^\x60\n]+)\x60/g, (ganz, inhalt) => {
    codes.push(`<code>${inhalt}</code>`);
    return `\uE000${codes.length - 1}\uE001`;
  });
  s = s
    .replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([^_]*?\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\uE000(\d+)\uE001/g, (ganz, i) => codes[Number(i)]);
}

const LISTE = /^(\s*)([*\-•]|\d{1,3}[.)])\s+(.*)$/;
const TITEL = /^\s{0,3}#{1,4}\s+(.*)$/;

/**
 * Der ganze Text als HTML: Absätze, Zeilenumbrüche, Listen (auch
 * eingerückt, eine Stufe tiefer), Überschriften als fette Zeile.
 */
export function formatiert(text, { inline = s => s } = {}) {
  const zeilen = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const teile = [];
  let absatz = [];
  let liste = null; // { tag, punkte: [] }

  function zeile(roh) { return inline(zeileFormatiert(esc(roh))); }
  const absatzZu = () => {
    if (absatz.length) teile.push(`<p>${absatz.join('<br>')}</p>`);
    absatz = [];
  };
  const listeZu = () => {
    if (liste) teile.push(`<${liste.tag}>${liste.punkte.join('')}</${liste.tag}>`);
    liste = null;
  };

  for (const roh of zeilen) {
    const l = LISTE.exec(roh);
    if (l) {
      absatzZu();
      const tag = /\d/.test(l[2]) ? 'ol' : 'ul';
      if (liste && liste.tag !== tag && !l[1].length) listeZu();
      liste ||= { tag, punkte: [] };
      const tief = l[1].replace(/\t/g, '  ').length >= 2;
      liste.punkte.push(`<li${tief ? ' class="fmt-tief"' : ''}>${zeile(l[3])}</li>`);
      continue;
    }
    if (!roh.trim()) { absatzZu(); listeZu(); continue; }
    listeZu();
    const titel = TITEL.exec(roh);
    if (titel) { absatzZu(); teile.push(`<p class="fmt-titel"><strong>${zeile(titel[1])}</strong></p>`); continue; }
    absatz.push(zeile(roh));
  }
  absatzZu();
  listeZu();
  return teile.join('');
}
