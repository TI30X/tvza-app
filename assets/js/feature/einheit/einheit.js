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
   zeigt, was der Athlet an dem Tag eingetragen hat, und schreibt
   nichts — die Regel liesse es auch nicht zu (geschrieben wird nur das
   eigene Protokoll). Bis v.35.40.0 fand der Player einen solchen Plan
   gar nicht und meldete "Der Plan liess sich nicht laden."

   Die Logik steht in assets/js/einheit.js, ohne Firebase und ohne DOM.
   Hier ist nur, was der Browser dazutut: Felder, Klicks, Speichern.

   ── Speichern ─────────────────────────────────────────────────────
   Bei jeder Eingabe, verzögert. Wer mitten im Satz das Telefon
   weglegt, soll nicht "Speichern" suchen müssen — und wer bei jedem
   Tastendruck schreibt, verbrennt das Kontingent. 900 ms ist dieselbe
   Verzögerung, die die frühere persönliche Trainingsseite benutzte.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell, setShellTitle, setShellMeta } from '../../shell.js?v=22';
import {
  ladeGruppe, ladePlan, ladeProtokoll, ladeProtokolle, protokollSpeichern, ladeMitglieder, PLAN_FUER_ALLE,
} from '../../groups.js';
import {
  einheiten, uebungen, einheitTitel,
  eintrag, mitEintrag, sauber, fortschritt, naechsteOffene, saetze,
  videoUrl, vorwochen, zeigtSaetze, kennzahlen, bilderFuer,
  letzteGewichte, pauseSekunden, zeitVorgabe,
} from '../../einheit.js';
import { isoTag } from '../../termine.js';
import { rueckweg } from '../../wochenplan.js';

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

function speichereBald() {
  if (ansicht) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      /* sauber() wirft leere Einträge weg. Ohne das wüchse das
         Protokoll mit jeder geöffneten Einheit, auch wenn niemand
         etwas gemacht hat. */
      await protokollSpeichern(gid, user.uid, datum, sauber(protokoll));
    } catch (e) {
      reportClientError('einheit/speichern', e);
      /* Kein alert: man steht mit einer Hantel da. Der Offline-Banner
         der Hülle sagt schon, dass etwas nicht durchgeht, und beim
         nächsten Tastendruck wird es erneut versucht. */
    }
  }, VERZOEGERUNG);
}

/* ── Einheit wählen ────────────────────────────────────────────────*/

