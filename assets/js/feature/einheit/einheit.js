/* ══════════════════════════════════════════════════════════════════
   Der Einheiten-Player.

   Eine Übung nach der anderen, Sätze beim Machen erfasst. Der ganze
   Unterschied zu einer Liste liegt in der Situation: im Kraftraum hält
   man ein Telefon in der einen Hand und eine Hantel in der anderen.
   Was zählt, ist "was ist jetzt dran" und "was habe ich gerade
   geschafft" — nicht ein Wochenplan zum Überfliegen.

   Aufgerufen mit ?g=<gruppe>&p=<plan>[&u=<einheit>][&d=<datum>].

   ── Der Plan eines anderen ────────────────────────────────────────
   Die Leitung sieht in der Gruppe die Pläne ALLER Athleten und öffnet
   von dort auch deren Einheiten. Dann ist der Player eine Ansicht: er
   zeigt, was der Athlet an dem Tag eingetragen hat — live, sobald es
   beim Server ist —, und schreibt nichts (die Regel liesse es auch
   nicht zu: geschrieben wird nur das eigene Protokoll).

   Die Logik steht in assets/js/einheit.js, ohne Firebase und ohne DOM.
   Hier ist nur, was der Browser dazutut: Felder, Klicks, Speichern.

   ── Speichern (v.35.64.0) ─────────────────────────────────────────
   Michel: am Handy trainiert, am PC stand nichts, Notizen waren weg.
   Bis v.35.63.0 schrieb der Player 900 ms nach der letzten Eingabe das
   GANZE Protokoll des Tages — ein zweites Gerät mit altem Stand schrieb
   so über das erste, und was in den letzten 900 ms vor dem Verlassen
   getippt war, ging nie hinaus. Jetzt:
   - jede Änderung liegt sofort im Gerät (protokoll-sicherung.js), bis
     der Server sie bestätigt;
   - geschrieben wird je Übung, in einer Transaktion, die nichts
     überschreibt, was dort neuer ist (aenderungenPruefen);
   - beim Wechsel der Übung, beim Verlassen und beim Wegschalten der
     App sofort, sonst 900 ms nach der letzten Eingabe — wer bei jedem
     Tastendruck schreibt, verbrennt das Kontingent;
   - was ein anderes Gerät einträgt, erscheint hier live;
   - oben steht, ob es gespeichert ist, noch aussteht oder scheiterte.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell, setShellTitle, setShellMeta } from '../../shell.js?v=29';
import {
  ladeGruppe, ladePlan, ladeProtokoll, ladeProtokolle, ladeMitglieder, PLAN_FUER_ALLE,
  protokollAbgleichen, beobachteProtokoll, ladePrivat, privatSetzen, privatEinheit,
} from '../../groups.js';
import {
  einheiten, uebungen, einheitTitel,
  eintrag, mitEintrag, eintragSauber, eintragSchluessel, abgleichen,
  fortschritt, naechsteOffene, saetze, satzOk,
  videoUrl, vorwochen, zeigtSaetze, kennzahlen, bilderFuer,
  letzteGewichte, pauseBereich, zeitVorgabe,
} from '../../einheit.js';
import { isoTag } from '../../termine.js';
import { rueckweg, einheitenAmTag } from '../../wochenplan.js';
import {
  tagSchluessel, sichern, bestaetigt, offeneFuer, nachtragen,
} from '../../protokoll-sicherung.js';

const $ = id => document.getElementById(id);

/* tOr und nicht t() mit ??: t() gibt bei unbekanntem Schluessel den
   SCHLUESSEL zurueck, nie undefined. Solange der Katalog laedt, bleibt
   es deutsch. */
/* Ohne i18n.js fehlte hier das Einsetzen der Platzhalter: aus
   "{grund}" wurde kein Grund, sondern das Wort {grund} selbst. */
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const tPlural = (key, n, eins, mehr) => {
  const wert = window.TVZAI18n?.format?.plural(key, n);
  return (!wert || String(wert).startsWith(key)) ? `${n} ${n === 1 ? eins : mehr}` : wert;
};
const VERZOEGERUNG = 900;

let user = null;
let gid = '';
let planId = '';
let datum = isoTag();
let programm = null;
let unitId = '';
let items = [];
let protokoll = { units: {} };
let pos = 0;
let timer = null;
let ansicht = false;       // der Plan eines anderen: nur ansehen
let bilder = {};           // images.json, einmal geladen
let verlauf = [];          // die eigenen Protokolle — "zuletzt 50 kg"
let amTag = [];            // die Einheiten des Tages (einheitenAmTag)
let privat = {};           // die eigenen privaten Notizen des Tages (trainingLogs)
let rueckZiel = '';

function zeige(id, an) {
  const el = $(id);
  if (el) el.hidden = !an;
}

function fehler(text) {
  const feld = $('ladeFehler');
  feld.textContent = text;
  feld.hidden = false;
}

/* ── Speichern ─────────────────────────────────────────────────────*/

const offen = new Map();     // eintragSchluessel -> { unitId, key, stand }: noch nicht beim Server
let speichertGerade = false;
let laufendes = null;
let nochmal = false;
let wiederholen = null;
let fehlerGemeldet = false;
const tagKey = () => tagSchluessel(gid, user.uid, datum);
const speicher = () => { try { return window.localStorage; } catch { return null; } };

/* Eine Übung ändert sich: ins Protokoll, sofort ins Gerät, bald hinaus.
   Der Stand steigt immer — auch wenn die Uhr des Geräts steht oder
   hinter der eines anderen herläuft, ist die eigene letzte Änderung die
   neuere. */
function geaendert(unit, key, patch) {
  if (ansicht) return;
  const jetzt = Math.max(Date.now(), (eintrag(protokoll, unit, key).stand || 0) + 1);
  protokoll = mitEintrag(protokoll, unit, key, { ...patch, stand: jetzt });
  offen.set(eintragSchluessel(unit, key), { unitId: unit, key, stand: jetzt });
  sichern(speicher(), tagKey(), {
    unitId: unit, key, eintrag: eintragSauber(eintrag(protokoll, unit, key)), stand: jetzt, plan: planId,
  });
  speichereBald();
}

function speichereBald() {
  if (ansicht) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void speichernJetzt(); }, VERZOEGERUNG);
}

const istOffline = e => (typeof navigator !== 'undefined' && navigator.onLine === false)
  || ['unavailable', 'deadline-exceeded'].includes(e?.code);

