/* ══════════════════════════════════════════════════════════════════
   Das Programm eines Termins — und die Seite, aus der es kommt.

   Bis v.35.49.0 konnte das nur die Reise (trips): eine Seite als HTML
   einfügen, hochladen oder verlinken, Firn liest daraus die Punkte nach
   Tagen, und das Original bleibt als zweite Ansicht offen. Seit
   v.35.50.0 sind Termine und Reisen EIN Modell (groups/{gid}/events) —
   und das Programm gehört jedem Termin. Darum steht es hier und nicht
   mehr im Kalender: der Kalender, der Gruppe-Tab und die Gastseite
   zeigen es mit demselben Code.

   Am Termin (schreiben darf nur die Leitung):
     programm          [{ id, date, time, title, notes, tag, transport,
                          order, autoImported, timeLabel, dayTitle,
                          dayIntro }] — dieselbe Form wie itinerary
     planHtml/planUrl  die Seite (eingefügt oder hochgeladen / verlinkt)
     abfahrten         { [uid]: { zeit, ort } } — wann und wo jeder losfährt
     packliste         [{ id, name }] — was alle mitbringen

   Ein Programm wird NICHT abgehakt (Michel): um 7:00 ist die Abfahrt um
   7:00 vorbei, ohne dass jemand sie durchstreicht. Vorbei ist, was nach
   der Uhr vorbei ist (punktVorbei), und der nächste Punkt ist markiert.
   Abgehakt wird nur, was jeden selbst angeht — die Packliste, für jede
   Person einzeln (events/{eid}/gepackt/{uid}).

   Die Seite wird nie als Seite von Firn ausgeführt: sicheresHtml()
   nimmt Skripte, Rahmen, Formulare und on…-Attribute heraus, und der
   Rahmen ist obendrein sandboxed, ohne allow-scripts.
   ══════════════════════════════════════════════════════════════════ */

import { parseItineraryHtml, groupByDay } from './itinerary.js';

/* Dieselben Grenzen wie in firestore.rules. Ein Dokument darf 1 MiB
   gross sein; die Seite bekommt fast alles davon. */
export const PROGRAMM_MAX = 300;
export const PACKLISTE_MAX = 200;
export const SEITE_MAX = 900000;

const tt = (key, deutsch, vars) => (globalThis.window?.TVZAI18n
  ? window.TVZAI18n.tOr(key, deutsch, vars)
  : String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz)));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const pad = n => String(n).padStart(2, '0');
const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ── Rein ─────────────────────────────────────────────────────────── */

/** Jetzt als { tag: 'JJJJ-MM-TT', zeit: 'HH:MM' } — damit Tests eine Uhr stellen können. */
export function jetztFuer(datum = new Date()) {
  return {
    tag: `${datum.getFullYear()}-${pad(datum.getMonth() + 1)}-${pad(datum.getDate())}`,
    zeit: `${pad(datum.getHours())}:${pad(datum.getMinutes())}`,
  };
}

/** Ist ein Punkt vorbei? Ein Tag davor ist vorbei; am selben Tag, wenn
 *  seine Uhrzeit vorbei ist. Ein Punkt ohne Datum oder ohne Zeit am
 *  heutigen Tag ist nie "vorbei" — niemand weiss, wann er war. */
export function punktVorbei(punkt, jetzt) {
  if (!punkt?.date || !jetzt?.tag) return false;
  if (punkt.date < jetzt.tag) return true;
  if (punkt.date > jetzt.tag) return false;
  return !!punkt.time && punkt.time < jetzt.zeit;
}

