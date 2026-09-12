/* ══════════════════════════════════════════════════════════════════
   Die Wochenansicht — EIN Baustein fuer die Gruppe und den Bereich
   Training.

   Sieben Tage als Streifen, darunter die Einheiten des gewaehlten Tages
   mit Tageshaelfte, Zaehler und Balken. Ein Tipp fuehrt in den Player,
   mit dem GEPLANTEN Datum.

   Bis v.35.26.0 stand dieser Code in gruppe.js, und der Bereich Training
   war eine eigene Seite mit eigenem Import, eigenem Speicher und eigenem
   Player. Was ein Athlet dort abhakte, sah sein Trainer nie. Jetzt lesen
   beide dieselbe Woche aus demselben Plan der Gruppe, und dieser Baustein
   zeichnet sie an beiden Orten gleich.

   Was die Seite selbst tut: Plaene laden, einen auswaehlen, Protokolle
   holen. Was hier passiert: zeichnen und auf Tipps im Streifen hoeren.
   Die Logik liegt in wochenplan.js — ohne DOM und pruefbar.
   ══════════════════════════════════════════════════════════════════ */

import {
  wochenTage, standardTag, eintragFortschritt, tagPunkte, wochenKopf, einheitZiel,
} from '../../wochenplan.js';
import { isoTag } from '../../termine.js';

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
   sieben Sprachen. Ohne Datum bleibt der Name aus der Vorlage. */
export function alsDatum(iso) {
  return new Date(`${iso}T00:00:00`);
}

export function tagName(tag) {
  if (!tag?.datum) return tag?.name || '';
  const d = alsDatum(tag.datum);
  return window.TVZAI18n?.format?.date(d, { weekday: 'long' })
    ?? d.toLocaleDateString('de-CH', { weekday: 'long' });
}

export function kurzDatum(iso) {
  if (!iso) return '';
  const d = alsDatum(iso);
  return window.TVZAI18n?.format?.date(d, { day: 'numeric', month: 'short' })
    ?? d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
}

/**
 * @param {object} els
 * @param {HTMLElement} els.streifen  die sieben Tage
 * @param {HTMLElement} els.titel     "Heute · Mittwoch, 5. Aug."
 * @param {HTMLElement} els.liste     die Einheiten des Tages
 * @param {HTMLElement} [els.zeitraum] "KW 31 · 3. Aug. – 9. Aug."
 * @param {string} [els.zurueck]      wohin der Player zurueckfuehrt
 */