function speichernJetzt() {
  clearTimeout(timer);
  if (ansicht || !offen.size) return Promise.resolve();
  if (speichertGerade) { nochmal = true; return laufendes; }
  speichertGerade = true;
  const paket = [...offen.entries()].map(([s, o]) => ({
    s, unitId: o.unitId, key: o.key, stand: o.stand,
    eintrag: eintragSauber(eintrag(protokoll, o.unitId, o.key)),
  }));
  zeigeStand('speichert');
  laufendes = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw Object.assign(new Error('offline'), { code: 'unavailable' });
      }
      const r = await protokollAbgleichen(gid, user.uid, datum,
        paket.map(({ unitId: u, key, eintrag: e, stand }) => ({ unitId: u, key, eintrag: e, stand })), planId);
      const geschrieben = new Set(r?.geschrieben ?? paket.map(p => p.s));
      const verworfen = new Set(r?.verworfen ?? []);
      for (const p of paket) {
        if (!geschrieben.has(p.s) && !verworfen.has(p.s)) continue;
        bestaetigt(speicher(), tagKey(), p.s, p.stand);
        if (offen.get(p.s)?.stand === p.stand) offen.delete(p.s);
      }
      fehlerGemeldet = false;
      if (verworfen.size && r?.server) {
        /* Ein anderes Gerät war neuer: dort gilt jetzt, was es eingetragen hat. */
        protokoll = abgleichen(protokoll, r.server, offen);
        neuZeichnen();
        zeigeStand('konflikt');
      } else {
        zeigeStand(offen.size ? 'speichert' : 'gespeichert');
      }
    } catch (e) {
      const weg = istOffline(e);
      if (!weg && !fehlerGemeldet) { reportClientError('einheit/speichern', e); fehlerGemeldet = true; }
      /* Kein Dialog: man steht mit einer Hantel da. Oben steht, dass es
         noch nicht draussen ist; es wird weiter versucht. */
      zeigeStand(weg ? 'offline' : 'fehler');
      clearTimeout(wiederholen);
      wiederholen = setTimeout(() => { void speichernJetzt(); }, weg ? 5000 : 15000);
    } finally {
      speichertGerade = false;
    }
    if (nochmal) { nochmal = false; if (offen.size) await speichernJetzt(); }
  })();
  return laufendes;
}

/* Was oben steht. */
let standJetzt = '';
function zeigeStand(neu) {
  standJetzt = neu;
  const el = $('speicherStand');
  if (!el) return;
  const texte = {
    speichert: t('eh.st.speichert', 'Speichert …'),
    gespeichert: t('eh.st.gespeichert', 'Gespeichert'),
    offline: t('eh.st.offline', 'Noch nicht synchronisiert — wird gesendet, sobald wieder Netz ist.'),
    fehler: t('eh.st.fehler', 'Nicht gespeichert. Es wird weiter versucht.'),
    konflikt: t('eh.st.konflikt', 'Auf einem anderen Gerät wurde neuer eingetragen — das gilt jetzt.'),
    fern: t('eh.st.fern', 'Von einem anderen Gerät aktualisiert.'),
  };
  el.dataset.stand = neu;
  el.hidden = !texte[neu];
  $('speicherText').textContent = texte[neu] || '';
  $('btnNochmalSpeichern').hidden = neu !== 'fehler' && neu !== 'offline';
}

/* Die private Notiz: nur für einen selbst (users/{uid}/trainingLogs). */
let privatTimer = null;
let privatOffen = null;      // { unitId, key, text }
function privatGeaendert() {
  if (ansicht || !items[pos]) return;
  const text = $('uebPrivat').value;
  const u = privatEinheit(gid, unitId);
  privat = { ...privat, [u]: { items: { ...(privat[u]?.items || {}), [items[pos].key]: { privat: text } } } };
  privatOffen = { unitId, key: items[pos].key, text };
  clearTimeout(privatTimer);
  privatTimer = setTimeout(privatJetzt, VERZOEGERUNG);
}
function privatJetzt() {
  clearTimeout(privatTimer);
  const x = privatOffen;
  if (!x || ansicht) return;
  privatOffen = null;
  privatSetzen(user.uid, datum, gid, x.unitId, x.key, x.text).catch(e => {
    reportClientError('einheit/privat', e);
    if (!privatOffen) privatOffen = x;
    zeigeStand(istOffline(e) ? 'offline' : 'fehler');
  });
}
const privatText = key => privat[privatEinheit(gid, unitId)]?.items?.[key]?.privat || '';

/* Wechsel der Übung, Verlassen der Seite: jetzt, nicht in 900 ms. */
function jetztAlles() {
  privatJetzt();
  return speichernJetzt();
}

/* Wer gerade tippt, dem wird das Feld nicht unter den Fingern neu
   gezeichnet — was von einem anderen Gerät kommt, wartet bis danach. */
let spaeterZeichnen = false;
function tipptGerade() {
  const el = document.activeElement;
  return !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !!el.closest?.('#secPlayer');
}
function neuZeichnen() {
  if (tipptGerade()) { spaeterZeichnen = true; return; }
  spaeterZeichnen = false;
  if (!$('secPlayer').hidden) zeichnePlayer();
  else if (!$('secWahl').hidden) zeichneWahl();
}

/* Der Inhalt eines Protokolls ohne Reihenfolge — um zu sehen, ob vom
   Server wirklich etwas Neues kam. */
function inhalt(p) {
  const units = p?.units || {};
  return JSON.stringify(Object.keys(units).sort().map(u => [u,
    Object.keys(units[u]?.items || {}).sort().map(k => [k, eintragSauber(eintrag(p, u, k))])]));
}

function hoereProtokoll(wessen) {
  let erstes = true;
  beobachteProtokoll(gid, wessen, datum, ({ daten }) => {
    if (ansicht) zeigeAnsichtStand(daten);
    if (!daten) { erstes = false; return; }
    const vorher = inhalt(protokoll);
    protokoll = abgleichen(protokoll, daten, offen);
    if (!protokoll.units) protokoll.units = {};
    if (inhalt(protokoll) === vorher) { erstes = false; return; }
    neuZeichnen();
    if (!erstes && !ansicht && !offen.size) zeigeStand('fern');
    erstes = false;
  }, e => reportClientError('einheit/live', e));
}

/* ── Einheit wählen ────────────────────────────────────────────────
   Aus der Woche öffnet man die Einheit des Tages direkt (v.35.64.0,
   Michel: "'Einheit wählen/wechseln' aus dem normalen Ablauf
   entfernen"). Diese Liste steht nur noch, wenn ein Tag mehrere hat —
   dann nur diese — oder wenn der Player ohne Tag geöffnet wurde. */

function zeichneWahl() {
  const liste = $('listEinheiten');
  const alle = amTag.length
    ? amTag.map(id => ({ id, titel: einheitTitel(programm, id), anzahl: uebungen(programm, id).length }))
    : einheiten(programm);
  $('wahlTitel').textContent = amTag.length
    ? t('eh.einheitenAmTag', 'Einheiten an diesem Tag')
    : t('eh.waehlen', 'Einheit wählen');

  liste.innerHTML = alle.length
    ? alle.map(e => {
        const f = fortschritt(uebungen(programm, e.id), protokoll, e.id);
        const rechts = e.anzahl === 0 ? '' : `${f.erledigt}/${f.gesamt}`;
        return `
          <button class="row" type="button" data-einheit="${escHtml(e.id)}" data-bereich="t-training">
            <span class="row__icon">${escHtml(String(e.anzahl || '·'))}</span>
            <span class="row__body">
              <span class="row__title">${escHtml(e.titel)}</span>
              <span class="row__sub">${escHtml(e.anzahl
                ? tPlural('eh.uebungen', e.anzahl, 'Übung', 'Übungen')
                : t('eh.nurHinweise', 'Hinweise, keine Übungen'))}</span>
            </span>
            <span class="row__end">${escHtml(rechts)}</span>
          </button>`;
      }).join('')
    : `<p class="empty-hint">${escHtml(t('eh.keineEinheiten', 'Dieser Plan enthält keine Einheiten.'))}</p>`;

  zeige('secWahl', true);
  zeige('secPlayer', false);
  zeige('secFertig', false);
}