/** Der nächste Punkt, der noch kommt (nach Datum und Zeit). */
export function naechsterPunkt(punkte, jetzt) {
  return (punkte || [])
    .filter(p => p?.date && !punktVorbei(p, jetzt) && p.date >= (jetzt?.tag || ''))
    .sort((a, b) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`))[0] || null;
}

/** Was eine Seite hergibt: { punkte, tage }. */
export function seiteLesen(html, baseDate = '') {
  if (!String(html || '').trim()) return { punkte: [], tage: 0 };
  const { items, days } = parseItineraryHtml(html, { baseDate });
  return { punkte: items, tage: items.length ? (days || 1) : 0 };
}

/** Das Programm nach dem Einlesen einer Seite: die Punkte vom letzten
 *  Einlesen werden ersetzt, von Hand angelegte bleiben. Gibt die Seite
 *  keine Punkte her, bleibt das Programm, wie es war. */
export function programmMitSeite(bisher, html, baseDate = '') {
  const { punkte } = seiteLesen(html, baseDate);
  const alt = Array.isArray(bisher) ? bisher : [];
  if (!punkte.length) return alt;
  return [...alt.filter(p => !p.autoImported), ...punkte].slice(0, PROGRAMM_MAX);
}

/** Ein Punkt, von Hand angelegt oder geändert. Wer einen eingelesenen
 *  Punkt ändert, macht ihn zu seinem — ein neues Einlesen ersetzt ihn
 *  dann nicht mehr. */
export function neuerPunkt({ id = '', date = '', time = '', title = '', notes = '' } = {}) {
  const punkt = { id: id || neueId(), title: String(title).trim().slice(0, 200) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) punkt.date = date;
  if (/^\d{2}:\d{2}$/.test(time)) punkt.time = time;
  if (String(notes).trim()) punkt.notes = String(notes).trim().slice(0, 500);
  return punkt;
}

/** Ein Programm mit geändertem (oder neuem) Punkt. */
export function punktSetzen(programm, punkt) {
  const liste = Array.isArray(programm) ? programm : [];
  const i = liste.findIndex(p => p.id === punkt.id);
  if (i < 0) return [...liste, punkt].slice(0, PROGRAMM_MAX);
  return liste.map((p, j) => (j === i ? punkt : p));
}

/** Die Abfahrt einer Person, wenn die Leitung eine eingetragen hat. */
export function abfahrtVon(termin, uid) {
  const a = termin?.abfahrten?.[uid];
  return a && (a.zeit || a.ort) ? { zeit: a.zeit || '', ort: a.ort || '' } : null;
}

/** Die Abfahrten aufgeräumt: nur, wer eine Zeit oder einen Ort hat. */
export function abfahrtenSauber(eingabe) {
  const raus = {};
  for (const [uid, a] of Object.entries(eingabe || {})) {
    const zeit = /^\d{2}:\d{2}$/.test(a?.zeit || '') ? a.zeit : '';
    const ort = String(a?.ort || '').trim().slice(0, 80);
    if (zeit || ort) raus[uid] = { ...(zeit ? { zeit } : {}), ...(ort ? { ort } : {}) };
  }
  return raus;
}

/** Die Packliste einer Person: was alle mitbringen (die Liste der
 *  Leitung) und was sie selbst dazugeschrieben hat — je mit ihrem Haken. */
export function packlisteFuer(termin, gepackt) {
  const haken = gepackt?.erledigt || {};
  const gemeinsam = (termin?.packliste || []).map(p => ({ ...p, eigen: false, an: !!haken[p.id] }));
  const eigene = (gepackt?.eigene || []).map(p => ({ ...p, eigen: true, an: !!haken[p.id] }));
  return [...gemeinsam, ...eigene];
}

export function neuerPackpunkt(name) {
  return { id: neueId(), name: String(name ?? '').trim().slice(0, 120) };
}

/* Was oft vorkommt, soll man nicht jedes Mal tippen (Michel). Aus den
   Werten, die schon da sind: am häufigsten zuerst, dann alphabetisch. */
export function haeufigste(werte, max = 12) {
  const zaehler = new Map();
  for (const w of werte) {
    const s = String(w ?? '').trim();
    if (s) zaehler.set(s, (zaehler.get(s) || 0) + 1);
  }
  return [...zaehler.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

/** Nur http(s) — ein javascript:-Link als "Seite" wäre ein Loch. */
export function sichereAdresse(wert) {
  try {
    const url = new URL(String(wert || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

/** Die eingefügte Seite, ohne das, was darin ausgeführt würde. */
export function sicheresHtml(html) {
  if (!String(html || '').trim()) return '';
  const dom = new DOMParser().parseFromString(html, 'text/html');
  dom.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv="refresh"],link[rel="modulepreload"],link[rel="preload"]')
    .forEach(el => el.remove());
  dom.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const wert = attr.value.trim();
      if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
      if (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name)
        && /^(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(wert)) el.removeAttribute(attr.name);
      if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(wert)) el.removeAttribute(attr.name);
    });
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return '<!doctype html>' + dom.documentElement.outerHTML;
}

const MUELL = '<svg class="ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

/** Die Punkte eines Programms nach Tagen — für das Detail eines Termins.
 *  Vorbei ist leiser, der nächste Punkt markiert. `bearbeitbar` (die
 *  Leitung): ein Tipp auf die Zeile ändert sie (data-punkt), der Eimer
 *  entfernt sie (data-punkt-weg). */
export function punkteHtml(punkte, { jetzt = null, bearbeitbar = false } = {}) {
  const tage = groupByDay(punkte || []);
  if (!tage.length) return `<p class="empty-hint">${esc(tt('prog.leer', 'Noch nichts geplant.'))}</p>`;
  const naechster = naechsterPunkt(punkte, jetzt);
  return tage.map(tag => `
    <div class="prog-tag-gruppe">
      <div class="marke">${esc(tag.heading)}</div>
      <div class="rows">${tag.items.map(p => {
        const vorbei = punktVorbei(p, jetzt);
        const klassen = ['row', 'prog-punkt', bearbeitbar ? '' : 'row--static',
          vorbei ? 'is-vorbei' : '', p === naechster ? 'is-naechster' : ''].filter(Boolean).join(' ');
        return `<div class="${klassen}"${bearbeitbar ? ` data-punkt="${esc(p.id || '')}" role="button" tabindex="0"` : ''}>
          <span class="row__time prog-zeit">${esc(p.timeLabel || p.time || '')}</span>
          <span class="row__body">
            <span class="row__title">${esc(p.title)}${p.tag ? ` <span class="prog-marke">${esc(p.tag)}</span>` : ''}</span>
            ${p === naechster ? `<span class="prog-naechster">${esc(tt('prog.naechster', 'Als Nächstes'))}</span>` : ''}
            ${p.notes ? `<span class="row__sub">${esc(p.notes)}</span>` : ''}
            ${p.transport ? `<span class="row__sub">→ ${esc(p.transport)}</span>` : ''}
          </span>
          ${bearbeitbar ? `<span class="row__end">
            <button class="row__aktion row__aktion--gefahr" type="button" data-punkt-weg="${esc(p.id || '')}"
              title="${esc(tt('prog.entfernen', 'Entfernen'))}" aria-label="${esc(tt('prog.entfernen', 'Entfernen'))}">${MUELL}</button>
          </span>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`).join('');
}

/** Die grosse Ansicht: Kopf (mit der eigenen Abfahrt), darunter Tag für Tag. */
export function programmHtml({
  eyebrow = '', titel = '', zeitraum = '', ort = '', notiz = '', punkte = [],
  jetzt = null, abfahrt = null,
} = {}) {
  const liste = punkte || [];
  const tage = groupByDay(liste);
  const naechster = naechsterPunkt(liste, jetzt);
  return `<div class="plan-wrap">
    <section class="plan-hero">
      ${eyebrow ? `<div class="plan-hero__eyebrow">${esc(eyebrow)}</div>` : ''}
      <h2>${esc(titel || tt('prog.programm', 'Programm'))}</h2>
      <div class="plan-hero__meta">${esc([zeitraum, ort].filter(Boolean).join(' · '))}</div>
      ${abfahrt ? `<p class="plan-abfahrt"><span>${esc(tt('prog.deineAbfahrt', 'Deine Abfahrt'))}</span>
        <strong>${esc([abfahrt.zeit, abfahrt.ort].filter(Boolean).join(' · '))}</strong></p>` : ''}
      ${notiz ? `<p class="plan-stop__notes">${esc(notiz)}</p>` : ''}
    </section>
    ${tage.length ? tage.map(tag => {
      const erster = tag.items[0] || {};
      return `<section class="plan-day">
        <header class="plan-day__head">
          <div class="plan-day__date">${esc(tag.heading)}</div>
          ${erster.dayTitle ? `<div class="plan-day__title">${esc(erster.dayTitle)}</div>` : ''}
          ${erster.dayIntro ? `<p class="plan-day__intro">${esc(erster.dayIntro)}</p>` : ''}
        </header>
        <div class="plan-stops">${tag.items.map(p => {
          const vorbei = punktVorbei(p, jetzt);
          return `<article class="plan-stop${vorbei ? ' is-vorbei' : ''}${p === naechster ? ' is-naechster' : ''}">
            <div class="plan-stop__zeit">${esc(p.timeLabel || p.time || '')}</div>
            <div class="plan-stop__body">
              <div class="plan-stop__top">
                <span class="plan-stop__title">${esc(p.title || tt('prog.punkt', 'Programmpunkt'))}</span>
                ${p.tag ? `<span class="prog-marke">${esc(p.tag)}</span>` : ''}
                ${p === naechster ? `<span class="prog-naechster">${esc(tt('prog.naechster', 'Als Nächstes'))}</span>` : ''}
              </div>
              ${p.notes ? `<div class="plan-stop__notes">${esc(p.notes)}</div>` : ''}
              ${p.transport ? `<div class="plan-stop__transport">${esc(p.transport)}</div>` : ''}
            </div>
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('') : `<p class="empty-hint">${esc(tt('prog.keinePunkte', 'Aus der Seite liessen sich keine Programmpunkte lesen.'))}</p>`}
  </div>`;
}

/* ── Über der Seite ───────────────────────────────────────────────
   EIN Blatt je Seite, vom Modul gebaut — die Seiten tragen dafür kein
   Markup (Seiten-Invariante: kein style="…", und so braucht der
   Gruppe-Tab keine Kopie des Kalender-Markups). */

let blatt = null;
let offen = null;   // { schluessel, optionen }

function bauen() {
  if (blatt) return blatt;
  blatt = document.createElement('div');
  blatt.className = 'viewer';
  blatt.setAttribute('role', 'dialog');
  blatt.setAttribute('aria-modal', 'true');
  blatt.innerHTML = `
    <div class="viewer-bar">
      <button class="viewer-zu" type="button" data-viewer-zu><svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="vt" data-viewer-titel></span>
      <button class="viewer-knopf" type="button" data-viewer-weiter hidden></button>
      <button class="viewer-knopf" type="button" data-viewer-modus hidden></button>
    </div>
    <div class="viewer-plan" data-viewer-plan hidden></div>
    <iframe class="viewer-frame" data-viewer-rahmen referrerpolicy="no-referrer" hidden></iframe>`;
  document.body.append(blatt);
  const zu = blatt.querySelector('[data-viewer-zu]');
  zu.setAttribute('aria-label', tt('a11y.schliessen', 'Schliessen'));
  zu.onclick = viewerSchliessen;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && viewerOffen()) viewerSchliessen();
  });
  return blatt;
}

const teil = name => bauen().querySelector(`[data-viewer-${name}]`);

export function viewerOffen() {
  return !!blatt?.classList.contains('visible');
}

function knopf(name, text, beiKlick) {
  const k = teil(name);
  k.hidden = !beiKlick;
  k.textContent = text || '';
  k.onclick = beiKlick || null;
}

/**
 * Das Programm zeigen.
 * @param o.schluessel  wer gerade offen ist — programmNeuZeichnen() braucht ihn
 * @param o.titel, o.eyebrow, o.zeitraum, o.ort, o.notiz, o.punkte, o.abfahrt
 * @param o.jetzt       { tag, zeit } — was vorbei ist; fehlt es, gilt die Uhr
 * @param o.seite       { html, url } — das Original
 * @param o.weiter      { text, beiKlick } — z.B. "Zum Termin"
 */
export function programmZeigen(o) {
  if (!(o.punkte || []).length) {
    seiteZeigen({ titel: o.titel, html: o.seite?.html, url: o.seite?.url, weiter: o.weiter });
    return;
  }
  offen = { schluessel: o.schluessel || '', optionen: o };
  teil('titel').textContent = o.titel || tt('prog.programm', 'Programm');
  const rahmen = teil('rahmen');
  rahmen.hidden = true;
  rahmen.removeAttribute('src');
  rahmen.removeAttribute('srcdoc');
  const plan = teil('plan');
  plan.hidden = false;
  plan.innerHTML = programmHtml({ ...o, jetzt: o.jetzt || jetztFuer(new Date()) });
  const hatSeite = !!(o.seite?.html || o.seite?.url);
  knopf('modus', tt('prog.original', 'Original ansehen'),
    hatSeite ? () => seiteZeigen({ ...o.seite, titel: o.titel, weiter: o.weiter, zurueck: () => programmZeigen(o) }) : null);
  knopf('weiter', o.weiter?.text, o.weiter?.beiKlick ? () => { viewerSchliessen(); o.weiter.beiKlick(); } : null);
  bauen().classList.add('visible');
}

/** Neu zeichnen, wenn genau dieses Programm offen ist — eine Änderung
 *  der Leitung soll man sehen, ohne zu schliessen. */
export function programmNeuZeichnen(schluessel, o) {
  if (!viewerOffen() || !offen || offen.schluessel !== schluessel || teil('plan').hidden) return;
  programmZeigen({ ...o, schluessel });
}

/** Die Seite selbst — bereinigt, im Rahmen ohne Skripte. */
export function seiteZeigen({ titel = '', html = '', url = '', weiter = null, zurueck = null } = {}) {
  offen = null;
  teil('titel').textContent = titel || tt('prog.info', 'Info');
  teil('plan').hidden = true;
  const rahmen = teil('rahmen');
  rahmen.hidden = false;
  const adresse = sichereAdresse(url);
  if (adresse) {
    /* Eine fremde Seite darf ihre eigenen Skripte haben — sie läuft
       auf ihrem Ursprung, nicht auf dem von Firn. */
    rahmen.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
    rahmen.removeAttribute('srcdoc');
    rahmen.src = adresse;
  } else {
    rahmen.setAttribute('sandbox', 'allow-popups');
    rahmen.removeAttribute('src');
    rahmen.srcdoc = sicheresHtml(html)
      || `<p style="font-family:sans-serif;padding:24px">${esc(tt('prog.keineSeite', 'Keine Infos.'))}</p>`;
  }
  knopf('modus', tt('prog.programm', 'Programm'), zurueck);
  knopf('weiter', weiter?.text, weiter?.beiKlick ? () => { viewerSchliessen(); weiter.beiKlick(); } : null);
  bauen().classList.add('visible');
}

export function viewerSchliessen() {
  if (!blatt) return;
  blatt.classList.remove('visible');
  const rahmen = teil('rahmen');
  rahmen.removeAttribute('src');
  rahmen.removeAttribute('srcdoc');
  rahmen.hidden = true;
  teil('plan').hidden = true;
  offen = null;
}
