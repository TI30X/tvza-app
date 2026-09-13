/* ══════════════════════════════════════════════════════════════════
   Die Woche — EIN Baustein für die Gruppe und den Bereich Training.

   Seit v.35.42.0 ein Kalender, senkrecht wie bei Spond: oben
   "‹ 3. – 9. Aug. ›" zum Blättern, darunter jeder Tag mit dem, was an
   ihm steht — die Termine der Gruppe und die Einheiten aus den Plänen.
   Ein Tipp auf eine Einheit führt in den Player (mit dem GEPLANTEN
   Datum), ein Tipp auf einen Termin zu seiner Zusage. Die Leitung hat
   an jedem Tag ein "+" für einen neuen Termin an genau diesem Tag.

   Bis dahin: sieben Tage als Streifen, EIN Plan, gewählt über eine
   Auswahl, und die Termine in einer eigenen Liste daneben. Michel:
   "Kann man nicht Woche vor oder zurück?" und "besser in einer
   vertikalen Leiste wie Spond — man sollte ja noch eintragen können,
   was für Termine anstehen." Der Streifen war gewählt worden, damit die
   Woche auf dem Telefon nicht zwei Bildschirme hoch wird; darum stehen
   leere Tage hier auf einer Zeile.

   Was die Seite tut: Pläne, Termine und Protokolle laden. Was hier
   passiert: zeichnen und blättern. Die Logik liegt in wochenplan.js —
   ohne DOM und prüfbar.
   ══════════════════════════════════════════════════════════════════ */

import {
  agendaTage, startWoche, naechsterNach, plusTage, montagVon, eintragFortschritt, einheitZiel, wochenKopf,
} from '../../wochenplan.js';
import { isoTag, zeitraum as terminZeitraum, istAbgesagt, artName, BEREICH_DER_ART } from '../../termine.js';