/* Mehrere Einheiten am selben Tag: oben zum Umschalten, nur diese. */
function zeichneTagWahl() {
  const el = $('tagEinheiten');
  el.hidden = amTag.length < 2;
  el.innerHTML = amTag.length < 2 ? '' : amTag.map(id => `
    <button class="seg__item" type="button" data-tag-einheit="${escHtml(id)}"
            aria-pressed="${id === unitId ? 'true' : 'false'}">${escHtml(einheitTitel(programm, id))}</button>`).join('');
  /* Die ganze Liste nur, wo es keinen Tag gibt, der sie eingrenzt. */
  $('btnZurWahl').hidden = amTag.length > 0 || einheiten(programm).length < 2;
}

/* ── Der Player ────────────────────────────────────────────────────*/

/* Ein Gewicht ist eine Zahl in kg — die Vorlage schreibt "50", man liest "50 kg". */
const mitKg = w => (/^\d+([.,]\d+)?$/.test(String(w).trim()) ? `${String(w).trim()} kg` : String(w).trim());

/* "Wiederholungen × Gewicht" (v.35.64.0), wie auf dem Blatt der
   Leitung: "5 × 40 kg". Bis dahin stand "5× 40 kg" hier und "40 kg 5×"
   im Feld darunter. Ein fehlender Wert ist kein "0 kg" — er fehlt. */
function satzText({ reps, weight, koerper, dauer, strecke }) {
  const r = String(reps ?? '').trim();
  const w = String(weight ?? '').trim();
  const gewicht = koerper
    ? (w ? t('eh.koerperPlus', 'Körpergewicht + {wert}', { wert: mitKg(w) }) : t('eh.koerper', 'Körpergewicht'))
    : (w ? mitKg(w) : '');
  const haupt = r && gewicht ? `${r} × ${gewicht}`
    : r ? t('eh.wdhKurz', '{n} Wdh.', { n: r })
    : gewicht;
  return [haupt, String(dauer ?? '').trim(), String(strecke ?? '').trim()].filter(Boolean).join(' · ');
}

/* Die Vorgabe als Satz: das Gewicht des Plans, sonst das aus dem Satz
   davor oder vom letzten Mal — und sagt der Plan "??", bestimmt der
   Athlet. */
function zielText(reihe) {
  const gewicht = reihe.zielWert
    ? mitKg(reihe.zielWert)
    : reihe.vorschlagDavor
      ? t('eh.wieDavor', '{wert} wie davor', { wert: mitKg(reihe.vorschlag) })
    : reihe.vorschlagZuletzt
      ? t('eh.zuletzt', 'zuletzt {wert}', { wert: mitKg(reihe.vorschlag) })
      : reihe.gewichtFrage ? t('eh.gewichtEintragen', 'Gewicht eintragen') : '';
  const r = String(reihe.zielReps || '').trim();
  return r && gewicht ? `${r} × ${gewicht}` : r ? t('eh.wdhKurz', '{n} Wdh.', { n: r }) : gewicht;
}

/* Wo Dauer und Strecke ein Feld bekommen: wenn die Übung davon spricht
   oder schon etwas darin steht. */
const DAUER = /^(zeit|dauer|time)$/i;
const STRECKE = /^(strecke|distanz|distance|meter|km)$/i;
const brauchtDauer = (item, reihe) => !!reihe.dauer || kennzahlen(item).some(k => DAUER.test(k.label));
const brauchtStrecke = (item, reihe) => !!reihe.strecke || kennzahlen(item).some(k => STRECKE.test(k.label));

/**
 * Eine Satzzeile (v.35.64.0). Die grosse Fläche IST der Haken: ein Tipp
 * hakt ab (mit der Vorgabe), ein zweiter nimmt ihn zurück. Bearbeiten
 * ist ein eigener Knopf daneben und hakt nichts ab — bis v.35.63.0
 * machte jeder eingetragene Wert den Satz "gemacht" (Michel: "darf den
 * Satz nicht zusätzlich abhaken").
 */
function satzZeile(item, reihe, index, offenZeile) {
  const gemacht = reihe.ok;
  const ziel = zielText(reihe);
  const ist = satzText(reihe);
  const felder = !ansicht && offenZeile;
  const nr = index + 1;
  const feld = (name, wert, platz, label, modus = 'decimal') => `
    <label class="satz__feld">
      <span class="satz__feldname">${escHtml(label)}</span>
      <input class="form-input" type="text" inputmode="${modus}" maxlength="20"
             data-satz="${index}" data-feld="${name}"
             value="${escHtml(wert)}" placeholder="${escHtml(platz)}" />
    </label>`;
  return `
    <div class="satz${gemacht ? ' satz--gemacht' : ''}${felder ? ' satz--offen' : ''}" data-bereich="t-training" data-satz-zeile="${index}">
      <button class="satz__flaeche" type="button" data-satz-tippen="${index}"${ansicht ? ' disabled' : ''}
              aria-pressed="${gemacht ? 'true' : 'false'}"
              aria-label="${escHtml(gemacht
                ? t('eh.satzZurueck', 'Satz {n} abgehakt — tippen nimmt es zurück', { n: nr })
                : t('eh.satzAbhaken', 'Satz {n} wie geplant', { n: nr }))}">
        <span class="satz__haken" aria-hidden="true">${gemacht
          ? '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path d="M20 6L9 17l-5-5"/></svg>'
          : escHtml(String(nr))}</span>
        <span class="satz__text">
          <span class="satz__titel">${escHtml(reihe.label)}</span>
          <span class="row__sub satz__ziel">${escHtml(ziel || t('eh.keinZiel', 'kein Ziel angegeben'))}</span>
        </span>
        <span class="satz__wert" data-satz-wert="${index}">${escHtml(ist)}</span>
      </button>
      ${ansicht ? '' : `
      <button class="satz__stift" type="button" data-satz-oeffnen="${index}"
              aria-expanded="${felder ? 'true' : 'false'}"
              aria-label="${escHtml(t('eh.satzBearbeiten', 'Satz {n} bearbeiten', { n: nr }))}"
              title="${escHtml(t('eh.satzBearbeiten', 'Satz {n} bearbeiten', { n: nr }))}">
        <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>`}
      ${felder ? `
      <div class="satz__felder" data-satz-felder="${index}">
        ${feld('reps', reihe.reps, reihe.zielReps || t('eh.wdh', 'Wdh'), t('eh.wiederholungen', 'Wiederholungen'), 'numeric')}
        <span class="satz__mal" aria-hidden="true">×</span>
        <label class="satz__feld">
          <span class="satz__feldname">${escHtml(t('eh.gewicht', 'Gewicht (kg)'))}</span>
          <input class="form-input" type="text" inputmode="decimal" maxlength="20"
                 data-satz="${index}" data-feld="weight"
                 value="${escHtml(reihe.weight)}"
                 placeholder="${escHtml(reihe.vorschlag || t('eh.kg', 'kg'))}"
                 aria-label="${escHtml(t('eh.ariaWert', 'Gewicht {n}. Satz', { n: nr }))}" />
        </label>
        <label class="satz__koerper">
          <input type="checkbox" data-satz="${index}" data-feld="koerper"${reihe.koerper ? ' checked' : ''} />
          <span>${escHtml(t('eh.koerper', 'Körpergewicht'))}</span>
        </label>
        ${brauchtDauer(item, reihe) ? feld('dauer', reihe.dauer, t('eh.dauerBsp', 'z.B. 0:45'), t('eh.dauer', 'Dauer'), 'text') : ''}
        ${brauchtStrecke(item, reihe) ? feld('strecke', reihe.strecke, t('eh.streckeBsp', 'z.B. 400 m'), t('eh.strecke', 'Strecke'), 'text') : ''}
        <button class="b b--secondary satz__fertig" type="button" data-satz-zu="${index}">${escHtml(t('eh.fertig', 'Fertig'))}</button>
      </div>` : ''}
    </div>`;
}

