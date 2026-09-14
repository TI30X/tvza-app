/* ══════════════════════════════════════════════════════════════════
   Die Ansichten des Kalenders — Liste, Monat, Zeitraster.

   Kein Firebase: bekommt die Einträge (eintraege.js) und gibt Markup
   zurück. Verdrahtet wird über data-Attribute an EINER Stelle
   (verdrahten), damit ein Neuzeichnen keine Zuhörer verliert oder
   doppelt anhängt.

     data-eintrag="id"   ein Eintrag — öffnen
     data-erledigt="id"  eine Erinnerung abhaken
     data-stop="id|stopId"  einen Programmpunkt abhaken
     data-programm="id"  das Programm eines Eintrags öffnen
     data-tag="iso"      einen Tag wählen (Monat, Kopf des Rasters)
     data-neu="iso"      an diesem Tag etwas anlegen
     data-slot="iso"     ins leere Raster getippt — mit Uhrzeit
     data-mehr="iso"     "+2 weitere" im Monat
   ══════════════════════════════════════════════════════════════════ */

import { tageZwischen, stopsAm, ganztaegig } from './eintraege.js';

const t = (key, deutsch, vars) => {
  const i18n = globalThis.window?.TVZAI18n;
  if (i18n) return i18n.tOr(key, deutsch, vars);
  return String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
};
const locale = () => globalThis.window?.TVZAI18n?.locale || globalThis.document?.documentElement?.lang || 'de-CH';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mittag = iso => new Date(`${iso}T12:00:00`);
const fmt = (iso, opt) => new Intl.DateTimeFormat(locale(), opt).format(mittag(iso));

export const wochentagKurz = iso => fmt(iso, { weekday: 'short' }).replace(/\.$/, '');
export const tagZahl = iso => String(mittag(iso).getDate());
export const monatJahr = iso => fmt(iso, { month: 'long', year: 'numeric' });

/** Der Titel über Tag, 3 Tagen und Woche: "Mo., 14. Sept." / "14.–20. Sept.",
    mit Jahr nur, wenn es nicht das laufende ist. */
export function rasterTitel(tage, heute) {
  const jahr = tage.at(-1).slice(0, 4) !== String(heute).slice(0, 4) ? ` ${tage.at(-1).slice(0, 4)}` : '';
  if (tage.length === 1) return fmt(tage[0], { weekday: 'short', day: 'numeric', month: 'short' }) + jahr;
  return zeitraumText(tage[0], tage.at(-1)) + jahr;
}

/** "18.–21. Sept." / "30. Sept. – 2. Okt." */
export function zeitraumText(von, bis) {
  if (von === bis) return fmt(von, { day: 'numeric', month: 'short' });
  const gleicherMonat = von.slice(0, 7) === bis.slice(0, 7);
  return gleicherMonat
    ? `${mittag(von).getDate()}.–${fmt(bis, { day: 'numeric', month: 'short' })}`
    : `${fmt(von, { day: 'numeric', month: 'short' })} – ${fmt(bis, { day: 'numeric', month: 'short' })}`;
}

/* Wofür ein Eintrag steht, in einer Zeile: Art, Gruppe, Ort. */
function meta(e, x) {
  const teile = [];
  if (x?.rolle === 'ueberfaellig') teile.push(t('kal.seit', 'seit {tag}', { tag: zeitraumText(e.von, e.von) }));
  if (e.bis > e.von) teile.push(zeitraumText(e.von, e.bis));
  if (e.typ) teile.push(e.typ);
  if (e.art === 'erinnerung') teile.push(t('kal.erinnerung', 'Erinnerung'));
  if (e.quelle) teile.push(e.quelle);
  if (e.ort) teile.push(e.ort);
  if (x?.rolle === 'programm' && x.stops?.length) teile.unshift(t('kal.programmTag', 'Programm · Tag {n}', { n: x.tagNr }));
  return teile.join(' · ');
}

