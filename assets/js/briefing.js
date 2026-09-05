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

/* ── Heute oder morgen? ────────────────────────────────────────────
   Am Abend will niemand mehr wissen, was heute anstand. Die
   Schul-Mail, an der sich diese Karte orientiert, heisst darum
   "Morgen" und kommt am Vorabend.

   Ab ABEND_AB kippt die Karte auf den naechsten Tag. Die Grenze ist
   ein Parameter und keine feste Zahl, damit der Test sie setzen kann,
   ohne die Uhr zu stellen. */

export const ABEND_AB = 17;

export function tagesfenster(now = new Date(), abendAb = ABEND_AB) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;

  const abend = d.getHours() >= abendAb;
  const tag = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (abend) tag.setDate(tag.getDate() + 1);

  return {
    id: abend ? 'morgen' : 'heute',
    /* Deutsch als Ruecklage; der Katalog gewinnt in renderBriefing. */
    titel: abend ? 'Morgen' : 'Dein Tag',
    tag,
  };
}

/* ── Die naechsten vierzehn Tage ───────────────────────────────────
   Der dritte Abschnitt der Mail. Er zeigt, was NACH dem Fenster
   kommt — was heute (oder morgen) ansteht, steht ja schon oben, und
   es zweimal zu schreiben ist der Fuelltext, den Regel 3 verhindert.

   Ein Abschnitt ohne Inhalt verschwindet nicht, er sagt einen Satz.
   Genau das macht die Mail bei den Pruefungen richtig: "Keine
   Pruefungen in den naechsten 14 Tagen" ist eine Auskunft, ein
   fehlender Abschnitt waere bloss eine Luecke. */

export const VORSCHAU_TAGE = 14;