const reihenFuer = (item, e) => saetze(item, e, letzteGewichte(verlauf, item, datum));

/* Welche Zeilen der Nutzer aufgeklappt hat — nur fuer diese Ansicht,
   nichts davon gehoert ins Protokoll. */
let offeneSaetze = new Set();
let offenFuer = null;          // fuer welche Uebung sie gelten
let abhakenBeiFertig = -1;     // der Tipp auf den Haken öffnete das Feld: "Fertig" hakt ab

/* Wie weit die Einheit ist: erledigte Übungen ganz, angefangene nach
   ihren Sätzen — aber nie ganz, solange "Übung erledigt" fehlt. */
function anteilVon() {
  if (!items.length) return 0;
  const summe = items.reduce((n, item) => {
    const e = eintrag(protokoll, unitId, item.key);
    if (e.done) return n + 1;
    const geplant = Math.max(Array.isArray(item.sets) ? item.sets.length : 0, e.sets.length);
    return n + (geplant ? Math.min(0.9, e.sets.filter(satzOk).length / geplant) : 0);
  }, 0);
  return Math.round((summe / items.length) * 100);
}

function zeichnePlayer() {
  const item = items[pos];
  if (!item) return;

  /* Die aufgeklappten Zeilen gehoeren zur ANSICHT einer Uebung, nicht
     zum Protokoll. Wer weiterblaettert, faengt zugeklappt an — und
     kein Aufrufer muss daran denken. */
  if (offenFuer !== item.key) { offeneSaetze = new Set(); offenFuer = item.key; abhakenBeiFertig = -1; }

  const e = eintrag(protokoll, unitId, item.key);
  const f = fortschritt(items, protokoll, unitId);

  /* Über die Hülle: mountShell hat den Kopf der Seite ersetzt (setShellMeta). */
  setShellTitle(einheitTitel(programm, unitId));
  setShellMeta(t('eh.fortschritt', '{n} von {gesamt} erledigt', { n: f.erledigt, gesamt: f.gesamt }));
  zeichneTagWahl();

  $('uebPos').textContent = t('eh.uebungVon', 'Übung {n} von {gesamt}',
    { n: pos + 1, gesamt: items.length });
  $('uebName').textContent = item.name;

  /* Der Fortschritt als Leiste statt als graue Zeile. */
  const anteil = anteilVon();
  $('uebFuellung').style.width = anteil + '%';
  $('uebLeiste').setAttribute('aria-valuenow', String(anteil));
  $('uebLeiste').setAttribute('aria-label',
    t('eh.fortschritt', '{n} von {gesamt} erledigt', { n: f.erledigt, gesamt: f.gesamt }));

  /* Das Video steht in der Vorlage eine Zeile unter dem Namen. Hier
     gehoert es an den Namen — wer die Uebung kennt, sieht es nicht. */
  const video = videoUrl(item);
  $('uebVideo').hidden = !video;
  if (video) $('uebVideo').href = video;

  /* Alternativname, Pause und TUT stehen im Plan und sind beim Machen
     genau das, was man wissen will. */
  const meta = [item.alt, item.pause && t('eh.pause', 'Pause {wert}', { wert: item.pause }), item.tut && `TUT ${item.tut}`,
                ...kennzahlen(item).map(k => (k.label ? `${k.label} ${k.wert}` : k.wert)),
                ...(item.lines || [])]
    .filter(Boolean).join(' · ');
  $('uebMeta').textContent = meta;
  $('uebMeta').hidden = !meta;

  /* Bilder, wo die Vorlage welche hat. Der Name kommt aus unserer
     eigenen images.json und ist in bilderFuer() auf einen schlichten
     Dateinamen geprueft, bevor er in ein src wandert. */
  const bildNamen = bilderFuer(bilder, unitId, item);
  $('uebBilder').innerHTML = bildNamen.map(name =>
    `<img loading="lazy" src="../assets/img/training/${escHtml(name)}" alt="${escHtml(item.name)}" />`).join('');
  $('uebBilder').hidden = !bildNamen.length;

  const reihen = zeigtSaetze(item) ? reihenFuer(item, e) : [];
  $('listSaetze').innerHTML = reihen.length
    ? reihen.map((r, i) => satzZeile(item, r, i, offeneSaetze.has(i))).join('')
    : `<p class="empty-hint">${escHtml(t('eh.keineSaetze', 'Keine Sätze vorgegeben — nur abhaken.'))}</p>`;

  /* Die andere Trainingswoche. Ein Plan laeuft zwei Wochen, und genau
     aus dem Nebeneinander liest man ab, ob es besser geworden ist. */
  const wochen = vorwochen(item);
  const kasten = $('uebVorwochen');
  kasten.hidden = !wochen.length;
  kasten.innerHTML = wochen.length
    ? `<div class="marke brief__marke">${escHtml(t('eh.vorwoche', 'Andere Trainingswoche'))}</div>`
      + wochen.map(w => `
        <div class="vorwoche">
          <span class="vorwoche__tag">${escHtml(w.woche || '—')}</span>
          <span class="vorwoche__werte">${escHtml(w.werte.filter(Boolean).join(' · ') || '—')}</span>
          ${w.bemerkung ? `<span class="vorwoche__notiz">${escHtml(w.bemerkung)}</span>` : ''}
        </div>`).join('')
    : '';

  uhrFuerUebung(item);

  $('uebNotiz').value = e.note;
  $('uebNotiz').readOnly = ansicht;
  zeige('grpPrivat', !ansicht);
  if (!ansicht) $('uebPrivat').value = privatText(item.key);
  $('btnErledigt').hidden = ansicht;

  /* Alle Sätze abgehakt: "Übung erledigt" ist jetzt der nächste Schritt. */
  const alleOk = reihen.length > 0 && reihen.every(r => r.ok);
  const erledigt = e.done;
  const knopf = $('btnErledigt');
  knopf.textContent = erledigt ? t('eh.nochmal', 'Erledigt — nochmal öffnen') : t('eh.erledigt', 'Übung erledigt');
  knopf.classList.toggle('b--primary', !erledigt);
  knopf.classList.toggle('b--secondary', erledigt);
  knopf.classList.toggle('is-bereit', alleOk && !erledigt);

  $('btnVor').disabled = pos === 0;
  $('btnWeiter').disabled = pos >= items.length - 1;

  zeige('secWahl', false);
  zeige('secPlayer', true);
  zeige('secFertig', false);
}

function starte(id) {
  if (id !== unitId) jetztAlles();
  unitId = id;
  items = uebungen(programm, id);

  if (!items.length) {
    /* Ein Notizblatt hat nichts zum Abhaken. Es zu öffnen und einen
       leeren Player zu zeigen wäre schlechter, als es zu sagen. */
    fehler(t('eh.nurNotizen', 'Diese Einheit enthält Hinweise, aber keine Übungen zum Abhaken.'));
    return;
  }

  $('ladeFehler').hidden = true;
  const naechste = naechsteOffene(items, protokoll, unitId, 0);
  pos = naechste === -1 ? 0 : naechste;
  uhrZurueckholen();
  zeichnePlayer();
}