/* Die linke Spalte eines Eintrags in der Liste: wann. */
function wann(e, x) {
  if (x?.rolle === 'ueberfaellig') return `<strong class="is-ueberfaellig">${esc(t('kal.ueberfaelligKurz', 'überfällig'))}</strong>`;
  if (x && x.tage > 1) {
    if (x.rolle === 'beginn') return `<strong>${esc(t('kal.tage', '{n} Tage', { n: x.tage }))}</strong>`;
    if (x.rolle === 'weiter' || x.rolle === 'laeuft' || x.rolle === 'programm') {
      return `<strong>${esc(t('kal.tagVon', 'Tag {n}/{m}', { n: x.tagNr, m: x.tage }))}</strong>`;
    }
  }
  if (!e.zeit) return `<span>${esc(t('kal.ganztags', 'ganztägig'))}</span>`;
  return `<strong>${esc(e.zeit)}</strong>${e.bisZeit && e.bisZeit !== e.zeit ? `<span>${esc(e.bisZeit)}</span>` : ''}`;
}

function stopZeile(e, stop, erledigt) {
  return `<div class="kal-stop${erledigt ? ' is-erledigt' : ''}">
    <button class="kal-haken${erledigt ? ' is-an' : ''}" type="button" data-stop="${esc(e.id)}|${esc(stop.id || '')}"
      aria-pressed="${erledigt}" aria-label="${esc(erledigt ? t('kal.wiederOffen', 'Wieder öffnen') : t('kal.abhaken', 'Abhaken'))}"></button>
    <span class="kal-stop__zeit">${esc(stop.timeLabel || stop.time || '')}</span>
    <span class="kal-stop__titel">${esc(stop.title || t('kal.punkt', 'Programmpunkt'))}</span>
  </div>`;
}

/**
 * Ein Eintrag als Zeile der Liste (auch unter dem Monat am Handy).
 * @param x  { e, rolle, tagNr, tage, stops } aus agenda(), oder nur { e }
 * @param opt.erledigtVon  (eintrag, stop) → bool — ob ein Programmpunkt abgehakt ist
 */
export function eintragZeile(x, { erledigtVon = () => false } = {}) {
  const e = x.e;
  const klassen = ['kal-eintrag', `kal-eintrag--${e.art}`];
  if (e.abgesagt) klassen.push('is-abgesagt');
  if (e.erledigt) klassen.push('is-erledigt');
  if (x.tage > 1) klassen.push('is-mehrtaegig');
  const haken = e.art === 'erinnerung'
    ? `<button class="kal-haken${e.erledigt ? ' is-an' : ''}" type="button" data-erledigt="${esc(e.id)}"
        aria-pressed="${e.erledigt}" aria-label="${esc(e.erledigt ? t('kal.wiederOffen', 'Wieder öffnen') : t('kal.abhaken', 'Abhaken'))}"></button>`
    : '';
  const stops = x.stops?.length
    ? `<div class="kal-stops">${x.stops.map(stop => stopZeile(e, stop, erledigtVon(e, stop))).join('')}
        <button class="kal-link" type="button" data-programm="${esc(e.id)}">${esc(t('kal.programmOeffnen', 'Programm öffnen'))}</button></div>`
    : '';
  return `<div class="${klassen.join(' ')}" style="--farbe:${esc(e.farbe || 'var(--accent)')}">
    <button class="kal-eintrag__haupt" type="button" data-eintrag="${esc(e.id)}">
      <span class="kal-eintrag__wann">${wann(e, x)}</span>
      <span class="kal-eintrag__body">
        <span class="kal-eintrag__titel">${esc(e.titel)}</span>
        <span class="kal-eintrag__meta">${esc(meta(e, x))}</span>
      </span>
    </button>
    ${haken}
    ${stops}
  </div>`;
}

/**
 * Die Liste: Monate als Überschrift, jeder Tag mit Wochentag und
 * Zahl links, heute hervorgehoben. Zwischen zwei Tagen mit mehr als
 * einem freien Tag steht, wie viele frei sind — so sieht man die
 * ruhige Woche, statt sie zu übersehen.
 */
