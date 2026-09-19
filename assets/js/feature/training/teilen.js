/* ══════════════════════════════════════════════════════════════════
   "Training teilen" — die Ansicht der Athletin.

   Anlegen, auffrischen, verlängern, zurückziehen. Das Modell steht in
   training-teilen.js, der Weg nach Firestore in training-freigaben.js;
   hier steht, was auf dem Bildschirm passiert.

   Eine Sache ist hier wichtiger als alles andere: der Auszug wird in
   DIESEM Modul gebaut, aus den Daten, die die Seite ohnehin schon
   geladen hat. Es gibt keinen Weg, auf dem eine Empfängerin etwas
   anfordert — sie liest ein fertiges Dokument. Was nicht hineingeht,
   kann auch nicht herauskommen.
   ══════════════════════════════════════════════════════════════════ */

import { escHtml, reportClientError } from '../../firebase-config.js';
import { frage, meldung } from '../../dialog.js';
import { uebungen as uebungenVon, eintrag as eintragVon } from '../../einheit.js';
import { planEinheiten, plusTage } from '../../wochenplan.js';
import {
  auszug, auszugText, teilenLink, abgelaufen, alsZeit, umfangSauber,
  UMFANG_VORGABE, TAGE_ZURUECK, TAGE_VORAUS, GUELTIG_TAGE,
} from '../../training-teilen.js';
import {
  freigabeAnlegen, freigabeAuffrischen, freigabeVerlaengern,
  freigabeZurueckziehen, meineFreigaben,
} from '../../training-freigaben.js';

const $ = id => document.getElementById(id);
const t = (key, rueckfall, vars) => window.TVZAI18n?.tOr(key, rueckfall, vars)
  ?? String(rueckfall).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

let user = null;
let name = '';
let daten = () => ({ quellen: [], protokolle: new Map() });
let privatLaden = async () => ({});
let zurueckRuf = () => {};
let freigaben = null;         // null = noch nicht geladen
let aufgefrischt = false;

export function teilenInit({ nutzer, anzeigeName, datenQuelle, privatQuelle, zurueck }) {
  user = nutzer;
  name = anzeigeName || '';
  daten = datenQuelle || daten;
  privatLaden = privatQuelle || privatLaden;
  zurueckRuf = zurueck || zurueckRuf;
}

/* Wer keinen Plan hat, hat nichts zu teilen — die Zeile bleibt weg. */
export function teilenZeigen(an) {
  const zeile = $('teilenZeile');
  if (zeile) zeile.hidden = !an;
}

/* ── Der Auszug ────────────────────────────────────────────────────*/

function fenster(heute) {
  return { von: plusTage(heute, -TAGE_ZURUECK), bis: plusTage(heute, TAGE_VORAUS) };
}

function heuteIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Den Auszug bauen — aus dem, was die Seite schon hat. */
export async function auszugBauen(umfang) {
  const { quellen, protokolle } = daten();
  const heute = heuteIso();
  const { von, bis } = fenster(heute);
  const programme = new Map();
  for (const q of quellen) programme.set(`${q.gid}|${q.plan?.id || ''}`, q.programm);
  const einheiten = planEinheiten(quellen, heute).filter(e => e.datum >= von && e.datum <= bis);
  /* Die privaten Notizen werden nur gelesen, wenn jemand den Haken
     wirklich gesetzt hat. Ein Auszug ohne diesen Haken fasst sie nicht
     einmal an — auch nicht, um sie danach wegzuwerfen. */
  const privat = umfang?.privat ? await privatLaden([...new Set(einheiten.map(e => e.datum))]) : {};
  return auszug({
    name,
    einheiten,
    programme,
    protokolle,
    privat,
    umfang,
    helfer: { uebungen: uebungenVon, eintrag: eintragVon },
    von, bis,
  });
}

/* ── Die Liste ─────────────────────────────────────────────────────*/