function weiter() {
  /* Nach dem Abhaken springt der Player zur nächsten OFFENEN Übung,
     nicht einfach zur nächsten in der Liste. Wer die Reihenfolge
     durchbricht — weil eine Bank besetzt war —, soll nicht wieder an
     erledigten vorbeiblättern. */
  const naechste = naechsteOffene(items, protokoll, unitId, pos + 1);
  if (naechste === -1) {
    const f = fortschritt(items, protokoll, unitId);
    $('fertigText').textContent = f.fertig
      ? t('eh.alleFertig', '{titel} — alle {n} Übungen erledigt.',
          { titel: einheitTitel(programm, unitId), n: f.gesamt })
      : t('eh.letzte', 'Das war die letzte Übung.');
    zeige('secPlayer', false);
    zeige('secFertig', true);
    return;
  }
  pos = naechste;
  zeichnePlayer();
}

/* Rückgängig (v.35.64.0): "Übung erledigt" springt weiter — wer sich
   vertippt hat, holt es mit einem Tipp zurück, statt zu suchen. */
let rueckTimer = null;
let rueckAktion = null;
function rueckgaengigAnbieten(text, aktion) {
  rueckAktion = aktion;
  $('rueckText').textContent = text;
  $('rueckgaengig').hidden = false;
  clearTimeout(rueckTimer);
  rueckTimer = setTimeout(() => { $('rueckgaengig').hidden = true; rueckAktion = null; }, 6000);
}
function rueckgaengigGeklickt() {
  clearTimeout(rueckTimer);
  $('rueckgaengig').hidden = true;
  const a = rueckAktion;
  rueckAktion = null;
  a?.();
}

/* ── Der Timer ─────────────────────────────────────────────────────
   Michel: "einen Timer für die Übungen, der die Zeit für Pausen und für
   die, die ganz auf Zeit basieren, stoppen kann." Zwei Arten:
     pause  läuft nach einem abgehakten Satz von selbst an, so lang wie
            der Plan sagt; bei einem Bereich ("180-240 Sec") stehen
            beide Längen zur Wahl, die untere ist vorgewählt (v.35.64.0);
            Anhalten, Fortsetzen, +15 s, Neu starten, Überspringen;
     zeit   eine Übung auf Zeit ("30 Sec pro Seite", 2 Sätze → vier
            Runden), jede Runde startet man selbst.
   Es gibt EINE Uhr. Gerechnet wird mit der Endzeit, nicht mit Ticks:
   ein iPhone hält Intervalle im Hintergrund an, die Uhr stimmt beim
   Zurückkommen trotzdem. Eine laufende Pause übersteht den Wechsel der
   Übung und das Neuladen der Seite (sessionStorage). */

const uhr = { art: '', dauer: 0, rest: 0, ende: 0, laeuft: false, runde: 1, runden: 1, proSeite: false, fuer: '', satz: -1, bereich: null, takt: null };
const UHR_MERKER = 'firn.einheit.uhr';
const pauseWahl = new Map();   // Übung -> gewählte Länge der Pause
let ton = null;

/* Ein Ton am Ende — erst nach einem Tipp erlaubt (iOS), darum hier. */
function tonFreigeben() {
  if (ton) return;
  try { ton = new (window.AudioContext || window.webkitAudioContext)(); } catch { ton = null; }
}
function signal() {
  navigator.vibrate?.([200, 100, 200]);
  if (!ton) return;
  try {
    const osc = ton.createOscillator();
    const lautst = ton.createGain();
    osc.frequency.value = 880;
    lautst.gain.setValueAtTime(0.25, ton.currentTime);
    lautst.gain.exponentialRampToValueAtTime(0.001, ton.currentTime + 0.6);
    osc.connect(lautst).connect(ton.destination);
    osc.start();
    osc.stop(ton.currentTime + 0.6);
  } catch { /* ohne Ton geht es auch */ }
}

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const uhrOrt = () => `${gid}|${planId}|${datum}|${unitId}`;
const uhrBleibt = () => (uhr.laeuft ? Math.max(0, Math.ceil((uhr.ende - Date.now()) / 1000)) : uhr.rest);

function uhrMerken() {
  try {
    if (uhr.art !== 'pause' || uhrBleibt() === 0) { sessionStorage.removeItem(UHR_MERKER); return; }
    const { takt, ...rest } = uhr;
    sessionStorage.setItem(UHR_MERKER, JSON.stringify({ ...rest, ort: uhrOrt() }));
  } catch { /* ohne Merker läuft sie nur bis zum Neuladen */ }
}

/* Nach dem Neuladen: die Pause, die noch lief. */
function uhrZurueckholen() {
  try {
    const m = JSON.parse(sessionStorage.getItem(UHR_MERKER) || 'null');
    if (!m || m.ort !== uhrOrt() || m.art !== 'pause') return;
    const bleibt = m.laeuft ? Math.ceil((m.ende - Date.now()) / 1000) : m.rest;
    if (!(bleibt > 0)) { sessionStorage.removeItem(UHR_MERKER); return; }
    delete m.ort;
    clearInterval(uhr.takt);
    Object.assign(uhr, m, { takt: null });
    if (uhr.laeuft) uhr.takt = setInterval(uhrTakt, 250);
  } catch { /* dann eben ohne */ }
}

function uhrZeichnen() {
  const kasten = $('uhr');
  if (!uhr.art) { kasten.hidden = true; return; }
  kasten.hidden = false;
  const bleibt = uhrBleibt();
  $('uhrZeit').textContent = mmss(bleibt);
  $('uhrFuellung').style.width = `${uhr.dauer ? Math.round((1 - bleibt / uhr.dauer) * 100) : 0}%`;
  kasten.classList.toggle('is-fertig', bleibt === 0);
  const pause = uhr.art === 'pause';
  if (pause) {
    $('uhrWas').textContent = bleibt === 0 ? t('eh.pauseVorbei', 'Pause vorbei') : t('eh.pauseLaeuft', 'Pause');
    $('uhrRunde').textContent = '';
  } else {
    $('uhrWas').textContent = uhr.proSeite
      ? t('eh.seite', 'Seite {n}', { n: uhr.runde % 2 ? 1 : 2 })
      : t('eh.zeit', 'Auf Zeit');
    $('uhrRunde').textContent = uhr.runden > 1 ? t('eh.runde', 'Runde {n} von {m}', { n: uhr.runde, m: uhr.runden }) : '';
  }

  /* Ein Bereich im Plan: beide Längen zur Wahl. */
  const b = pause && uhr.bereich && uhr.bereich.bis > uhr.bereich.von ? uhr.bereich : null;
  const wahl = $('uhrBereich');
  wahl.hidden = !b;
  if (b) {
    const basis = uhr.dauer - (uhr.plus || 0);
    wahl.innerHTML = [b.von, b.bis].map(s => `
      <button class="seg__item" type="button" data-uhr-laenge="${s}" aria-pressed="${s === basis ? 'true' : 'false'}">${mmss(s)}</button>`).join('');
  }

  const angefangen = bleibt > 0 && bleibt < uhr.dauer;
  $('uhrStart').textContent = uhr.laeuft ? t('eh.anhalten', 'Anhalten')
    : bleibt === 0 && !pause && uhr.runde < uhr.runden ? t('eh.naechsteRunde', 'Nächste Runde')
    : bleibt === 0 ? t('eh.nochmalStart', 'Nochmal')
    : angefangen ? t('eh.fortsetzen', 'Fortsetzen')
    : t('eh.start', 'Start');
  $('uhrPlus').hidden = !pause;
  $('uhrPlus').textContent = t('eh.plus15', '+15 s');
  $('uhrReset').hidden = !pause;
  $('uhrReset').textContent = t('eh.neuStarten', 'Neu starten');
  $('uhrStopp').textContent = pause ? t('eh.ueberspringen', 'Überspringen') : t('eh.zuruecksetzen', 'Zurücksetzen');
}