export function wochenAnsicht({ streifen, titel, liste, zeitraum, zurueck = '' }) {
  let stand = {
    gid: '', planId: '', programm: null, tage: [], tag: '',
    protokolle: {}, nurFuerMich: false, leer: '',
  };

  const zeige = (el, an) => { if (el) el.hidden = !an; };

  /* ── Der Streifen ─────────────────────────────────────────────────
     Heute ist markiert, auch wenn ein anderer Tag gewaehlt ist — sonst
     verliert man beim Blaettern den Bezugspunkt. */
  function streifenHtml(heute) {
    return stand.tage.map(tag => {
      const punkte = tagPunkte(stand.programm, tag, stand.protokolle)
        .map(p => `<span class="woche__punkt${p.fertig ? ' ist-fertig' : ''}"></span>`)
        .join('');
      const kurz = tag.datum
        ? (window.TVZAI18n?.format?.date(alsDatum(tag.datum), { weekday: 'short' })
           ?? tag.name.slice(0, 2))
        : tag.name.slice(0, 2);
      return `
        <button class="woche__tag${tag.datum === heute ? ' ist-heute' : ''}" type="button"
                role="tab" data-tag="${esc(tag.key)}"
                aria-selected="${tag.key === stand.tag ? 'true' : 'false'}">
          <span class="woche__name">${esc(kurz)}</span>
          <span class="woche__datum">${esc(tag.datum ? String(Number(tag.datum.slice(8, 10))) : '')}</span>
          <span class="woche__punkte">${punkte}</span>
        </button>`;
    }).join('');
  }

  /* ── Eine Einheit ─────────────────────────────────────────────────
   Ein Eintrag ohne Blatt ("evtl. Spiel") bleibt stehen, aber ohne Weg
   hinein: das ist eine Ansage des Trainers, kein Trainingsblatt. */
  function eintragHtml(eintrag, tag) {
    const slot = eintrag.slot
      ? `<span class="eintrag__slot">${esc(eintrag.slot)}</span> · `
      : '';

    if (!eintrag.unit) {
      return `
        <div class="row row--ohneBlatt" data-bereich="t-training">
          <span class="row__icon">·</span>
          <span class="row__body">
            <span class="row__title">${esc(eintrag.titel)}</span>
            <span class="row__sub">${slot}${esc(t('grp.keinBlatt', 'kein Blatt hinterlegt'))}</span>
          </span>
        </div>`;
    }

    const f = eintragFortschritt(stand.programm, eintrag, tag.datum, stand.protokolle);
    const fertig = Boolean(f?.fertig && f.gesamt > 0);
    const ziel = einheitZiel(stand.gid, stand.planId, eintrag, tag.datum, zurueck);

    return `
      <a class="row" href="${esc(ziel)}" data-bereich="t-training">
        <span class="row__icon">${esc(eintrag.titel.slice(0, 1).toUpperCase())}</span>
        <span class="row__body">
          <span class="row__title">${esc(eintrag.titel)}</span>
          <span class="row__sub">${slot}${esc(f
            ? tPlural('eh.uebungen', f.gesamt, 'Übung', 'Übungen')
            : t('grp.keinBlatt', 'kein Blatt hinterlegt'))}</span>
          ${f && f.gesamt
            ? `<span class="row__bar"><i class="${fertig ? 'ist-fertig' : ''}" style="width:${f.anteil}%"></i></span>`
            : ''}
        </span>
        <span class="row__end">
          <span class="row__zaehler${fertig ? ' ist-fertig' : ''}">${esc(f ? `${f.erledigt}/${f.gesamt}` : '')}</span>
          <svg class="ic row__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </a>`;
  }

  function zeichne() {
    const heute = isoTag();

    if (!stand.programm || !stand.tage.length) {
      zeige(streifen, false);
      zeige(titel, false);
      zeige(zeitraum, false);
      liste.innerHTML = stand.leer ? `<p class="empty-hint">${esc(stand.leer)}</p>` : '';
      return;
    }

    /* Der Kopf nennt die Woche, nicht den Titel, den der Trainer beim
       Veroeffentlichen getippt hat. Dass ein Plan nur fuer einen selbst
       gilt, steht dabei — der Athlet soll wissen, dass der Kader etwas
       anderes macht. */
    if (zeitraum) {
      const kopf = wochenKopf(stand.programm);
      const teile = [
        kopf.kw ? `KW ${kopf.kw}` : kopf.label,
        kopf.von && kopf.bis ? `${kurzDatum(kopf.von)} – ${kurzDatum(kopf.bis)}` : '',
        stand.nurFuerMich ? t('grp.nurFuerDich', 'nur für dich') : '',
      ].filter(Boolean);
      zeitraum.textContent = teile.join(' · ');
      zeige(zeitraum, teile.length > 0);
    }

    streifen.innerHTML = streifenHtml(heute);
    zeige(streifen, true);

    const tag = stand.tage.find(x => x.key === stand.tag) || stand.tage[0];
    const istHeute = Boolean(tag.datum) && tag.datum === heute;
    titel.innerHTML = [
      `<span>${esc(istHeute ? t('grp.heute', 'Heute') : tagName(tag))}</span>`,
      tag.datum
        ? `<span class="tag__datum">${esc(istHeute
            ? `${tagName(tag)}, ${kurzDatum(tag.datum)}`
            : kurzDatum(tag.datum))}</span>`
        : '',
    ].filter(Boolean).join('');
    zeige(titel, true);

    liste.innerHTML = tag.eintraege.length
      ? tag.eintraege.map(e => eintragHtml(e, tag)).join('')
      : `<p class="empty-hint">${esc(t('grp.ruhetag', 'Ruhetag — nichts geplant.'))}</p>`;
  }

  streifen.addEventListener('click', event => {
    const key = event.target.closest('[data-tag]')?.dataset.tag;
    if (!key || key === stand.tag) return;
    stand.tag = key;
    zeichne();
  });

  return {
    /** Einen Plan zeigen. Derselbe Plan behaelt den gewaehlten Tag —
        wer nach dem Abhaken zurueckkommt, will nicht wieder bei heute
        landen, wenn er gerade den Freitag vorbereitet. */
    setze({ gid, planId, programm, protokolle = {}, nurFuerMich = false }) {
      const tage = programm ? wochenTage(programm) : [];
      const gleich = stand.gid === gid && stand.planId === planId;
      stand = { ...stand, gid, planId, programm, tage, protokolle, nurFuerMich, leer: '' };
      if (!gleich || !tage.some(x => x.key === stand.tag)) stand.tag = standardTag(tage, isoTag());
      zeichne();
    },
    /** Kein Plan: ein Satz statt einer leeren Woche. */
    leer(text) {
      stand = { ...stand, programm: null, tage: [], planId: '', leer: text || '' };
      zeichne();
    },
    get tag() { return stand.tag; },
  };
}