export async function teilenOeffnen() {
  $('secTeilen').hidden = false;
  $('teilenForm').hidden = true;
  window.scrollTo?.(0, 0);
  zeichne();
  freigaben = await meineFreigaben(user.uid);
  zeichne();
  void allesAuffrischen();
}

export function teilenSchliessen() {
  $('secTeilen').hidden = true;
  zurueckRuf();
}

export const teilenOffen = () => $('secTeilen')?.hidden === false;

/**
 * Alle gültigen Freigaben mit dem heutigen Stand versehen.
 *
 * Das ist der Preis des Auszugs (siehe training-teilen.js): er ist ein
 * Stand, kein Fenster. Aufgefrischt wird darum bei jedem Öffnen dieser
 * Ansicht — und einmal je Sitzung, damit zwei Besuche hintereinander
 * nicht zweimal schreiben.
 */
async function allesAuffrischen() {
  if (aufgefrischt || !Array.isArray(freigaben)) return;
  aufgefrischt = true;
  for (const f of freigaben) {
    if (abgelaufen(f)) continue;
    try {
      const neu = await auszugBauen(f.umfang);
      await freigabeAuffrischen(f.code, { daten: neu });
      f.daten = auszugText(neu);
      f.stand = Date.now();
    } catch (e) { reportClientError('teilen/auffrischen', e); }
  }
  zeichne();
}

const UMFANG_WORT = {
  uebungen: () => t('tg.umfUebungenKurz', 'Übungen'),
  fortschritt: () => t('tg.umfFortschrittKurz', 'Fortschritt'),
  werte: () => t('tg.umfWerteKurz', 'Werte'),
  notizen: () => t('tg.umfNotizenKurz', 'Notizen'),
  privat: () => t('tg.umfPrivatKurz', 'private Notizen'),
};

function umfangText(umfang) {
  const teile = Object.keys(UMFANG_WORT).filter(k => umfang?.[k]).map(k => UMFANG_WORT[k]());
  return teile.length
    ? t('tg.zeigt', 'Zeigt: Einheiten, {liste}', { liste: teile.join(', ') })
    : t('tg.zeigtNur', 'Zeigt nur die Einheiten.');
}