const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const tPlural = (key, n, eins, mehr) => {
  const wert = window.TVZAI18n?.format?.plural(key, n);
  return (!wert || String(wert).startsWith(key)) ? `${n} ${n === 1 ? eins : mehr}` : wert;
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Wochentag und Datum kommen aus dem DATUM, nicht aus dem deutschen
   Namen im Programm: der Plan ist ein Import, die Oberflaeche spricht
   sieben Sprachen. */
export function alsDatum(iso) {
  return new Date(`${iso}T00:00:00`);
}

const format = (iso, optionen, fallback) =>
  window.TVZAI18n?.format?.date(alsDatum(iso), optionen)
  ?? alsDatum(iso).toLocaleDateString(fallback || 'de-CH', optionen);

export function tagName(tag) {
  if (!tag?.datum) return tag?.name || '';
  return format(tag.datum, { weekday: 'long' });
}

export function kurzDatum(iso) {
  return iso ? format(iso, { day: 'numeric', month: 'short' }) : '';
}

const PFEIL = {
  links: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  rechts: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  weiter: '<svg class="ic row__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
};

/**
 * @param {object} o
 * @param {HTMLElement} o.el            wohin die Woche gezeichnet wird
 * @param {string} [o.zurueck]          wohin der Player zurückführt ('gruppe' | 'training')
 * @param {(termin:object) => void} [o.beiTermin]      ein Termin wurde angetippt
 * @param {(datum:string) => void} [o.beiNeuerTermin]  "+" an einem Tag (nur Leitung)
 */
export function agendaAnsicht({ el, zurueck = '', beiTermin = null, beiNeuerTermin = null }) {
  let stand = {
    quellen: [], termine: [], protokolleJe: new Map(), mehrereGruppen: false,
    darfTermine: false, leer: '', montag: '', schluessel: '',
  };

  /* ── Eine Einheit ─────────────────────────────────────────────────
     Ein Eintrag ohne Blatt ("evtl. Spiel") bleibt stehen, aber ohne Weg
     hinein: das ist eine Ansage des Trainers, kein Trainingsblatt. */
  function eintragHtml(e, datum, zusatz) {
    const slot = e.slot ? `<span class="eintrag__slot">${esc(e.slot)}</span> · ` : '';
    const dazu = zusatz ? ` · ${esc(zusatz)}` : '';

    if (!e.unit) {
      return `
        <div class="row row--ohneBlatt" data-bereich="t-training">
          <span class="row__icon">·</span>
          <span class="row__body">
            <span class="row__title">${esc(e.titel)}</span>
            <span class="row__sub">${slot}${esc(t('grp.keinBlatt', 'kein Blatt hinterlegt'))}${dazu}</span>
          </span>
        </div>`;
    }

    const protokolle = stand.protokolleJe.get(e.gid) || {};
    const f = eintragFortschritt(e.programm, e, datum, protokolle);
    const fertig = Boolean(f?.fertig && f.gesamt > 0);
    const ziel = einheitZiel(e.gid, e.planId, e, datum, zurueck);
    return `
      <a class="row" href="${esc(ziel)}" data-bereich="t-training">
        <span class="row__icon">${esc(e.titel.slice(0, 1).toUpperCase())}</span>
        <span class="row__body">
          <span class="row__title">${esc(e.titel)}</span>
          <span class="row__sub">${slot}${esc(f
            ? tPlural('eh.uebungen', f.gesamt, 'Übung', 'Übungen')
            : t('grp.keinBlatt', 'kein Blatt hinterlegt'))}${dazu}</span>
          ${f && f.gesamt
            ? `<span class="row__bar"><i class="${fertig ? 'ist-fertig' : ''}" style="width:${f.anteil}%"></i></span>`
            : ''}
        </span>
        <span class="row__end">
          <span class="row__zaehler${fertig ? ' ist-fertig' : ''}">${esc(f ? `${f.erledigt}/${f.gesamt}` : '')}</span>
          ${PFEIL.weiter}
        </span>
      </a>`;
  }

  /* ── Ein Termin ───────────────────────────────────────────────────
     Abgesagtes bleibt stehen — sonst fährt jemand hin —, sieht aber
     auf den ersten Blick anders aus. */
  function terminHtml(termin, zusatz) {
    const ab = istAbgesagt(termin);
    const art = artName(termin, termin.gruppenart);
    const wann = termin.bis && termin.bis > termin.von ? terminZeitraum(termin) : (termin.zeit || '');
    const sub = [wann, termin.ort, zusatz].filter(Boolean).join(' · ');
    return `
      <button class="row agenda__termin${ab ? ' ist-abgesagt' : ''}" type="button"
              data-termin="${esc(termin.id)}" data-gid="${esc(termin.gid || '')}"
              data-bereich="${esc(BEREICH_DER_ART[termin.art] || '')}">
        <span class="row__icon">${esc(art.slice(0, 1))}</span>
        <span class="row__body">
          <span class="row__title">${esc(ab ? `${termin.titel} — ${t('grp.abgesagt', 'Abgesagt')}` : termin.titel)}</span>
          <span class="row__sub">${esc(sub)}</span>
        </span>
        <span class="row__end">${esc(ab ? t('grp.abgesagt', 'Abgesagt') : art)}</span>
      </button>`;
  }

  function kopfHtml(tage) {
    const von = tage[0].datum, bis = tage[6].datum;
    const heute = isoTag();
    const imPlan = [...new Set(stand.quellen
      .filter(q => tage.some(tag => tag.eintraege.some(e => e.planId === q.plan?.id && e.gid === q.gid)))
      .map(q => {
        const k = wochenKopf(q.programm);
        /* Die Nummer, wie sie in der Excel steht. Die Kadervorlage zählt
           nicht nach ISO (3.–9. Aug. 2026 heisst dort KW 31, nach ISO 32)
           — eine selbst gerechnete Zahl daneben wäre eine zweite Wahrheit. */
        return k.kw ? (k.tw ? `KW ${k.kw} · TW ${k.tw}` : `KW ${k.kw}`) : k.label;
      })
      .filter(Boolean))];
    const dieseWoche = montagVon(heute) === stand.montag;
    return `
      <div class="agenda__kopf">
        <button class="agenda__pfeil" type="button" data-blaettern="-1"
                aria-label="${esc(t('ag.vorige', 'Vorige Woche'))}" title="${esc(t('ag.vorige', 'Vorige Woche'))}">${PFEIL.links}</button>
        <div class="agenda__zeitraum">
          <span class="agenda__daten">${esc(`${kurzDatum(von)} – ${kurzDatum(bis)}`)}</span>
          <span class="agenda__kw">${esc(imPlan.join(' / '))}</span>
        </div>
        <button class="agenda__pfeil" type="button" data-blaettern="1"
                aria-label="${esc(t('ag.naechste', 'Nächste Woche'))}" title="${esc(t('ag.naechste', 'Nächste Woche'))}">${PFEIL.rechts}</button>
        <button class="agenda__heute" type="button" data-blaettern="0"${dieseWoche ? ' hidden' : ''}>${esc(t('ag.heute', 'Heute'))}</button>
      </div>`;
  }

  function tagHtml(tag) {
    const leer = !tag.termine.length && !tag.eintraege.length;
    const zusatzGruppe = x => (stand.mehrereGruppen ? x.gruppe : '');
    const plus = stand.darfTermine && beiNeuerTermin
      ? `<button class="agenda__neu" type="button" data-neu="${esc(tag.datum)}"
                 aria-label="${esc(t('ag.neu', 'Termin am {tag} hinzufügen', { tag: `${tagName(tag)}, ${kurzDatum(tag.datum)}` }))}"
                 title="${esc(t('grp.terminNeu', 'Termin hinzufügen'))}">${PFEIL.plus}</button>`
      : '';
    return `
      <section class="agenda__tag${tag.heute ? ' ist-heute' : ''}${leer ? ' ist-leer' : ''}" data-datum="${esc(tag.datum)}">
        <div class="agenda__datum">
          <span class="agenda__wtag">${esc(tag.heute ? t('grp.heute', 'Heute') : tagName(tag))}</span>
          <span class="agenda__dnum">${esc(tag.heute ? `${tagName(tag)}, ${kurzDatum(tag.datum)}` : kurzDatum(tag.datum))}</span>
          ${plus}
        </div>
        ${leer ? '' : `<div class="rows">
          ${tag.termine.map(x => terminHtml(x, zusatzGruppe(x))).join('')}
          ${tag.eintraege.map(x => eintragHtml(x, tag.datum, zusatzGruppe(x))).join('')}
        </div>`}
      </section>`;
  }

  function zeichne() {
    if (!stand.montag) return;
    const heute = isoTag();
    const tage = agendaTage({ montag: stand.montag, quellen: stand.quellen, termine: stand.termine, heute });
    const nichts = tage.every(x => !x.termine.length && !x.eintraege.length);
    const danach = naechsterNach(stand.termine.filter(x => !istAbgesagt(x)), stand.montag);

    el.innerHTML = `
      ${kopfHtml(tage)}
      ${nichts ? `<p class="empty-hint agenda__nichts">${esc(t('ag.leer', 'In dieser Woche ist nichts geplant.'))}</p>` : ''}
      <div class="agenda__tage">${tage.map(tagHtml).join('')}</div>
      ${danach ? `
        <div class="marke agenda__danach">${esc(t('ag.alsNaechstes', 'Als Nächstes'))}</div>
        <div class="rows">${terminHtml(danach, stand.mehrereGruppen ? danach.gruppe : '')}</div>` : ''}
      ${stand.leer ? `<p class="empty-hint">${esc(stand.leer)}</p>` : ''}`;
    el.hidden = false;
  }

  el.addEventListener('click', event => {
    const blaettern = event.target.closest('[data-blaettern]');
    if (blaettern) {
      const n = Number(blaettern.dataset.blaettern);
      stand.montag = n === 0 ? montagVon(isoTag()) : plusTage(stand.montag, 7 * n);
      zeichne();
      return;
    }
    const neu = event.target.closest('[data-neu]');
    if (neu) { beiNeuerTermin?.(neu.dataset.neu); return; }
    const termin = event.target.closest('[data-termin]');
    if (termin) {
      const x = stand.termine.find(y => y.id === termin.dataset.termin && (y.gid || '') === termin.dataset.gid);
      if (x) beiTermin?.(x);
    }
  });

  return {
    /**
     * Zeigen, was da ist. Die Woche bleibt, wo man hingeblättert hat —
     * wer aus dem Player zurückkommt oder einen Termin speichert, will
     * nicht wieder bei heute landen. Nur wenn sich die Quellen ändern
     * (eine andere Gruppe, eine andere Person), wird die Startwoche neu
     * bestimmt.
     *
     * @param {object} o
     * @param {Array} o.quellen      [{ gid, plan, programm, gruppe? }]
     * @param {Array} [o.termine]    Termine, je mit gid (und gruppe, gruppenart)
     * @param {Map}   [o.protokolleJe] gid -> Protokolle nach Datum
     * @param {boolean} [o.darfTermine]  "+" an den Tagen
     * @param {string} [o.leer]      ein Satz unter der Woche, wenn es keinen Plan gibt
     * @param {string} [o.schluessel]  wechselt er, beginnt die Woche neu
     */
    setze(werte) {
      const { quellen = [], termine = [], protokolleJe = new Map(), darfTermine = false, leer = '', schluessel = '' } = werte || {};
      const neu = schluessel !== stand.schluessel || !stand.montag;
      const mehrereGruppen = new Set([...quellen.map(q => q.gid), ...termine.map(x => x.gid)].filter(Boolean)).size > 1;
      stand = { ...stand, quellen, termine, protokolleJe, darfTermine, leer, schluessel, mehrereGruppen };
      if (neu) stand.montag = startWoche({ heute: isoTag(), quellen, termine });
      zeichne();
      /* Beim ersten Anzeigen zu heute, wenn heute weiter unten liegt — am
         Sonntag stand man sonst vor dem Montag und musste die Woche
         hinunterscrollen (Rundgang v.35.46.0). Beim Blättern und bei
         jedem späteren Neuzeichnen nicht: da hat man selbst gescrollt. */
      if (neu) {
        const naechsterFrame = window.requestAnimationFrame?.bind(window) || (fn => setTimeout(fn, 0));
        naechsterFrame(() => {
          const heute = el.querySelector('.agenda__tag.ist-heute');
          if (heute && heute.getBoundingClientRect().top > window.innerHeight * 0.6) {
            heute.scrollIntoView({ block: 'start' });
          }
        });
      }
    },
    /** In die Woche springen, in der iso liegt — nach dem Veröffentlichen
        in die Woche des neuen Plans. */
    springeZu(iso) {
      if (!iso) return;
      stand.montag = montagVon(iso);
      zeichne();
    },
    /** Welche Woche gerade steht (ihr Montag). */
    get montag() { return stand.montag; },
  };
}