function uhrTakt() {
  if (!uhr.laeuft) return;
  if (Date.now() >= uhr.ende) {
    uhr.laeuft = false;
    uhr.rest = 0;
    clearInterval(uhr.takt);
    signal();
    uhrMerken();
  }
  uhrZeichnen();
}

function uhrLos() {
  uhr.ende = Date.now() + uhr.rest * 1000;
  uhr.laeuft = true;
  clearInterval(uhr.takt);
  uhr.takt = setInterval(uhrTakt, 250);
  uhrMerken();
  uhrZeichnen();
}

function uhrAnhalten() {
  uhr.rest = uhrBleibt();
  uhr.laeuft = false;
  clearInterval(uhr.takt);
  uhrMerken();
  uhrZeichnen();
}

function uhrStellen(art, sekunden, { runden = 1, proSeite = false, fuer = '', satz = -1, bereich = null } = {}) {
  clearInterval(uhr.takt);
  Object.assign(uhr, { art, dauer: sekunden, rest: sekunden, laeuft: false, runde: 1, runden, proSeite, fuer, satz, bereich, plus: 0 });
  uhrMerken();
  uhrZeichnen();
}

/* Beim Blättern: eine Pause bleibt, bis sie vorbei ist oder übersprungen
   wird (die Bank wartet nicht); sonst stellt sich die Uhr auf die neue
   Übung ein. */
function uhrFuerUebung(item) {
  if (uhr.art === 'pause' && uhrBleibt() > 0) { uhrZeichnen(); return; }
  if (uhr.art === 'zeit' && uhr.fuer === item.key) { uhrZeichnen(); return; }
  const z = ansicht ? null : zeitVorgabe(item);
  if (z) uhrStellen('zeit', z.sekunden, { runden: z.runden, proSeite: z.proSeite, fuer: item.key });
  else uhrStellen('', 0);
}

function pauseStarten(item, satz) {
  const b = pauseBereich(item);
  if (!b || ansicht) return;
  uhrStellen('pause', pauseWahl.get(item.key) || b.von, { fuer: item.key, satz, bereich: b });
  uhrLos();
}

/* Wird der Satz zurückgenommen, dessen Pause gerade läuft, endet sie. */
function pauseZuruecknehmen(item, satz) {
  if (uhr.art !== 'pause' || uhr.fuer !== item.key || uhr.satz !== satz) return;
  uhrStellen('', 0);
  uhrFuerUebung(item);
}

function uhrStartGeklickt() {
  tonFreigeben();
  if (uhr.laeuft) { uhrAnhalten(); return; }
  if (uhr.rest === 0) {
    if (uhr.art === 'zeit' && uhr.runde < uhr.runden) uhr.runde += 1;
    else if (uhr.art === 'zeit') uhr.runde = 1;
    uhr.rest = uhr.dauer;
  }
  uhrLos();
}

function uhrStoppGeklickt() {
  const item = items[pos];
  if (uhr.art === 'pause') {
    /* Überspringen: zurück zur Uhr der Übung, falls sie eine hat. */
    uhrStellen('', 0);
    if (item) uhrFuerUebung(item);
    return;
  }
  uhrStellen(uhr.art, uhr.dauer, { runden: uhr.runden, proSeite: uhr.proSeite, fuer: uhr.fuer });
}

function uhrResetGeklickt() {
  if (uhr.art !== 'pause') return;
  tonFreigeben();
  uhr.rest = uhr.dauer;
  uhrLos();
}

function uhrPlus() {
  if (uhr.art !== 'pause') return;
  if (uhr.laeuft) uhr.ende += 15000;
  else uhr.rest += 15;
  uhr.dauer += 15;
  uhr.plus = (uhr.plus || 0) + 15;
  uhrMerken();
  uhrZeichnen();
}

/* Die andere Länge eines Bereichs: die schon vergangene Zeit zählt weiter. */
function uhrLaenge(sekunden) {
  if (uhr.art !== 'pause' || !sekunden) return;
  const neu = sekunden + (uhr.plus || 0);
  const diff = neu - uhr.dauer;
  if (uhr.laeuft) uhr.ende += diff * 1000;
  else uhr.rest = Math.max(0, uhr.rest + diff);
  uhr.dauer = neu;
  if (uhr.fuer) pauseWahl.set(uhr.fuer, sekunden);
  if (uhr.laeuft && Date.now() >= uhr.ende) uhrTakt();
  uhrMerken();
  uhrZeichnen();
}

/* ── Eingaben ──────────────────────────────────────────────────────*/

/* Die Sätze der Übung, wie sie gerade stehen — als Liste zum Ändern. */
function saetzeJetzt(item) {
  const e = eintrag(protokoll, unitId, item.key);
  return reihenFuer(item, e).map(r => ({
    weight: r.weight, reps: r.reps, ok: r.ok,
    ...(r.dauer ? { dauer: r.dauer } : {}), ...(r.strecke ? { strecke: r.strecke } : {}),
    ...(r.koerper ? { koerper: true } : {}),
  }));
}

/* Ein Feld im Bearbeiten: der Wert ändert sich, der Haken nicht. */
function satzGeaendert(event) {
  if (ansicht) return;
  const feld = event.target.closest('[data-satz]');
  if (!feld) return;
  const item = items[pos];
  const i = Number(feld.dataset.satz);
  const sets = saetzeJetzt(item);
  if (!sets[i]) return;
  const name = feld.dataset.feld;
  if (name === 'koerper') sets[i].koerper = feld.checked;
  else sets[i][name] = feld.value;
  if (!sets[i].koerper) delete sets[i].koerper;
  geaendert(unitId, item.key, { sets });
  /* Nur die Zahl rechts nachziehen — neu gezeichnet wird mit "Fertig",
     sonst ginge am Handy beim Wechsel ins nächste Feld der Fokus verloren. */
  const wert = $('listSaetze').querySelector(`[data-satz-wert="${i}"]`);
  if (wert) wert.textContent = satzText(sets[i]);
}

function satzZu(i) {
  const item = items[pos];
  offeneSaetze.delete(i);
  if (abhakenBeiFertig === i) {
    abhakenBeiFertig = -1;
    const sets = saetzeJetzt(item);
    if (sets[i] && (String(sets[i].weight).trim() || String(sets[i].reps).trim() || sets[i].koerper)) {
      sets[i].ok = true;
      geaendert(unitId, item.key, { sets });
      zeichnePlayer();
      pauseStarten(item, i);
      return;
    }
  }
  zeichnePlayer();
}

