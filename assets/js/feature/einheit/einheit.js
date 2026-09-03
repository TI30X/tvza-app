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
import { mountShell } from '../../shell.js?v=7';
import {
  ladeGruppe, ladePlaene, ladeProtokoll, protokollSpeichern,
} from '../../groups.js';
import {
  einheiten, uebungen, einheitTitel,
  eintrag, mitEintrag, sauber, fortschritt, naechsteOffene, saetze,
} from '../../einheit.js';
import { isoTag } from '../../termine.js';

const $ = id => document.getElementById(id);
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
                ? `${e.anzahl} ${e.anzahl === 1 ? 'Übung' : 'Übungen'}`
                : 'Hinweise, keine Übungen')}</span>
            </span>
            <span class="row__end">${escHtml(rechts)}</span>
          </button>`;
      }).join('')
    : '<p class="empty-hint">Dieser Plan enthält keine Einheiten.</p>';

  zeige('secWahl', true);
  zeige('secPlayer', false);
  zeige('secFertig', false);
}

/* ── Der Player ────────────────────────────────────────────────────*/

function satzZeile(reihe, index) {
  /* Der Vorgabewert aus dem Plan steht als Platzhalter, nicht als Wert.
     Sonst stünde eine fremde Zahl da, als hätte man sie selbst
     gemacht. */
  const ziel = [reihe.zielReps && `${reihe.zielReps}×`, reihe.zielWert]
    .filter(Boolean).join(' ');

  return `
    <div class="row" data-bereich="t-training">
      <span class="row__icon">${escHtml(String(index + 1))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(reihe.label)}</span>
        <span class="row__sub">${escHtml(ziel || 'kein Ziel angegeben')}</span>
      </span>
      <span class="row__end">
        <input class="form-input" type="text" inputmode="decimal" maxlength="20"
               data-satz="${index}" data-feld="weight"
               value="${escHtml(reihe.weight)}"
               placeholder="${escHtml(reihe.zielWert || 'Wert')}"
               aria-label="Wert ${index + 1}. Satz" />
        <input class="form-input" type="text" inputmode="numeric" maxlength="20"
               data-satz="${index}" data-feld="reps"
               value="${escHtml(reihe.reps)}"
               placeholder="${escHtml(reihe.zielReps || 'Wdh')}"
               aria-label="Wiederholungen ${index + 1}. Satz" />
      </span>
    </div>`;
}

function zeichnePlayer() {
  const item = items[pos];
  if (!item) return;

  const e = eintrag(protokoll, unitId, item.key);
  const f = fortschritt(items, protokoll, unitId);

  $('kopfTitel').textContent = einheitTitel(programm, unitId);
  $('kopfMeta').textContent = `${f.erledigt} von ${f.gesamt} erledigt`;
  $('kopfMeta').hidden = false;

  $('uebPos').textContent = `Übung ${pos + 1} von ${items.length}`;
  $('uebName').textContent = item.name;

  /* Alternativname, Pause und TUT stehen im Plan und sind beim Machen
     genau das, was man wissen will. */
  const meta = [item.alt, item.pause && `Pause ${item.pause}`, item.tut && `TUT ${item.tut}`,
                ...(item.params || []), ...(item.lines || [])]
    .filter(Boolean).join(' · ');
  $('uebMeta').textContent = meta;
  $('uebMeta').hidden = !meta;

  const reihen = saetze(item, e);
  $('listSaetze').innerHTML = reihen.length
    ? reihen.map(satzZeile).join('')
    : '<p class="empty-hint">Keine Sätze vorgegeben — nur abhaken.</p>';

  $('uebNotiz').value = e.note;

  const erledigt = e.done;
  const knopf = $('btnErledigt');
  knopf.textContent = erledigt ? 'Erledigt — nochmal öffnen' : 'Übung erledigt';
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
    fehler('Diese Einheit enthält Hinweise, aber keine Übungen zum Abhaken.');
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
      ? `${einheitTitel(programm, unitId)} — alle ${f.gesamt} Übungen erledigt.`
      : 'Das war die letzte Übung.';
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
    title: 'Einheit',
    backHref: './gruppe.html',
    profile: {},
    onSettings: () => window.tvzaOpenSettings?.(),
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
  $('listEinheiten')?.addEventListener('click', event => {
    const id = event.target.closest('[data-einheit]')?.dataset.einheit;
    if (id) starte(id);
  });

  if (!gid || !planId) {
    fehler('Zu dieser Adresse fehlt die Gruppe oder der Plan.');
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

    $('kopfTitel').textContent = plan.titel || 'Einheit';

    if (unitId && uebungen(programm, unitId).length) starte(unitId);
    else zeichneWahl();
  } catch (e) {
    reportClientError('einheit/laden', e);
    /* Der häufigste Grund ist eine Regel oder ein Index, der noch nicht
       ausgerollt ist — beides sagt dem Nutzer nichts. */
    fehler('Der Plan liess sich nicht laden.');
  }
}());
