/* ══════════════════════════════════════════════════════════════════
   Die Tageszusammenfassung — Schicht 1.

   Sie wartet auf dich, sie holt dich nicht. Das ist das Einzige, was
   eine tägliche Zusammenfassung lesbar hält: Sie liegt oben auf Start,
   wenn du aufmachst, sie klingelt nicht, und an einem Tag ohne Inhalt
   kommt sie gar nicht.

   ── Verhältnis zu hints.js ────────────────────────────────────────
   hints.js liefert den HINWEIS: eine Folgerung aus zwei Quellen, die
   man beim Blick auf die Liste darunter nicht selbst gezogen hätte
   ("Neuschnee gemeldet, und deine Ski sind seit 12 Tagen ohne
   Service"). Die sechs Regeln dort gelten unverändert weiter.

   Diese Datei setzt eine zweite Sache daneben: den TAG selbst. Was
   ansteht, in einem Satz. Das ist keine Folgerung, sondern eine
   Zusammenfassung — und darum gilt Regel 3 ("immer zwei Quellen")
   dafür nicht. Sie gilt für den Hinweis, der weiterhin durch
   chooseHint muss.

   Was für BEIDE gilt und hier deshalb erzwungen wird:

     Regel 2 — Lieber nichts sagen. Kein Termin und kein Hinweis
       heisst keine Karte. Nicht "Heute ist nichts los!", denn das ist
       die Art Satz, wegen der man ab Tag drei wegschaut.

     Regel 6 — Nichts über andere Leute. Ein Gruppentermin gehört der
       Gruppe und darf genannt werden; wer sonst noch hingeht, nicht.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein Firebase-Import, kein Netz, kein DOM in der Logik. Das ist
   Absicht: so lässt sich der interessante Teil — wann die Karte
   SCHWEIGT — wirklich testen und nicht bloss im Quelltext beteuern.
   ══════════════════════════════════════════════════════════════════ */

/* ── Zeit ──────────────────────────────────────────────────────────*/

const zwei = n => String(n).padStart(2, '0');