function zeichneWahl() {
  const liste = $('listEinheiten');
  const alle = einheiten(programm);

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

/* ── Der Player ────────────────────────────────────────────────────*/

/* Ein Satz ist erledigt, sobald irgendein Wert darin steht. */
function satzGemacht(reihe) {
  return Boolean(String(reihe.weight).trim() || String(reihe.reps).trim());
}

/**
 * Eine Satzzeile.
 *
 * Der Normalfall ist "lief wie geplant" — ein Tipp auf die Zeile
 * uebernimmt die Vorgabe und hakt sie ab. Die Felder erscheinen erst,
 * wenn es anders lief. Wer im Kraftraum steht, tippt sonst zwei Zahlen
 * je Satz auf 60 Pixel breite Felder, und das trifft niemand.
 */
/* Ein Gewicht ist eine Zahl in kg — die Vorlage schreibt "50", man liest "50 kg". */
const mitKg = w => (/^\d+([.,]\d+)?$/.test(String(w).trim()) ? `${String(w).trim()} kg` : String(w));

/* "9" wird "9×"; "6/Seite" bleibt, wie es ist — "6/Seite×" las sich falsch. */
const mitMal = r => (/^\d+$/.test(String(r ?? '').trim()) ? `${String(r).trim()}×` : String(r ?? '').trim());

function satzZeile(reihe, index, offen) {
  /* Die Vorgabe, und wo der Plan kein Gewicht nennt, das vom letzten Mal
     — ein Tipp bestätigt es. Sagt der Plan "??", bestimmt der Athlet:
     dann steht es so da, und der Tipp öffnet das Feld. */
  const gewicht = reihe.zielWert
    ? mitKg(reihe.zielWert)
    : reihe.vorschlagDavor
      ? t('eh.wieDavor', '{wert} wie davor', { wert: mitKg(reihe.vorschlag) })
    : reihe.vorschlagZuletzt
      ? t('eh.zuletzt', 'zuletzt {wert}', { wert: mitKg(reihe.vorschlag) })
      : reihe.gewichtFrage ? t('eh.gewichtEintragen', 'Gewicht eintragen') : '';
  const ziel = [mitMal(reihe.zielReps), gewicht]
    .filter(Boolean).join(' · ');
  const gemacht = satzGemacht(reihe);
  const zeigeFelder = !ansicht && (offen || (gemacht && !passtZurVorgabe(reihe)));

  const werte = gemacht
    ? [mitMal(reihe.reps), reihe.weight && mitKg(reihe.weight)].filter(Boolean).join(' ')
    : '';

  return `
    <div class="row satz${gemacht ? ' satz--gemacht' : ''}" data-bereich="t-training" data-satz-zeile="${index}">
      <button class="satz__haken" type="button" data-satz-tippen="${index}"${ansicht ? ' disabled' : ''}
              aria-pressed="${gemacht ? 'true' : 'false'}"
              aria-label="${escHtml(t('eh.satzAbhaken', 'Satz {n} wie geplant', { n: index + 1 }))}">
        ${gemacht
          ? '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
          : escHtml(String(index + 1))}
      </button>
      <span class="row__body">
        <span class="row__title">${escHtml(reihe.label)}</span>
        <span class="row__sub">${escHtml(ziel || t('eh.keinZiel', 'kein Ziel angegeben'))}</span>
      </span>
      <span class="row__end">
        ${zeigeFelder ? `
        <input class="form-input" type="text" inputmode="decimal" maxlength="20"
               data-satz="${index}" data-feld="weight"
               value="${escHtml(reihe.weight)}"
               placeholder="${escHtml(reihe.vorschlag || t('eh.kg', 'kg'))}"
               aria-label="${escHtml(t('eh.ariaWert', 'Wert {n}. Satz', { n: index + 1 }))}" />
        <input class="form-input" type="text" inputmode="numeric" maxlength="20"
               data-satz="${index}" data-feld="reps"
               value="${escHtml(reihe.reps)}"
               placeholder="${escHtml(reihe.zielReps || t('eh.wdh', 'Wdh'))}"
               aria-label="${escHtml(t('eh.ariaWdh', 'Wiederholungen {n}. Satz', { n: index + 1 }))}" />`
        : `<span class="satz__wert">${escHtml(werte)}</span>${ansicht ? '' : `
        <button class="row__aktion" type="button" data-satz-oeffnen="${index}"
                title="${escHtml(t('eh.abweichend', 'Anders gelaufen'))}"
                aria-label="${escHtml(t('eh.abweichend', 'Anders gelaufen'))}">
          <svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>`}`}
      </span>
    </div>`;
}

/* Stimmt das Eingetragene mit der Vorgabe ueberein? Dann bleibt die
   Zeile zugeklappt — die Zahl steht ja schon als Vorgabe da. */
function passtZurVorgabe(reihe) {
  const gleich = (a, b) => String(a).trim() === String(b).trim();
  return gleich(reihe.weight, reihe.vorschlag) && gleich(reihe.reps, reihe.zielReps);
}

const reihenFuer = (item, e) => saetze(item, e, letzteGewichte(verlauf, item, datum));

/* Welche Zeilen der Nutzer aufgeklappt hat — nur fuer diese Ansicht,
   nichts davon gehoert ins Protokoll. */
let offeneSaetze = new Set();
let offenFuer = null;          // fuer welche Uebung sie gelten

function zeichnePlayer() {
  const item = items[pos];
  if (!item) return;

  /* Die aufgeklappten Zeilen gehoeren zur ANSICHT einer Uebung, nicht
     zum Protokoll. Wer weiterblaettert, faengt zugeklappt an — und
     kein Aufrufer muss daran denken. */
  if (offenFuer !== item.key) { offeneSaetze = new Set(); offenFuer = item.key; }

  const e = eintrag(protokoll, unitId, item.key);
  const f = fortschritt(items, protokoll, unitId);

  /* Über die Hülle: mountShell hat den Kopf der Seite ersetzt (setShellMeta). */
  setShellTitle(einheitTitel(programm, unitId));
  setShellMeta(`${f.erledigt} von ${f.gesamt} erledigt`);

  $('uebPos').textContent = t('eh.uebungVon', 'Übung {n} von {gesamt}',
    { n: pos + 1, gesamt: items.length });
  $('uebName').textContent = item.name;

  /* Der Fortschritt als Leiste statt als graue Zeile. */
  const anteil = f.gesamt ? Math.round((f.erledigt / f.gesamt) * 100) : 0;
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
    ? reihen.map((r, i) => satzZeile(r, i, offeneSaetze.has(i))).join('')
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
  $('btnErledigt').hidden = ansicht;

  const erledigt = e.done;
  const knopf = $('btnErledigt');
  knopf.textContent = erledigt ? t('eh.nochmal', 'Erledigt — nochmal öffnen') : t('eh.erledigt', 'Übung erledigt');
  knopf.classList.toggle('b--primary', !erledigt);
  knopf.classList.toggle('b--secondary', erledigt);

  $('btnVor').disabled = pos === 0;
  $('btnWeiter').disabled = pos >= items.length - 1;

  zeige('secWahl', false);
  zeige('secPlayer', true);
  zeige('secFertig', false);
}

function starte(id) {
  unitId = id;
  items = uebungen(programm, id);

  if (!items.length) {
    /* Ein Notizblatt hat nichts zum Abhaken. Es zu öffnen und einen
       leeren Player zu zeigen wäre schlechter, als es zu sagen. */
    fehler(t('eh.nurNotizen', 'Diese Einheit enthält Hinweise, aber keine Übungen zum Abhaken.'));
    return;
  }

  $('ladeFehler').hidden = true;
  const offen = naechsteOffene(items, protokoll, unitId, 0);
  pos = offen === -1 ? 0 : offen;
  zeichnePlayer();
}

function weiter() {
  /* Nach dem Abhaken springt der Player zur nächsten OFFENEN Übung,
     nicht einfach zur nächsten in der Liste. Wer die Reihenfolge
     durchbricht — weil eine Bank besetzt war —, soll nicht wieder an
     erledigten vorbeiblättern. */
  const offen = naechsteOffene(items, protokoll, unitId, pos + 1);
  if (offen === -1) {
    const f = fortschritt(items, protokoll, unitId);
    $('fertigText').textContent = f.fertig
      ? t('eh.alleFertig', '{titel} — alle {n} Übungen erledigt.',
          { titel: einheitTitel(programm, unitId), n: f.gesamt })
      : t('eh.letzte', 'Das war die letzte Übung.');
    zeige('secPlayer', false);
    zeige('secFertig', true);
    return;
  }
  pos = offen;
  zeichnePlayer();
}

/* ── Der Timer ─────────────────────────────────────────────────────
   Michel: "einen Timer für die Übungen, der die Zeit für Pausen und für
   die, die ganz auf Zeit basieren, stoppen kann." Zwei Arten:
     pause  läuft nach einem Satz von selbst an, so lang wie der Plan sagt
            ("120-180 Sec" → 2:00), +15 s und Überspringen;
     zeit   eine Übung auf Zeit ("30 Sec pro Seite", 2 Sätze → vier
            Runden), jede Runde startet man selbst.
   Gerechnet wird mit der Endzeit, nicht mit Ticks: ein iPhone hält
   Intervalle im Hintergrund an, die Uhr stimmt beim Zurückkommen trotzdem. */

const uhr = { art: '', dauer: 0, rest: 0, ende: 0, laeuft: false, runde: 1, runden: 1, proSeite: false, fuer: '', takt: null };
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

function uhrZeichnen() {
  const kasten = $('uhr');
  if (!uhr.art) { kasten.hidden = true; return; }
  kasten.hidden = false;
  const bleibt = uhr.laeuft ? Math.max(0, Math.ceil((uhr.ende - Date.now()) / 1000)) : uhr.rest;
  $('uhrZeit').textContent = mmss(bleibt);
  $('uhrFuellung').style.width = `${uhr.dauer ? Math.round((1 - bleibt / uhr.dauer) * 100) : 0}%`;
  kasten.classList.toggle('is-fertig', bleibt === 0);
  if (uhr.art === 'pause') {
    $('uhrWas').textContent = bleibt === 0 ? t('eh.pauseVorbei', 'Pause vorbei') : t('eh.pauseLaeuft', 'Pause');
    $('uhrRunde').textContent = '';
  } else {
    $('uhrWas').textContent = uhr.proSeite
      ? t('eh.seite', 'Seite {n}', { n: uhr.runde % 2 ? 1 : 2 })
      : t('eh.zeit', 'Auf Zeit');
    $('uhrRunde').textContent = uhr.runden > 1 ? t('eh.runde', 'Runde {n} von {m}', { n: uhr.runde, m: uhr.runden }) : '';
  }
  $('uhrStart').textContent = uhr.laeuft ? t('eh.anhalten', 'Anhalten')
    : bleibt === 0 && uhr.art === 'zeit' && uhr.runde < uhr.runden ? t('eh.naechsteRunde', 'Nächste Runde')
    : bleibt === 0 ? t('eh.nochmalStart', 'Nochmal') : t('eh.start', 'Start');
  $('uhrPlus').hidden = uhr.art !== 'pause';
  $('uhrPlus').textContent = t('eh.plus15', '+15 s');
  $('uhrStopp').textContent = uhr.art === 'pause' ? t('eh.ueberspringen', 'Überspringen') : t('eh.zuruecksetzen', 'Zurücksetzen');
}

function uhrTakt() {
  if (!uhr.laeuft) return;
  if (Date.now() >= uhr.ende) {
    uhr.laeuft = false;
    uhr.rest = 0;
    clearInterval(uhr.takt);
    signal();
  }
  uhrZeichnen();
}

function uhrLos() {
  uhr.ende = Date.now() + uhr.rest * 1000;
  uhr.laeuft = true;
  clearInterval(uhr.takt);
  uhr.takt = setInterval(uhrTakt, 250);
  uhrZeichnen();
}

function uhrAnhalten() {
  uhr.rest = Math.max(0, Math.ceil((uhr.ende - Date.now()) / 1000));
  uhr.laeuft = false;
  clearInterval(uhr.takt);
  uhrZeichnen();
}

function uhrStellen(art, sekunden, { runden = 1, proSeite = false, fuer = '' } = {}) {
  clearInterval(uhr.takt);
  Object.assign(uhr, { art, dauer: sekunden, rest: sekunden, laeuft: false, runde: 1, runden, proSeite, fuer });
  uhrZeichnen();
}

/* Beim Blättern: eine laufende Pause läuft weiter (die Bank wartet
   nicht), sonst stellt sich die Uhr auf die neue Übung ein. */
function uhrFuerUebung(item) {
  if (uhr.art === 'pause' && uhr.laeuft) return;
  if (uhr.art === 'zeit' && uhr.fuer === item.key) { uhrZeichnen(); return; }
  const z = ansicht ? null : zeitVorgabe(item);
  if (z) uhrStellen('zeit', z.sekunden, { runden: z.runden, proSeite: z.proSeite, fuer: item.key });
  else uhrStellen('', 0);
}

function pauseStarten(item) {
  const s = pauseSekunden(item);
  if (!s || ansicht) return;
  uhrStellen('pause', s, { fuer: item.key });
  uhrLos();
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

function uhrPlus() {
  if (uhr.art !== 'pause') return;
  if (uhr.laeuft) uhr.ende += 15000;
  else uhr.rest += 15;
  uhr.dauer += 15;
  uhrZeichnen();
}

/* ── Eingaben ──────────────────────────────────────────────────────*/

function satzGeaendert(event) {
  if (ansicht) return;
  const feld = event.target.closest('[data-satz]');
  if (!feld) return;

  const item = items[pos];
  const e = eintrag(protokoll, unitId, item.key);
  const reihen = reihenFuer(item, e);

  const sets = reihen.map((r, i) => ({
    weight: i === Number(feld.dataset.satz) && feld.dataset.feld === 'weight'
      ? feld.value : r.weight,
    reps: i === Number(feld.dataset.satz) && feld.dataset.feld === 'reps'
      ? feld.value : r.reps,
  }));

  protokoll = mitEintrag(protokoll, unitId, item.key, { sets });
  speichereBald();
}

function notizGeaendert() {
  if (ansicht) return;
  protokoll = mitEintrag(protokoll, unitId, items[pos].key, { note: $('uebNotiz').value });
  speichereBald();
}

function erledigtGeklickt() {
  if (ansicht) return;
  const item = items[pos];
  const war = eintrag(protokoll, unitId, item.key).done;
  protokoll = mitEintrag(protokoll, unitId, item.key, { done: !war });
  speichereBald();

  if (war) zeichnePlayer();   // wieder aufgeklappt
  else weiter();
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
    : t('eh.zurGruppe', 'Zur Gruppe');
  if ($('zurueckText')) $('zurueckText').textContent = rueckText;
  if ($('btnFertigZurueck')) $('btnFertigZurueck').textContent = rueckText;

  $('btnZurueckGruppe')?.addEventListener('click', () => { location.href = zurueck; });
  $('btnFertigZurueck')?.addEventListener('click', () => { location.href = zurueck; });
  $('btnZurWahl')?.addEventListener('click', zeichneWahl);
  $('btnNochmal')?.addEventListener('click', () => { pos = 0; zeichnePlayer(); });
  $('btnVor')?.addEventListener('click', () => { pos = Math.max(0, pos - 1); zeichnePlayer(); });
  $('btnWeiter')?.addEventListener('click', weiter);
  $('btnErledigt')?.addEventListener('click', erledigtGeklickt);
  $('uebNotiz')?.addEventListener('input', notizGeaendert);
  $('uhrStart')?.addEventListener('click', uhrStartGeklickt);
  $('uhrStopp')?.addEventListener('click', uhrStoppGeklickt);
  $('uhrPlus')?.addEventListener('click', uhrPlus);
  /* Zurück aus dem Hintergrund: die Uhr sofort nachziehen. */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) uhrTakt(); });
  $('listSaetze')?.addEventListener('input', satzGeaendert);
  /* Nach dem Eintragen (Feld verlassen) neu zeichnen: der nächste Satz
     schlägt dann dasselbe Gewicht vor. Beim Tippen nicht — sonst ginge
     am Handy der Fokus verloren. */
  $('listSaetze')?.addEventListener('change', () => zeichnePlayer());

  /* Ein Tipp auf die Zeile heisst "lief wie geplant": die Vorgabe
     wird uebernommen. Noch einmal getippt nimmt sie zurueck. Der
     Stift daneben klappt die Felder auf, wenn es anders lief. */
  $('listSaetze')?.addEventListener('click', event => {
    const auf = event.target.closest('[data-satz-oeffnen]');
    if (auf) {
      offeneSaetze.add(Number(auf.dataset.satzOeffnen));
      zeichnePlayer();
      return;
    }

    const tipp = event.target.closest('[data-satz-tippen]');
    if (!tipp || ansicht) return;

    const item = items[pos];
    if (!item) return;

    const i = Number(tipp.dataset.satzTippen);
    const e = eintrag(protokoll, unitId, item.key);
    const reihen = reihenFuer(item, e);
    if (!reihen[i]) return;
    tonFreigeben();

    /* Das Gewicht bestimmt der Athlet, und es gibt noch keins: der Tipp
       öffnet das Feld, statt "??" oder nichts zu speichern. */
    if (!satzGemacht(reihen[i]) && reihen[i].gewichtFrage && !reihen[i].vorschlag) {
      offeneSaetze.add(i);
      zeichnePlayer();
      $('listSaetze').querySelector(`[data-satz="${i}"][data-feld="weight"]`)?.focus();
      return;
    }

    const warGemacht = satzGemacht(reihen[i]);
    const sets = reihen.map((r, n) => n === i
      ? (warGemacht
          ? { weight: '', reps: '' }              // noch einmal getippt: zurueck
          : { weight: r.vorschlag, reps: r.zielReps })
      : { weight: r.weight, reps: r.reps });

    offeneSaetze.delete(i);
    protokoll = mitEintrag(protokoll, unitId, item.key, { sets });
    speichereBald();
    zeichnePlayer();
    /* Nach einem Satz beginnt die Pause, die der Plan nennt. */
    if (!warGemacht && i < reihen.length - 1) pauseStarten(item);
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
      protokoll = await ladeProtokoll(gid, ansicht ? plan.fuer : user.uid, datum);
    } catch (e) {
      reportClientError('einheit/protokoll', e);
      protokoll = { units: {} };
    }
    if (!protokoll.units) protokoll.units = {};
    /* Die eigenen früheren Tage: daraus kommt "zuletzt 50 kg", wo der
       Plan kein Gewicht nennt. Beiwerk — scheitert es, fehlt nur der
       Vorschlag. */
    if (!ansicht) {
      try { verlauf = await ladeProtokolle(gid, user.uid); }
      catch (e) { reportClientError('einheit/verlauf', e); verlauf = []; }
    }

    setShellTitle(plan.titel || t('eh.einheit', 'Einheit'));
    if (ansicht) await zeigeAnsicht(plan.fuer);

    if (unitId && uebungen(programm, unitId).length) starte(unitId);
    else zeichneWahl();
  } catch (e) {
    reportClientError('einheit/laden', e);
    /* Der häufigste Grund ist eine Regel oder ein Index, der noch nicht
       ausgerollt ist — beides sagt dem Nutzer nichts. */
    fehler(t('eh.f.laden', 'Der Plan liess sich nicht laden.'));
  }
}());