/* Ein Tipp auf die Fläche: abhaken (mit der Vorgabe) oder zurücknehmen. */
function satzGetippt(i) {
  const item = items[pos];
  if (!item || ansicht) return;
  const e = eintrag(protokoll, unitId, item.key);
  const reihen = reihenFuer(item, e);
  const r = reihen[i];
  if (!r) return;
  tonFreigeben();

  if (r.ok) {
    /* Zurücknehmen: der Haken geht, die Werte bleiben — wer sie
       korrigiert hat, tippt sie nicht noch einmal. */
    const sets = saetzeJetzt(item);
    sets[i].ok = false;
    geaendert(unitId, item.key, { sets });
    zeichnePlayer();
    pauseZuruecknehmen(item, i);
    ansagen(t('eh.satzOffen', 'Satz {n} wieder offen', { n: i + 1 }));
    return;
  }

  /* Das Gewicht bestimmt der Athlet, und es gibt noch keins: der Tipp
     öffnet das Feld, statt "??" oder nichts zu speichern. "Fertig"
     hakt dann ab. */
  if (!r.weight && !r.koerper && r.gewichtFrage && !r.vorschlag) {
    offeneSaetze.add(i);
    abhakenBeiFertig = i;
    zeichnePlayer();
    $('listSaetze').querySelector(`[data-satz="${i}"][data-feld="weight"]`)?.focus();
    return;
  }

  const sets = saetzeJetzt(item);
  sets[i] = { ...sets[i], weight: r.weight || r.vorschlag, reps: r.reps || r.zielReps, ok: true };
  offeneSaetze.delete(i);
  geaendert(unitId, item.key, { sets });
  zeichnePlayer();
  ansagen(t('eh.satzOk', 'Satz {n} abgehakt', { n: i + 1 }));
  /* Nach einem Satz beginnt die Pause, die der Plan nennt. */
  pauseStarten(item, i);
}

let ansageTimer = null;
function ansagen(text) {
  const el = $('ansage');
  if (!el) return;
  el.textContent = text;
  clearTimeout(ansageTimer);
  ansageTimer = setTimeout(() => { el.textContent = ''; }, 3000);
}

function notizGeaendert() {
  if (ansicht || !items[pos]) return;
  geaendert(unitId, items[pos].key, { note: $('uebNotiz').value });
}

function erledigtGeklickt() {
  if (ansicht) return;
  const item = items[pos];
  const war = eintrag(protokoll, unitId, item.key).done;
  geaendert(unitId, item.key, { done: !war });
  void jetztAlles();

  if (war) { zeichnePlayer(); return; }   // wieder aufgeklappt
  const hier = pos;
  rueckgaengigAnbieten(t('eh.uebungErledigt', '{name} erledigt', { name: item.name }), () => {
    geaendert(unitId, item.key, { done: false });
    void jetztAlles();
    pos = hier;
    zeichnePlayer();
  });
  weiter();
}

/* Wessen Plan das ist — der Name ist Beiwerk: fehlt er, steht der
   Hinweis ohne. */
async function zeigeAnsicht(uid) {
  let name = '';
  try { name = (await ladeMitglieder(gid)).find(m => m.uid === uid)?.name || ''; }
  catch (e) { reportClientError('einheit/ansicht', e); }
  const hinweis = $('ansichtHinweis');
  hinweis.textContent = name
    ? t('eh.ansicht', 'Das ist der Plan von {name}. Du siehst, was eingetragen ist; eintragen kann nur {name}.', { name })
    : t('eh.ansichtOhneName', 'Das ist nicht dein Plan. Du siehst, was eingetragen ist; eintragen kann nur, wem er gehört.');
  hinweis.hidden = false;
}

/* Die Leitung sieht, wie aktuell das ist (v.35.64.0). Was der Athlet
   offline eingetragen hat, ist noch nicht hier — "nichts eingetragen"
   heisst darum nicht "nicht trainiert". */