export function agendaHtml(tage, { erledigtVon } = {}) {
  if (!tage.length) {
    return `<div class="kal-leer kal-leer--gross">
      <p>${esc(t('kal.nichtsGeplant', 'Nichts geplant.'))}</p>
    </div>`;
  }
  let monat = '';
  const teile = [];
  for (const tag of tage) {
    if (tag.tag.slice(0, 7) !== monat) {
      monat = tag.tag.slice(0, 7);
      teile.push(`<h3 class="kal-monat" data-monat="${monat}">${esc(monatJahr(tag.tag))}</h3>`);
    } else if (tag.freiDavor > 1) {
      teile.push(`<div class="kal-frei">${esc(t('kal.frei', '{n} Tage frei', { n: tag.freiDavor }))}</div>`);
    }
    const inhalt = tag.eintraege.length
      ? tag.eintraege.map(x => eintragZeile(x, { erledigtVon })).join('')
      : `<div class="kal-leer"><span>${esc(t('kal.nichtsHeute', 'Heute ist nichts geplant.'))}</span>
          <button class="kal-link" type="button" data-neu="${tag.tag}">${esc(t('kal.eintragen', 'Eintragen'))}</button></div>`;
    teile.push(`<section class="kal-tag${tag.heute ? ' is-heute' : ''}${tag.vergangen ? ' is-vergangen' : ''}" data-tagblock="${tag.tag}">
      <button class="kal-tag__datum" type="button" data-neu="${tag.tag}"
        aria-label="${esc(t('kal.anTagEintragen', 'Am {tag} eintragen', { tag: fmt(tag.tag, { weekday: 'long', day: 'numeric', month: 'long' }) }))}">
        <span class="kal-tag__wtag">${esc(wochentagKurz(tag.tag))}</span>
        <span class="kal-tag__num">${tagZahl(tag.tag)}</span>
      </button>
      <div class="kal-tag__eintraege">${inhalt}</div>
    </section>`);
  }
  return teile.join('');
}

/* ── Monat ─────────────────────────────────────────────────────────── */

const WOCHENTAGE = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

export function wochentageKopf(klasse = 'kal-wtage') {
  return `<div class="${klasse}" aria-hidden="true">${WOCHENTAGE.map(iso => `<span>${esc(wochentagKurz(iso))}</span>`).join('')}</div>`;
}

/**
 * Der Monat. Am Laptop trägt jede Woche ihre Balken (höchstens
 * `spurenMax` Zeilen, der Rest als "+2"); am Handy (kompakt) nur Punkte
 * je Tag — die Einträge des gewählten Tags stehen dann darunter.
 */
