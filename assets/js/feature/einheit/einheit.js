/* ══════════════════════════════════════════════════════════════════
   Der Einheiten-Player.

   Eine Übung nach der anderen, Sätze beim Machen erfasst. Der ganze
   Unterschied zu einer Liste liegt in der Situation: im Kraftraum hält
   man ein Telefon in der einen Hand und eine Hantel in der anderen.
   Was zählt, ist "was ist jetzt dran" und "was habe ich gerade
   geschafft" — nicht ein Wochenplan zum Überfliegen.

   Aufgerufen mit ?g=<gruppe>&p=<plan>[&u=<einheit>][&d=<datum>].

   Die Logik steht in assets/js/einheit.js, ohne Firebase und ohne DOM.
   Hier ist nur, was der Browser dazutut: Felder, Klicks, Speichern.

   ── Speichern ─────────────────────────────────────────────────────
   Bei jeder Eingabe, verzögert. Wer mitten im Satz das Telefon
   weglegt, soll nicht "Speichern" suchen müssen — und wer bei jedem
   Tastendruck schreibt, verbrennt das Kontingent. 900 ms ist dieselbe
   Verzögerung, die training-sync.js benutzt.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell } from '../../shell.js?v=11';
import {
  ladeGruppe, ladePlaene, ladeProtokoll, protokollSpeichern,
} from '../../groups.js';
import {
  einheiten, uebungen, einheitTitel,
  eintrag, mitEintrag, sauber, fortschritt, naechsteOffene, saetze,
  videoUrl, vorwochen, zeigtSaetze, kennzahlen,
} from '../../einheit.js';
import { isoTag } from '../../termine.js';

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
function satzZeile(reihe, index, offen) {
  const ziel = [reihe.zielReps && `${reihe.zielReps}×`, reihe.zielWert]
    .filter(Boolean).join(' ');
  const gemacht = satzGemacht(reihe);
  const zeigeFelder = offen || (gemacht && !passtZurVorgabe(reihe));

  const werte = gemacht
    ? [reihe.reps && `${reihe.reps}×`, reihe.weight].filter(Boolean).join(' ')
    : '';

  return `
    <div class="row satz${gemacht ? ' satz--gemacht' : ''}" data-bereich="t-training" data-satz-zeile="${index}">
      <button class="satz__haken" type="button" data-satz-tippen="${index}"
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
               placeholder="${escHtml(reihe.zielWert || t('eh.wert', 'Wert'))}"
               aria-label="${escHtml(t('eh.ariaWert', 'Wert {n}. Satz', { n: index + 1 }))}" />
        <input class="form-input" type="text" inputmode="numeric" maxlength="20"
               data-satz="${index}" data-feld="reps"
               value="${escHtml(reihe.reps)}"
               placeholder="${escHtml(reihe.zielReps || t('eh.wdh', 'Wdh'))}"
               aria-label="${escHtml(t('eh.ariaWdh', 'Wiederholungen {n}. Satz', { n: index + 1 }))}" />`
        : `<span class="satz__wert">${escHtml(werte)}</span>
        <button class="row__aktion" type="button" data-satz-oeffnen="${index}"
                title="${escHtml(t('eh.abweichend', 'Anders gelaufen'))}"
                aria-label="${escHtml(t('eh.abweichend', 'Anders gelaufen'))}">
          <svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>`}
      </span>
    </div>`;
}

/* Stimmt das Eingetragene mit der Vorgabe ueberein? Dann bleibt die
   Zeile zugeklappt — die Zahl steht ja schon als Vorgabe da. */
function passtZurVorgabe(reihe) {
  const gleich = (a, b) => String(a).trim() === String(b).trim();
  return gleich(reihe.weight, reihe.zielWert) && gleich(reihe.reps, reihe.zielReps);
}

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

  $('kopfTitel').textContent = einheitTitel(programm, unitId);
  $('kopfMeta').textContent = `${f.erledigt} von ${f.gesamt} erledigt`;
  $('kopfMeta').hidden = false;

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

  const reihen = zeigtSaetze(item) ? saetze(item, e) : [];
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

  $('uebNotiz').value = e.note;

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

/* ── Eingaben ──────────────────────────────────────────────────────*/

function satzGeaendert(event) {
  const feld = event.target.closest('[data-satz]');
  if (!feld) return;

  const item = items[pos];
  const e = eintrag(protokoll, unitId, item.key);
  const reihen = saetze(item, e);

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
  protokoll = mitEintrag(protokoll, unitId, items[pos].key, { note: $('uebNotiz').value });
  speichereBald();
}

function erledigtGeklickt() {
  const item = items[pos];
  const war = eintrag(protokoll, unitId, item.key).done;
  protokoll = mitEintrag(protokoll, unitId, item.key, { done: !war });
  speichereBald();

  if (war) zeichnePlayer();   // wieder aufgeklappt
  else weiter();
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

  mountShell({
    variant: 'bereich',
    title: t('eh.einheit', 'Einheit'),
    backHref: './gruppe.html',
    profile: {},
  });

  $('btnZurueckGruppe')?.addEventListener('click', () => { location.href = './gruppe.html'; });
  $('btnFertigZurueck')?.addEventListener('click', () => { location.href = './gruppe.html'; });
  $('btnZurWahl')?.addEventListener('click', zeichneWahl);
  $('btnNochmal')?.addEventListener('click', () => { pos = 0; zeichnePlayer(); });
  $('btnVor')?.addEventListener('click', () => { pos = Math.max(0, pos - 1); zeichnePlayer(); });
  $('btnWeiter')?.addEventListener('click', weiter);
  $('btnErledigt')?.addEventListener('click', erledigtGeklickt);
  $('uebNotiz')?.addEventListener('input', notizGeaendert);
  $('listSaetze')?.addEventListener('input', satzGeaendert);

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
    if (!tipp) return;

    const item = items[pos];
    if (!item) return;

    const i = Number(tipp.dataset.satzTippen);
    const e = eintrag(protokoll, unitId, item.key);
    const reihen = saetze(item, e);
    if (!reihen[i]) return;

    const sets = reihen.map((r, n) => n === i
      ? (satzGemacht(r)
          ? { weight: '', reps: '' }              // noch einmal getippt: zurueck
          : { weight: r.zielWert, reps: r.zielReps })
      : { weight: r.weight, reps: r.reps });

    offeneSaetze.delete(i);
    protokoll = mitEintrag(protokoll, unitId, item.key, { sets });
    speichereBald();
    zeichnePlayer();
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

    /* Der Plan wird über die erlaubte Abfrage geholt und nicht direkt
       gelesen: so greift dieselbe Regel wie in der Gruppenansicht, und
       ein Plan, der für jemand anderen bestimmt ist, kommt gar nicht
       an. */
    const meine = await ladePlaene(gid, user.uid, false);
    const plan = meine.find(x => x.id === planId);
    if (!plan) throw new Error('Plan nicht gefunden.');

    programm = JSON.parse(plan.json);
    protokoll = await ladeProtokoll(gid, user.uid, datum);
    if (!protokoll.units) protokoll.units = {};

    $('kopfTitel').textContent = plan.titel || t('eh.einheit', 'Einheit');

    if (unitId && uebungen(programm, unitId).length) starte(unitId);
    else zeichneWahl();
  } catch (e) {
    reportClientError('einheit/laden', e);
    /* Der häufigste Grund ist eine Regel oder ein Index, der noch nicht
       ausgerollt ist — beides sagt dem Nutzer nichts. */
    fehler(t('eh.f.laden', 'Der Plan liess sich nicht laden.'));
  }
}());