function datum(wert) {
  const ms = alsZeit(wert);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(window.TVZAI18n?.lang || 'de-CH',
      { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function zeichne() {
  const liste = $('teilenListe');
  if (!liste) return;
  if (freigaben === null) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('common.laden', 'Lädt …'))}</p>`;
    return;
  }
  if (!Array.isArray(freigaben)) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('tg.listeFehler', 'Deine Links liessen sich gerade nicht laden.'))}</p>`;
    return;
  }
  if (!freigaben.length) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('tg.keine', 'Du teilst dein Training mit niemandem.'))}</p>`;
    return;
  }
  const wurzel = location.origin + location.pathname.replace(/\/pages\/[^/]*$/, '');
  liste.innerHTML = freigaben.map(f => {
    const weg = abgelaufen(f);
    return `
    <div class="teilen-karte${weg ? ' ist-abgelaufen' : ''}" data-freigabe="${escHtml(f.code)}">
      <p class="teilen-karte__kopf">
        <span class="teilen-karte__wer">${escHtml(f.label || t('tg.ohneName', 'Ohne Namen'))}</span>
        <span class="teilen-karte__bis">${escHtml(weg
          ? t('tg.abgelaufen', 'abgelaufen')
          : t('tg.gilt', 'gilt bis {datum}', { datum: datum(f.bis) }))}</span>
      </p>
      <p class="teilen-karte__umfang">${escHtml(umfangText(f.umfang))}</p>
      <p class="teilen-karte__umfang">${escHtml(t('tg.erstelltAm', 'Erstellt: {datum}', { datum: datum(f.erstellt) }))}</p>
      ${weg ? '' : `<p class="teilen-karte__adresse">${escHtml(teilenLink(f.code, wurzel))}</p>`}
      <div class="teilen-karte__knoepfe">
        ${weg
          ? `<button class="b b--secondary" type="button" data-teilen-neu="${escHtml(f.code)}">${escHtml(t('tg.verlaengern', 'Wieder freigeben'))}</button>`
          : `<button class="b b--secondary" type="button" data-teilen-kopieren="${escHtml(f.code)}">${escHtml(t('einl.kopieren', 'Kopieren'))}</button>
             <button class="b b--secondary" type="button" data-teilen-teilen="${escHtml(f.code)}">${escHtml(t('einl.teilen', 'Teilen'))}</button>`}
        <button class="b b--danger" type="button" data-teilen-weg="${escHtml(f.code)}">${escHtml(t('tg.zurueckziehen', 'Zurückziehen'))}</button>
      </div>
    </div>`;
  }).join('');
}

/* ── Anlegen ───────────────────────────────────────────────────────*/

export function teilenFormOeffnen() {
  $('teilenForm').hidden = false;
  $('btnTeilenNeu').hidden = true;
  $('teilenLabel').value = '';
  $('teilenFehler').hidden = true;
  for (const [feld, id] of Object.entries(FELDER)) $(id).checked = UMFANG_VORGABE[feld] === true;
  umfangGeaendert();
  $('teilenLabel').focus();
}

export function teilenFormSchliessen() {
  $('teilenForm').hidden = true;
  $('btnTeilenNeu').hidden = false;
}

const FELDER = {
  uebungen: 'umfUebungen',
  fortschritt: 'umfFortschritt',
  werte: 'umfWerte',
  notizen: 'umfNotizen',
  privat: 'umfPrivat',
};

function umfangLesen() {
  const roh = { einheiten: true };
  for (const [feld, id] of Object.entries(FELDER)) roh[feld] = $(id).checked === true;
  return umfangSauber(roh);
}

/** Ohne Übungen gibt es nichts, woran Werte oder Notizen hingen. */
export function umfangGeaendert() {
  const uebungen = $('umfUebungen').checked;
  for (const id of ['umfWerte', 'umfNotizen', 'umfPrivat']) {
    const el = $(id);
    el.disabled = !uebungen;
    if (!uebungen) el.checked = false;
  }
  $('umfPrivatWarnung').hidden = !$('umfPrivat').checked;
}

export async function teilenErstellen() {
  const fehler = $('teilenFehler');
  const zeigeFehler = text => { fehler.hidden = !text; fehler.textContent = text || ''; };
  const label = $('teilenLabel').value.trim();
  if (!label) { zeigeFehler(t('tg.ohneWer', 'Sag kurz, für wen der Link ist.')); return; }

  const umfang = umfangLesen();
  if (umfang.privat) {
    const ja = await frage({
      titel: t('tg.privatTitel', 'Private Notizen mitgeben?'),
      text: t('tg.privatFrage', '„Nur für mich“ sieht sonst niemand — auch deine Trainerin in der Gruppe nicht. Mit diesem Link geht es an {wer}.', { wer: label }),
      ja: t('tg.privatJa', 'Ja, mitgeben'),
    });
    if (!ja) { $('umfPrivat').checked = false; umfangGeaendert(); return; }
  }

  zeigeFehler('');
  const knopf = $('btnTeilenErstellen');
  knopf.disabled = true;
  try {
    const neu = await freigabeAnlegen(user.uid, {
      label,
      umfang,
      daten: await auszugBauen(umfang),
      tage: Number($('teilenTage').value) || GUELTIG_TAGE,
    });
    freigaben = [neu, ...(Array.isArray(freigaben) ? freigaben : [])];
    teilenFormSchliessen();
    zeichne();
    await kopieren(neu.code, { still: true });
    await meldung({
      titel: t('tg.fertig', 'Link erstellt'),
      text: t('tg.fertigText', 'Der Link liegt in der Zwischenablage. Er gilt {n} Tage und lässt sich jederzeit zurückziehen.', { n: Number($('teilenTage').value) || GUELTIG_TAGE }),
    });
  } catch (e) {
    reportClientError('teilen/anlegen', e);
    zeigeFehler(t('tg.anlegenWeg', 'Der Link liess sich nicht erstellen — versuch es gleich nochmal.'));
  }
  knopf.disabled = false;
}

/* ── Die Knöpfe an einer Karte ─────────────────────────────────────*/

function linkVon(code) {
  const wurzel = location.origin + location.pathname.replace(/\/pages\/[^/]*$/, '');
  return teilenLink(code, wurzel);
}

async function kopieren(code, { still = false } = {}) {
  try {
    await navigator.clipboard.writeText(linkVon(code));
    if (!still) await meldung({ titel: t('einl.kopiert', 'Kopiert') });
  } catch (e) {
    if (!still) await meldung({ titel: t('tg.kopierenWeg', 'Kopieren ging nicht'), text: linkVon(code) });
  }
}

export async function teilenAktion(event) {
  const kopieren_ = event.target.closest('[data-teilen-kopieren]');
  if (kopieren_) { await kopieren(kopieren_.dataset.teilenKopieren); return; }

  const teilen = event.target.closest('[data-teilen-teilen]');
  if (teilen) {
    const code = teilen.dataset.teilenTeilen;
    const f = freigaben.find(x => x.code === code);
    const text = t('tg.nachricht', '{name} teilt sein Training mit dir: {link}', {
      name: name || t('tg.jemand', 'Jemand'), link: linkVon(code),
    });
    /* Nur `text`, nie zusätzlich `url` — iOS setzte den Link sonst
       zweimal (dieselbe Falle wie bei den Einladungen). */
    try { await navigator.share({ text }); }
    catch { await kopieren(code); }
    void f;
    return;
  }

  const verlaengern = event.target.closest('[data-teilen-neu]');
  if (verlaengern) {
    const code = verlaengern.dataset.teilenNeu;
    try {
      await freigabeVerlaengern(code);
      const f = freigaben.find(x => x.code === code);
      if (f) {
        f.bis = new Date(Date.now() + GUELTIG_TAGE * 86400000);
        await freigabeAuffrischen(code, { daten: await auszugBauen(f.umfang) });
        f.stand = Date.now();
      }
      zeichne();
    } catch (e) {
      reportClientError('teilen/verlaengern', e);
      await meldung({ titel: t('tg.fehler', 'Das hat nicht geklappt') });
    }
    return;
  }

  const weg = event.target.closest('[data-teilen-weg]');
  if (weg) {
    const code = weg.dataset.teilenWeg;
    const f = freigaben.find(x => x.code === code);
    const ja = await frage({
      titel: t('tg.wegTitel2', 'Link zurückziehen?'),
      text: t('tg.wegFrage', 'Der Link von {wer} hört sofort auf zu wirken. Das lässt sich nicht rückgängig machen — ein neuer Link ist ein neuer Link.', { wer: f?.label || t('tg.ohneName', 'Ohne Namen') }),
      ja: t('tg.zurueckziehen', 'Zurückziehen'),
      gefahr: true,
    });
    if (!ja) return;
    try {
      await freigabeZurueckziehen(code);
      freigaben = freigaben.filter(x => x.code !== code);
      zeichne();
    } catch (e) {
      reportClientError('teilen/zurueckziehen', e);
      await meldung({ titel: t('tg.fehler', 'Das hat nicht geklappt') });
    }
  }
}

/** Die Knöpfe verdrahten — einmal, beim Start der Seite. */
export function teilenVerdrahten() {
  $('btnTeilen')?.addEventListener('click', () => void teilenOeffnen());
  $('btnTeilenZurueck')?.addEventListener('click', teilenSchliessen);
  $('btnTeilenNeu')?.addEventListener('click', teilenFormOeffnen);
  $('btnTeilenAbbrechen')?.addEventListener('click', teilenFormSchliessen);
  $('btnTeilenErstellen')?.addEventListener('click', () => void teilenErstellen());
  $('teilenUmfang')?.addEventListener('change', umfangGeaendert);
  $('teilenListe')?.addEventListener('click', event => void teilenAktion(event));
}