/** "14:00" — über Intl wäre schöner, aber hier zählt Stabilität im Test. */
export function uhrzeit(datum) {
  const d = datum instanceof Date ? datum : new Date(datum);
  return Number.isNaN(d.getTime()) ? '' : `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

function gleicherTag(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/* ── Die Termine des Tages ─────────────────────────────────────────
   Erwartet Einträge der Form { titel, start, ganztags }. start darf ein
   Date oder etwas sein, das new Date() versteht; alles Unlesbare fällt
   still heraus, statt die Karte mit "Invalid Date" zu vergiften.

   ganztags ist nicht nur Kosmetik. Erinnerungen und Reisen tragen auf
   der Startseite ein Datum ohne Uhrzeit — sie landen deshalb als
   Mitternacht im Date-Objekt. Ohne diese Unterscheidung behauptete die
   Karte "Heute um 00:00: Versicherung bezahlen", und das ist schlicht
   falsch. Lieber gar keine Zeit als eine erfundene. */

export function termineHeute(termine, now = new Date()) {
  return (Array.isArray(termine) ? termine : [])
    .map(t => {
      const start = t?.start instanceof Date ? t.start : new Date(t?.start);
      return Number.isNaN(start?.getTime?.()) ? null : { ...t, start, ganztags: !!t.ganztags };
    })
    .filter(t => t && t.titel && gleicherTag(t.start, now))
    /* Ganztägiges zuerst: es gilt für den ganzen Tag und ist damit der
       Rahmen, in dem die Uhrzeiten stehen. */
    .sort((a, b) => (b.ganztags - a.ganztags) || (a.start - b.start));
}

/** "Kraft Beine um 14:00" — oder nur "Zahnarzt", wenn keine Zeit da ist. */
function stueck(t) {
  return t.ganztags ? t.titel : `${t.titel} um ${uhrzeit(t.start)}`;
}

/* Ein Satz, keine Liste. Die Liste steht schon darunter auf der Seite —
   sie hier zu wiederholen wäre genau der Fülltext, den Regel 3 bei den
   Hinweisen verhindert. */
export function tagesSatz(termine, now = new Date()) {
  const heute = termineHeute(termine, now);
  if (!heute.length) return null;

  const [erster, zweiter] = heute;

  if (heute.length === 1) {
    return erster.ganztags
      ? `Heute: ${erster.titel}.`
      : `Heute um ${uhrzeit(erster.start)}: ${erster.titel}.`;
  }
  if (heute.length === 2) {
    return `Heute ${stueck(erster)} und ${stueck(zweiter)}.`;
  }
  /* Ab drei wird gezählt statt aufgezählt, sonst wächst die Karte mit
     dem Kalender — und genau das soll sie nicht. */
  return erster.ganztags
    ? `Heute stehen ${heute.length} Sachen an, zuerst ${erster.titel}.`
    : `Heute stehen ${heute.length} Sachen an — die erste um `
      + `${uhrzeit(erster.start)}: ${erster.titel}.`;
}

/* ── Die Karte ─────────────────────────────────────────────────────*/

/**
 * @param {object}   quellen
 * @param {Array}    quellen.termine  Termine, eigene und aus Gruppen
 * @param {object?}  quellen.hint     Ergebnis von chooseHint(), oder null
 * @param {Date}     quellen.now
 * @returns {null|{saetze: string[], hinweisTyp: string|null}}
 *   null heisst: heute nichts zu sagen. Dann erscheint keine Karte.
 */
export function buildBriefing({ termine, hint, now = new Date() } = {}) {
  const saetze = [];

  const tag = tagesSatz(termine, now);
  if (tag) saetze.push(tag);

  const hinweis = hint?.text ? String(hint.text).trim() : '';
  if (hinweis) saetze.push(hinweis);

  /* Regel 2. Eine Karte, die nur "Heute ist nichts los" sagt, ist der
     Grund, warum man ab Tag drei wegschaut. */
  if (!saetze.length) return null;

  return { saetze, hinweisTyp: hinweis ? (hint.type || null) : null };
}

/* ── Darstellung ───────────────────────────────────────────────────
   Getrennt von der Logik oben, damit die Tests ohne DOM auskommen.
   Das Plättchen trägt das "n" aus dem Wortzeichen — dasselbe Zeichen,
   das später App-Symbol und Gruppenplättchen wird. */

export function renderBriefing(briefing, { onDismiss, onLater, titel } = {}) {
  /* Der Katalog gewinnt, das deutsche Wort ist die Rueckfallebene —
     genau die additive Regel aus CLAUDE.md. */
  const ueberschrift = titel
    ?? (globalThis.window?.TVZAI18n?.tOr('brief.deinTag', 'Dein Tag') || 'Dein Tag');
  const el = document.createElement('div');
  el.className = 'hint hint--tag';

  const kopf = document.createElement('div');
  kopf.className = 'hint__kopf';

  const marke = document.createElement('span');
  marke.className = 'hint__marke';
  marke.textContent = 'n';
  marke.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'hint__tag';
  label.textContent = ueberschrift;

  const zu = document.createElement('button');
  zu.className = 'hint__x';
  zu.type = 'button';
  zu.setAttribute('aria-label', 'Ausblenden');
  zu.innerHTML = '<svg class="ic" viewBox="0 0 24 24" width="14" height="14">'
    + '<path d="M18 6L6 18M6 6l12 12"/></svg>';
  zu.onclick = () => { el.remove(); onDismiss?.(briefing.hinweisTyp); };

  kopf.append(marke, label, zu);
  el.appendChild(kopf);

  for (const satz of briefing.saetze) {
    const p = document.createElement('p');
    p.className = 'hint__satz';
    p.textContent = satz;
    el.appendChild(p);
  }

  /* Regel 4 aus hints.js hat drei Stufen: X für heute, "Später" für eine
     Woche, zweimal weggeklickt heisst nie wieder. Ohne diesen Knopf
     ginge die mittlere Stufe verloren.

     Er steht nur da, wenn wirklich ein Hinweis in der Karte ist. Einen
     Tagesüberblick "für eine Woche" zu verstecken ergäbe keinen Sinn —
     morgen steht etwas anderes darin. */
  if (onLater && briefing.hinweisTyp) {
    const spaeter = document.createElement('button');
    spaeter.className = 'b b--secondary';
    spaeter.type = 'button';
    spaeter.textContent = 'Hinweis später';
    spaeter.onclick = () => { el.remove(); onLater(briefing.hinweisTyp); };
    el.appendChild(spaeter);
  }

  return el;
}