function alsDatum(wert) {
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function naechsteTage(termine, { now = new Date(), tage = VORSCHAU_TAGE,
                                        abendAb = ABEND_AB } = {}) {
  const fenster = tagesfenster(now, abendAb);
  if (!fenster) return [];

  /* Ab dem Tag NACH dem Fenster, damit sich oben und hier nichts
     doppelt. */
  const von = new Date(fenster.tag);
  von.setDate(von.getDate() + 1);
  const bis = new Date(fenster.tag);
  bis.setDate(bis.getDate() + tage);
  bis.setHours(23, 59, 59, 999);

  return (Array.isArray(termine) ? termine : [])
    .map(t => {
      const start = alsDatum(t?.start);
      return start && t?.titel ? { ...t, start, ganztags: !!t.ganztags } : null;
    })
    .filter(t => t && t.start >= von && t.start <= bis)
    .sort((a, b) => {
      const tagA = a.start.toDateString();
      const tagB = b.start.toDateString();
      if (tagA !== tagB) return a.start - b.start;
      return (b.ganztags - a.ganztags) || (a.start - b.start);
    });
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

export function termineHeute(termine, now = new Date(), abendAb = null) {
  /* Ohne abendAb bleibt es beim alten Verhalten: der heutige Tag.
     Mit abendAb folgt es dem Fenster und kippt am Abend auf morgen. */
  const fenster = abendAb === null ? null : tagesfenster(now, abendAb);
  const bezug = fenster ? fenster.tag : now;
  return (Array.isArray(termine) ? termine : [])
    .map(t => {
      const start = t?.start instanceof Date ? t.start : new Date(t?.start);
      return Number.isNaN(start?.getTime?.()) ? null : { ...t, start, ganztags: !!t.ganztags };
    })
    .filter(t => t && t.titel && gleicherTag(t.start, bezug))
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
export function tagesSatz(termine, now = new Date(), wort = 'Heute') {
  /* Das Wort kommt herein, weil der Satz am Abend von MORGEN handelt.
     Es fest einzubauen hiess: die Karte traegt "Morgen" als Titel und
     faengt darunter mit "Heute" an. */
  const heute = termineHeute(termine, now);
  if (!heute.length) return null;

  const [erster, zweiter] = heute;

  if (heute.length === 1) {
    return erster.ganztags
      ? `${wort}: ${erster.titel}.`
      : `${wort} um ${uhrzeit(erster.start)}: ${erster.titel}.`;
  }
  if (heute.length === 2) {
    return `${wort} ${stueck(erster)} und ${stueck(zweiter)}.`;
  }
  /* Ab drei wird gezählt statt aufgezählt, sonst wächst die Karte mit
     dem Kalender — und genau das soll sie nicht. */
  return erster.ganztags
    ? `${wort} stehen ${heute.length} Sachen an, zuerst ${erster.titel}.`
    : `${wort} stehen ${heute.length} Sachen an — die erste um `
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
export function buildBriefing({ termine, hint, now = new Date(),
                                abendAb = null } = {}) {
  const saetze = [];
  /* abendAb === null heisst: wie bisher, immer heute. Die Startseite
     reicht ABEND_AB durch und bekommt damit die Umschaltung. */
  const fenster = tagesfenster(now, abendAb === null ? 24 : abendAb);
  const bezug = fenster ? fenster.tag : now;

  const tag = tagesSatz(termine, bezug, fenster?.id === 'morgen' ? 'Morgen' : 'Heute');
  if (tag) saetze.push(tag);

  const kommende = abendAb === null ? [] : naechsteTage(termine, { now, abendAb });

  const hinweis = hint?.text ? String(hint.text).trim() : '';
  if (hinweis) saetze.push(hinweis);

  /* Regel 2. Eine Karte, die nur "Heute ist nichts los" sagt, ist der
     Grund, warum man ab Tag drei wegschaut.

     Die Vorschau ist eine ERGAENZUNG, kein Anlass: "in neun Tagen ist
     etwas" allein waere derselbe Fuelltext mit mehr Zeilen. */
  if (!saetze.length) return null;

  return {
    saetze,
    hinweisTyp: hinweis ? (hint.type || null) : null,
    fenster: fenster ? fenster.id : 'heute',
    kommende,
  };
}

/* ── Darstellung ───────────────────────────────────────────────────
   Getrennt von der Logik oben, damit die Tests ohne DOM auskommen.
   Das Plättchen trägt das "n" aus dem Wortzeichen — dasselbe Zeichen,
   das später App-Symbol und Gruppenplättchen wird. */

export function renderBriefing(briefing, { onDismiss, onLater, titel } = {}) {
  const i18n = globalThis.window?.TVZAI18n;
  const t = (key, deutsch) => i18n?.tOr(key, deutsch) ?? deutsch;

  /* Der Katalog gewinnt, das deutsche Wort ist die Rueckfallebene —
     genau die additive Regel aus CLAUDE.md.

     Am Abend heisst die Karte "Morgen": wer um sieben draufschaut,
     will nicht mehr wissen, was heute anstand. */
  const ueberschrift = titel
    ?? (briefing.fenster === 'morgen'
      ? t('brief.morgen', 'Morgen')
      : t('brief.deinTag', 'Dein Tag'));
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
  zu.setAttribute('aria-label', t('brief.ausblenden', 'Ausblenden'));
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

  /* Was NACH dem Fenster kommt. Datum und Wochentag ueber Intl, nie
     ueber Strings — sonst bekaeme ein polnischer Nutzer einen
     Schweizer Wochentag. */
  if (briefing.kommende?.length) {
    const marke = document.createElement('div');
    marke.className = 'marke brief__marke';
    marke.textContent = t('brief.naechste14', 'Nächste 14 Tage');
    el.appendChild(marke);

    const liste = document.createElement('div');
    liste.className = 'brief__liste';

    for (const termin of briefing.kommende) {
      const zeile = document.createElement('div');
      zeile.className = 'brief__zeile';

      const wann = document.createElement('span');
      wann.className = 'brief__wann';
      wann.textContent = i18n?.format?.date(termin.start,
        { weekday: 'short', day: '2-digit', month: '2-digit' })
        ?? termin.start.toLocaleDateString();

      const was = document.createElement('span');
      was.className = 'brief__was';
      was.textContent = termin.titel;

      zeile.append(wann, was);

      /* Ganztaegiges bekommt keine erfundene Uhrzeit — dieselbe Regel
         wie oben im Tagessatz. */
      if (!termin.ganztags) {
        const zeit = document.createElement('span');
        zeit.className = 'brief__zeit';
        zeit.textContent = i18n?.format?.time(termin.start) ?? uhrzeit(termin.start);
        zeile.appendChild(zeit);
      }
      liste.appendChild(zeile);
    }
    el.appendChild(liste);
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
    spaeter.textContent = t('brief.spaeter', 'Hinweis später');
    spaeter.onclick = () => { el.remove(); onLater(briefing.hinweisTyp); };
    el.appendChild(spaeter);
  }

  return el;
}