export function monatHtml(wochen, { gewaehlt = '', kompakt = false, spurenMax = 3 } = {}) {
  const zeilen = wochen.map(woche => {
    const tage = woche.tage.map((tag, i) => {
      const hier = woche.balken.filter(b => b.start <= i && b.ende >= i);
      const versteckt = kompakt ? 0 : hier.filter(b => b.spur >= spurenMax).length;
      const punkte = kompakt
        ? `<span class="kal-mtag__punkte">${hier.slice(0, 4).map(b => `<i style="--farbe:${esc(b.e.farbe)}"></i>`).join('')}</span>`
        : '';
      const klassen = ['kal-mtag'];
      if (!tag.imMonat) klassen.push('is-aussen');
      if (tag.heute) klassen.push('is-heute');
      if (tag.wochenende) klassen.push('is-we');
      if (tag.tag === gewaehlt) klassen.push('is-gewaehlt');
      if (hier.length) klassen.push('hat-eintraege');
      return `<button class="${klassen.join(' ')}" type="button" data-tag="${tag.tag}"
          aria-label="${esc(fmt(tag.tag, { weekday: 'long', day: 'numeric', month: 'long' }))}${hier.length ? `, ${hier.length}` : ''}">
        <span class="kal-mtag__num">${tagZahl(tag.tag)}</span>${punkte}
        ${versteckt ? `<span class="kal-mtag__mehr" data-mehr="${tag.tag}">+${versteckt}</span>` : ''}
      </button>`;
    }).join('');
    const balken = kompakt ? '' : woche.balken.filter(b => b.spur < spurenMax).map(b => {
      const e = b.e;
      const punkt = !ganztaegig(e);
      const klassen = ['kal-balken'];
      if (punkt) klassen.push('is-punkt');
      if (b.links) klassen.push('is-links');
      if (b.rechts) klassen.push('is-rechts');
      if (e.abgesagt) klassen.push('is-abgesagt');
      return `<button class="${klassen.join(' ')}" type="button" data-eintrag="${esc(e.id)}"
          style="grid-column:${b.start + 1} / span ${b.ende - b.start + 1};grid-row:${b.spur + 2};--farbe:${esc(e.farbe)}"
          title="${esc(`${e.titel} · ${meta(e)}`)}">
        ${punkt ? `<i></i><b>${esc(e.zeit)}</b> ` : ''}<span>${esc(e.titel)}</span>
      </button>`;
    }).join('');
    return `<div class="kal-woche" style="--spuren:${Math.min(woche.spuren, spurenMax)}">
      <div class="kal-woche__tage">${tage}</div>
      ${balken ? `<div class="kal-woche__balken">${balken}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="kal-monatsraster${kompakt ? ' is-kompakt' : ''}">${wochentageKopf()}${zeilen}</div>`;
}

/** Die Einträge an einem Tag, für die Liste unter dem Monat am Handy. */
export function tagesListeHtml(tag, eintraege, { erledigtVon } = {}) {
  const hier = eintraege.filter(e => e.von <= tag && e.bis >= tag);
  const kopf = `<h3 class="kal-tagkopf">${esc(fmt(tag, { weekday: 'long', day: 'numeric', month: 'long' }))}
    <button class="kal-link" type="button" data-neu="${tag}">${esc(t('kal.eintragen', 'Eintragen'))}</button></h3>`;
  if (!hier.length) return `${kopf}<div class="kal-leer"><span>${esc(t('kal.nichtsAmTag', 'An diesem Tag ist nichts geplant.'))}</span></div>`;
  return kopf + hier.map(e => {
    const tage = tageZwischen(e.von, e.bis) + 1;
    return eintragZeile({
      e, rolle: tage > 1 ? (e.von === tag ? 'beginn' : 'laeuft') : 'einzeln',
      tagNr: tageZwischen(e.von, tag) + 1, tage, stops: stopsAm(e, tag),
    }, { erledigtVon });
  }).join('');
}

/* ── Zeitraster ────────────────────────────────────────────────────── */

const pad = n => String(n).padStart(2, '0');

export function zeitHtml(raster, { heute = '', jetzt = null } = {}) {
  const tage = raster.spalten.map(s => s.tag);
  const koepfe = tage.map(tag => `<button class="kal-zkopf${tag === heute ? ' is-heute' : ''}" type="button" data-tag="${tag}">
      <span>${esc(wochentagKurz(tag))}</span><strong>${tagZahl(tag)}</strong></button>`).join('');
  const ganz = raster.ganztags.balken.map(b => {
    const e = b.e;
    const klassen = ['kal-balken'];
    if (b.links) klassen.push('is-links');
    if (b.rechts) klassen.push('is-rechts');
    if (e.abgesagt) klassen.push('is-abgesagt');
    return `<button class="${klassen.join(' ')}" type="button" data-eintrag="${esc(e.id)}"
        style="grid-column:${b.start + 1} / span ${b.ende - b.start + 1};grid-row:${b.spur + 1};--farbe:${esc(e.farbe)}"
        title="${esc(`${e.titel} · ${meta(e)}`)}"><span>${esc(e.titel)}</span></button>`;
  }).join('');
  const stunden = Array.from({ length: 24 }, (_, h) => `<span style="--h:${h}">${h ? `${pad(h)}:00` : ''}</span>`).join('');
  const spalten = raster.spalten.map(({ tag, bloecke }) => {
    const bloeckeHtml = bloecke.map(b => {
      const e = b.e;
      const titel = b.stop ? (b.stop.title || e.titel) : e.titel;
      const zeit = b.stop ? (b.stop.time || '') : `${e.zeit}${e.bisZeit && e.bisZeit !== e.zeit ? `–${e.bisZeit}` : ''}`;
      const klassen = ['kal-block'];
      if (b.stop) klassen.push('is-stop');
      if (e.abgesagt) klassen.push('is-abgesagt');
      if (b.ende - b.start < 45) klassen.push('is-kurz');
      return `<button class="${klassen.join(' ')}" type="button" data-eintrag="${esc(e.id)}"
          style="--start:${b.start};--dauer:${Math.max(b.ende - b.start, 30)};--spalte:${b.spalte};--spalten:${b.spalten};--farbe:${esc(e.farbe)}"
          title="${esc(`${titel} · ${zeit}`)}">
        <strong>${esc(titel)}</strong><span>${esc(zeit)}${!b.stop && e.ort ? ` · ${esc(e.ort)}` : ''}</span>
      </button>`;
    }).join('');
    const linie = tag === heute && jetzt !== null ? `<span class="kal-jetzt" style="--start:${jetzt}"></span>` : '';
    return `<div class="kal-spalte${tag === heute ? ' is-heute' : ''}" data-slot="${tag}">${bloeckeHtml}${linie}</div>`;
  }).join('');
  return `<div class="kal-zeit" style="--tage:${tage.length};--spuren:${Math.max(1, raster.ganztags.spuren)}">
    <div class="kal-zeit__oben">
      <div class="kal-zeit__kopf"><span class="kal-zeit__ecke"></span>${koepfe}</div>
      <div class="kal-zeit__ganz"><span class="kal-zeit__ecke">${esc(t('kal.ganztags', 'ganztägig'))}</span>
        <div class="kal-zeit__ganzbalken">${ganz}</div></div>
    </div>
    <div class="kal-zeit__koerper">
      <div class="kal-zeit__achse">${stunden}</div>
      <div class="kal-zeit__spalten">${spalten}</div>
    </div>
  </div>`;
}

/* ── Verdrahten ────────────────────────────────────────────────────── */

/**
 * Hängt EINEN Zuhörer an die Bühne. `aktuell()` liefert die Einträge
 * des letzten Zeichnens als Map id → Eintrag — so passt ein Klick auch
 * nach dem Neuzeichnen zum richtigen Eintrag.
 */
export function verdrahten(el, { aktuell, beiEintrag, beiErledigt, beiStop, beiProgramm, beiTag, beiNeu, beiSlot, stundeHoehe }) {
  if (el.dataset.verdrahtet) return;
  el.dataset.verdrahtet = '1';
  el.addEventListener('click', event => {
    const ziel = event.target.closest('[data-erledigt],[data-stop],[data-programm],[data-mehr],[data-eintrag],[data-neu],[data-tag],[data-slot]');
    if (!ziel || !el.contains(ziel)) return;
    const map = aktuell();
    const d = ziel.dataset;
    if (d.erledigt) { const e = map.get(d.erledigt); if (e) beiErledigt?.(e); return; }
    if (d.stop) {
      const [id, stopId] = d.stop.split('|');
      const e = map.get(id);
      const stop = e?.stops?.find(s => s.id === stopId);
      if (e && stop) beiStop?.(e, stop);
      return;
    }
    if (d.programm) { const e = map.get(d.programm); if (e) beiProgramm?.(e); return; }
    if (d.mehr) { event.stopPropagation(); beiTag?.(d.mehr, { mehr: true }); return; }
    if (d.eintrag) { const e = map.get(d.eintrag); if (e) beiEintrag?.(e); return; }
    if (d.neu) { beiNeu?.(d.neu); return; }
    if (d.tag) { beiTag?.(d.tag); return; }
    if (d.slot && event.target === ziel) {
      const rect = ziel.getBoundingClientRect();
      const hoehe = stundeHoehe?.() || 48;
      const minuten = Math.max(0, Math.min(23 * 60 + 45, Math.round(((event.clientY - rect.top) / hoehe * 60) / 15) * 15));
      beiSlot?.(d.slot, `${pad(Math.floor(minuten / 60))}:${pad(minuten % 60)}`);
    }
  });
}