function zeigeAnsichtStand(daten) {
  const el = $('ansichtStand');
  if (!el) return;
  const am = daten?.updatedAt;
  const ms = typeof am?.toMillis === 'function' ? am.toMillis() : Number.isFinite(am?.seconds) ? am.seconds * 1000 : 0;
  el.textContent = ms
    ? t('eh.ansichtStand', 'Zuletzt synchronisiert: {wann}', {
        wann: new Date(ms).toLocaleString(document.documentElement.lang || 'de', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      })
    : t('eh.ansichtLeer', 'Für diesen Tag ist noch nichts synchronisiert. Was offline eingetragen wurde, erscheint erst, wenn das Gerät wieder Netz hat.');
  el.hidden = false;
}

/* Zurück, wohin man kam — erst, wenn gespeichert ist (höchstens kurz
   warten: was noch nicht draussen ist, liegt im Gerät). */
async function zurueckGehen() {
  await Promise.race([jetztAlles(), new Promise(r => setTimeout(r, 1500))]);
  location.href = rueckZiel;
}

/* ── Start ─────────────────────────────────────────────────────────*/

(async function () {
  try { user = await requireAuth('../login.html'); }
  catch { return; }

  wireOfflineBanner();

  const p = new URLSearchParams(location.search);
  gid = p.get('g') || '';
  planId = p.get('p') || '';
  unitId = p.get('u') || '';
  datum = p.get('d') || isoTag();
  /* Zurueck dorthin, woher man kam — Gruppe oder Training. Nur Namen aus
     einer festen Liste; ein freier Pfad in der Adresse waere ein Weg,
     jemanden anderswohin zu schicken. */
  const zurueck = rueckweg(p.get('z'));
  rueckZiel = zurueck;

  mountShell({
    variant: 'bereich',
    title: t('eh.einheit', 'Einheit'),
    backHref: zurueck,
    profile: {},
  });

  /* Die Knoepfe sagen, wohin sie fuehren. Fest "Zur Gruppe" war falsch,
     sobald man aus dem Training kam. */
  const rueckText = p.get('z') === 'training'
    ? t('eh.zumTraining', 'Zum Training')
    : p.get('z') === 'kalender' ? t('eh.zumKalender', 'Zum Kalender')
    : t('eh.zurGruppe', 'Zur Gruppe');
  if ($('zurueckText')) $('zurueckText').textContent = rueckText;
  if ($('btnFertigZurueck')) $('btnFertigZurueck').textContent = rueckText;

  $('btnZurueckGruppe')?.addEventListener('click', zurueckGehen);
  $('btnFertigZurueck')?.addEventListener('click', zurueckGehen);
  $('btnZurWahl')?.addEventListener('click', () => { void jetztAlles(); zeichneWahl(); });
  $('btnNochmal')?.addEventListener('click', () => { pos = 0; zeichnePlayer(); });
  $('btnVor')?.addEventListener('click', () => { void jetztAlles(); pos = Math.max(0, pos - 1); zeichnePlayer(); });
  $('btnWeiter')?.addEventListener('click', () => { void jetztAlles(); weiter(); });
  $('btnErledigt')?.addEventListener('click', erledigtGeklickt);
  $('uebNotiz')?.addEventListener('input', notizGeaendert);
  $('uebPrivat')?.addEventListener('input', privatGeaendert);
  $('btnRueck')?.addEventListener('click', rueckgaengigGeklickt);
  $('btnNochmalSpeichern')?.addEventListener('click', () => { void jetztAlles(); });
  $('uhrStart')?.addEventListener('click', uhrStartGeklickt);
  $('uhrStopp')?.addEventListener('click', uhrStoppGeklickt);
  $('uhrReset')?.addEventListener('click', uhrResetGeklickt);
  $('uhrPlus')?.addEventListener('click', uhrPlus);
  $('uhrBereich')?.addEventListener('click', event => {
    const b = event.target.closest('[data-uhr-laenge]');
    if (b) uhrLaenge(Number(b.dataset.uhrLaenge));
  });
  $('tagEinheiten')?.addEventListener('click', event => {
    const id = event.target.closest('[data-tag-einheit]')?.dataset.tagEinheit;
    if (id && id !== unitId) starte(id);
  });

  /* Weg von der Seite: jetzt speichern. Was nicht mehr hinausgeht, liegt
     im Gerät und geht beim nächsten Öffnen. Zurück: die Uhr nachziehen. */
  window.addEventListener('pagehide', () => { void jetztAlles(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { void jetztAlles(); return; }
    uhrTakt();
    if (offen.size) void speichernJetzt();
  });
  window.addEventListener('online', () => { if (offen.size) void speichernJetzt(); });

  $('listSaetze')?.addEventListener('input', satzGeaendert);
  $('listSaetze')?.addEventListener('change', event => {
    if (event.target.matches?.('[data-feld="koerper"]')) satzGeaendert(event);
  });
  $('listSaetze')?.addEventListener('keydown', event => {
    const feld = event.target.closest?.('[data-satz]');
    if (!feld || feld.type === 'checkbox') return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      satzZu(Number(feld.dataset.satz));
      $('listSaetze').querySelector(`[data-satz-oeffnen="${feld.dataset.satz}"]`)?.focus();
    }
  });
  /* Kam während des Tippens etwas von einem anderen Gerät: danach zeichnen. */
  $('secPlayer')?.addEventListener('focusout', () => {
    setTimeout(() => { if (spaeterZeichnen && !tipptGerade()) neuZeichnen(); }, 0);
  });

  $('listSaetze')?.addEventListener('click', event => {
    const zu = event.target.closest('[data-satz-zu]');
    if (zu) { satzZu(Number(zu.dataset.satzZu)); return; }
    const auf = event.target.closest('[data-satz-oeffnen]');
    if (auf) {
      const i = Number(auf.dataset.satzOeffnen);
      if (offeneSaetze.has(i)) { satzZu(i); return; }
      offeneSaetze.add(i);
      zeichnePlayer();
      $('listSaetze').querySelector(`[data-satz="${i}"][data-feld="reps"]`)?.focus();
      return;
    }
    const tipp = event.target.closest('[data-satz-tippen]');
    if (tipp && !ansicht) satzGetippt(Number(tipp.dataset.satzTippen));
  });
  $('listEinheiten')?.addEventListener('click', event => {
    const id = event.target.closest('[data-einheit]')?.dataset.einheit;
    if (id) starte(id);
  });

  if (!gid || !planId) {
    fehler(t('eh.f.adresse', 'Zu dieser Adresse fehlt die Gruppe oder der Plan.'));
    return;
  }

  try {
    const gruppe = await ladeGruppe(gid);
    if (!gruppe) throw new Error('Gruppe nicht lesbar.');

    /* Direkt gelesen; die Regel entscheidet (allow get): ein Athlet
       bekommt nur Pläne für alle oder für sich, die Leitung jeden in
       ihrer Gruppe. Ein fremder Plan ist darum immer einer, den die
       Leitung ansieht. */
    const plan = await ladePlan(gid, planId);
    if (!plan) throw new Error('Plan nicht gefunden.');
    ansicht = Boolean(plan.fuer) && plan.fuer !== PLAN_FUER_ALLE && plan.fuer !== user.uid;
    /* Aus der Übersicht der Leitung (v.35.65.0): bei einem Plan für alle
       sagt &a=, wessen Einheit gezeigt wird — nur ansehen, die Regel
       lässt ohnehin nur die Leitung fremde Protokolle lesen. */
    const athlet = p.get('a') || '';
    const wessen = ansicht ? plan.fuer : (athlet && athlet !== user.uid ? athlet : user.uid);
    if (wessen !== user.uid) ansicht = true;

    programm = JSON.parse(plan.json);

    /* Die Bilder sind Beiwerk: fehlen sie, laeuft der Player ohne. */
    try {
      const antwort = await fetch('../assets/data/training/images.json');
      bilder = antwort.ok ? await antwort.json() : {};
    } catch { bilder = {}; }
    /* In der Ansicht das Protokoll des Athleten: die Leitung sieht, was
       an dem Tag eingetragen wurde (allow get: leadsGroup). */
    /* Das Protokoll ist Beiwerk wie die Bilder: ohne es steht die
       Einheit leer da, nicht gar nicht. Bis v.35.50.0 riss ein
       abgelehntes Lesen den ganzen Plan mit — die Regel verweigerte das
       eigene Protokoll eines Tages, an dem es noch keines gab, und am
       iPhone des Athleten stand "Der Plan liess sich nicht laden". */
    try {
      protokoll = await ladeProtokoll(gid, wessen, datum);
    } catch (e) {
      reportClientError('einheit/protokoll', e);
      protokoll = { units: {} };
    }
    if (!protokoll.units) protokoll.units = {};

    if (!ansicht) {
      /* Was im Gerät noch liegt und neuer ist als der Server: zuerst
         hinein, dann hinaus. Älteres ist schon angekommen. */
      for (const a of offeneFuer(speicher(), tagKey())) {
        const s = eintragSchluessel(a.unitId, a.key);
        if ((eintrag(protokoll, a.unitId, a.key).stand || 0) >= a.stand) { bestaetigt(speicher(), tagKey(), s, a.stand); continue; }
        const e = a.eintrag || {};
        protokoll = mitEintrag(protokoll, a.unitId, a.key, {
          done: e.done === true, note: e.note || '', sets: e.sets || [], stand: a.stand,
        });
        offen.set(s, { unitId: a.unitId, key: a.key, stand: a.stand });
      }
      if (offen.size) void speichernJetzt();
      /* Und andere Tage, die noch im Gerät liegen (offline eingetragen,
         danach nie wieder geöffnet). */
      void nachtragen(speicher(), user.uid, protokollAbgleichen, { ausser: tagKey() })
        .catch(e => reportClientError('einheit/nachtragen', e));

      /* Die eigenen früheren Tage: daraus kommt "zuletzt 50 kg", wo der
         Plan kein Gewicht nennt. Beiwerk — scheitert es, fehlt nur der
         Vorschlag. */
      try { verlauf = await ladeProtokolle(gid, user.uid); }
      catch (e) { reportClientError('einheit/verlauf', e); verlauf = []; }
      try { privat = await ladePrivat(user.uid, datum); }
      catch (e) { reportClientError('einheit/privat', e); privat = {}; }
    }

    setShellTitle(plan.titel || t('eh.einheit', 'Einheit'));
    if (ansicht) await zeigeAnsicht(wessen);

    /* Die Einheit des Tages direkt (v.35.64.0). */
    amTag = einheitenAmTag(programm, datum);
    if (unitId && uebungen(programm, unitId).length) starte(unitId);
    else if (amTag.length === 1) starte(amTag[0]);
    else zeichneWahl();

    hoereProtokoll(wessen);
  } catch (e) {
    reportClientError('einheit/laden', e);
    /* Der häufigste Grund ist eine Regel oder ein Index, der noch nicht
       ausgerollt ist — beides sagt dem Nutzer nichts. */
    fehler(t('eh.f.laden', 'Der Plan liess sich nicht laden.'));
  }
}());
