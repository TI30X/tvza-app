/* ══════════════════════════════════════════════════════════════════
   Die Pille — der Assistent, der überall ist (v.35.53.0, v.35.55.0).

   Michel: "nicht eine eigene Tabelle, sondern wie eine fliegende Pille,
   die überall ist" — "wäre cool, wenn Gruppen die Möglichkeit hätten,
   ihren Assistenten zu benennen und einen eigenen zu haben" — und: "der
   persönliche Assistent sollte sich von der Gruppe unterscheiden".

   Die Pille schwebt über jeder Seite der App (nur im obersten Dokument,
   nie in einem Rahmen des Routers — sonst stünde sie doppelt da). Hinter
   ihr stehen bis zu zwei Arten von Assistenten (ki.js, assistenten()):
   - "Dein Assistent", der persönliche — navy, wie die Leiste;
   - der der Gruppe, mit ihrem Namen ("Coach Maxi") und in ihrer Farbe.
   Welcher antwortet, entscheidet die Seite (in der Gruppe der der
   Gruppe, sonst der persönliche); oben im Gespräch lässt sich wechseln.
   Jeder hat sein eigenes Gespräch. Wer keinen freigeschaltet hat, sieht
   keine Pille — und nirgends steht, warum.

   Was hier passiert:
   - Kontext laden: nur, was DIESER Assistent kennen darf, mit den Rechten
     der Person, fünf Minuten gemerkt (ki.js entscheidet, was mitgeht).
   - Fragen: an den Worker (worker/ki.js), mit dem ID-Token. Der
     Gemini-Schlüssel ist nie hier.
   - Vorschläge: jede Aktion wird geprüft (aktionPruefen) und als Karte
     gezeigt. Erst "Eintragen" schreibt.
   Ohne Worker-Adresse gibt es die Pille nicht.
   ══════════════════════════════════════════════════════════════════ */

import { auth, db, reportClientError, imKreis } from './firebase-config.js';
import { WORKER_BASIS } from './worker-config.js';
import {
  assistenten, assistentWaehlen, kontextBauen, aktionPruefen, aktionZeile, fragen, fehlerText,
} from './ki.js';
import { gruppenStil, kuerzel } from './gruppenwahl.js';
import { planEinheiten } from './wochenplan.js';
import { formatiert } from './formatierung.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, query, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Die Adresse des Workers. Die Attrappe setzt eine eigene (dev/server.mjs). */
export const kiBasis = () => globalThis.FIRN_KI_BASIS || WORKER_BASIS;

const HINWEIS = 'firn.ki.hinweis';
const STAND = 'firn.daten';
const VORRAT_MS = 5 * 60 * 1000;

const FUNKE = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
const SENDEN = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';
const ZU = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const MIKRO = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/* ── Diktieren (v.35.59.0) ───────────────────────────────────────────
   Michel: "vielleicht können wir noch eine Diktierfunktion für die
   Assistenten einfügen". Die Spracherkennung des Browsers (Chrome,
   Edge, Safari) — kein eigener Dienst, kein Schlüssel. Wo es sie nicht
   gibt (Firefox), fehlt der Knopf; die Tastatur des Handys hat ihr
   eigenes Mikrofon. Der Text landet im Feld und wird NICHT von allein
   geschickt: man sieht, was verstanden wurde, und korrigiert es. */
export const Erkennung = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
let diktat = null;

function diktieren() {
  const knopf = blatt.querySelector('.ki-mikro');
  const feld = blatt.querySelector('.ki-feld');
  if (diktat) { diktat.stop(); return; }
  const E = Erkennung();
  if (!E) return;
  const vorher = feld.value.trim();
  diktat = new E();
  diktat.lang = window.TVZAI18n?.locale || document.documentElement.lang || 'de-CH';
  diktat.interimResults = true;
  diktat.continuous = false;
  diktat.onresult = event => {
    const gehoert = [...event.results].map(r => r[0]?.transcript || '').join('');
    feld.value = [vorher, gehoert.trim()].filter(Boolean).join(' ');
    feld.dispatchEvent(new Event('input'));
  };
  const ende = () => {
    diktat = null;
    knopf.classList.remove('is-hoert');
    knopf.setAttribute('aria-pressed', 'false');
    feld.placeholder = t('ki.feldPh', '{name} fragen …', { name: aktuell?.name || '' });
    feld.focus();
  };
  diktat.onend = ende;
  diktat.onerror = ende;
  knopf.classList.add('is-hoert');
  knopf.setAttribute('aria-pressed', 'true');
  feld.placeholder = t('ki.hoertZu', 'Hört zu …');
  try { diktat.start(); } catch { ende(); }
}

let pille = null;
let blatt = null;
let arbeitet = false;
let hochUebrig = null;
/* Das Gespräch des Assistenten, der gerade antwortet — die anderen
   liegen in gespraeche und kommen beim Zurückwechseln wieder. */
let aktuell = null;          // der Assistent (aus assistenten())
let verlauf = [];
const gespraeche = new Map(); // wer -> { verlauf, html }
const vorraete = new Map();   // wer -> { am, kontext }
let gewaehlt = '';            // oben gewechselt; gilt bis zur nächsten Seite

/* ── Welche Assistenten, welcher antwortet ─────────────────────────── */

function gruppenJetzt() {
  return Array.isArray(window.__firnGruppen) ? window.__firnGruppen : [];
}
function aktiveGid(gruppen = gruppenJetzt()) {
  let gemerkt = '';
  try { gemerkt = localStorage.getItem('firn.gruppe') || ''; } catch {}
  return (gruppen.find(g => g.id === gemerkt) || gruppen[0])?.id || '';
}
const seiteJetzt = () => (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');

function alleAssistenten() {
  const profil = window.__firnProfil || null;
  return assistenten({ profil, kreis: profil ? imKreis(profil) : false, gruppen: gruppenJetzt(), t });
}
const waehlen = liste => assistentWaehlen(liste, { seite: seiteJetzt(), aktiveGid: aktiveGid(), gewaehlt });

function farbeSetzen(el, a) {
  if (!el) return;
  el.style.cssText = a && !a.persoenlich ? gruppenStil(gruppenJetzt())(a.wer) : '';
  el.classList.toggle('is-gruppe', !!a && !a.persoenlich);
}

function beschriften() {
  if (!pille) return;
  const liste = alleAssistenten();
  const a = waehlen(liste);
  /* Kein Assistent freigeschaltet: keine Pille, kein Hinweis. */
  pille.hidden = !a;
  if (!a) { if (blatt && !blatt.hidden) schliessen(); return; }
  pille.querySelector('.ki-pille__name').textContent = a.name;
  pille.setAttribute('aria-label', t('ki.oeffnen', '{name} fragen', { name: a.name }));
  farbeSetzen(pille, a);
  if (blatt) {
    blatt.querySelector('.ki-blatt__name').textContent = a.name;
    blatt.querySelector('.ki-blatt__unter').textContent = a.persoenlich ? t('ki.nurDu', 'Nur für dich') : a.gruppe;
    blatt.querySelector('.ki-feld').placeholder = t('ki.feldPh', '{name} fragen …', { name: a.name });
    farbeSetzen(blatt.querySelector('.ki-blatt__zeichen'), a);
    wahlZeigen(liste, a);
  }
  wechselZu(a);
}

/* Jeder Assistent hat sein Gespräch: beim Wechsel wird das alte
   weggelegt und das neue (oder eine Begrüssung) hergeholt. */
function wechselZu(a) {
  if (aktuell?.wer === a.wer) { aktuell = a; return; }
  const liste = blatt?.querySelector('.ki-verlauf');
  if (aktuell && liste) gespraeche.set(aktuell.wer, { verlauf, html: liste.innerHTML });
  aktuell = a;
  const g = gespraeche.get(a.wer);
  verlauf = g?.verlauf || [];
  if (liste) {
    liste.innerHTML = g?.html || '';
    if (!blatt.hidden && !verlauf.length && !liste.childElementCount) begruessen();
    else vorschlaegeZeigen(!verlauf.length);
  }
}

function wahlZeigen(liste, a) {
  const wahl = blatt.querySelector('.ki-wahl');
  wahl.hidden = liste.length < 2;
  if (liste.length < 2) { wahl.innerHTML = ''; return; }
  const stil = gruppenStil(gruppenJetzt());
  wahl.innerHTML = liste.map(x => `
    <button class="ki-wahl__knopf${x.persoenlich ? '' : ' is-gruppe'}" type="button" data-wer="${esc(x.wer)}"
            aria-pressed="${x.wer === a.wer}"${x.persoenlich ? '' : ` style="${esc(stil(x.wer))}"`}>
      <span class="ki-wahl__zeichen" aria-hidden="true">${x.persoenlich ? FUNKE : esc(kuerzel(x.gruppe))}</span>
      <span>${esc(x.persoenlich || x.eigen ? x.name : x.gruppe)}</span>
    </button>`).join('');
  /* Ohne eigenen Namen hiesse jeder Knopf "Assistent" — dann steht dort
     die Gruppe (v.35.58.0). */
}

/* ── Die Pille ─────────────────────────────────────────────────────── */

export function pilleZeigen() {
  if (!kiBasis() || pille || document.querySelector('.ki-pille')) return null;
  if (window.parent !== window) return null;
  /* In der Einheit und der Videoanalyse läuft unten die Uhr bzw. der
     Player — dort stünde die Pille im Weg. */
  if (/\/(einheit|video|guest)\.html$/.test(location.pathname)) return null;

  pille = document.createElement('button');
  pille.type = 'button';
  pille.className = 'ki-pille';
  pille.hidden = true;
  pille.innerHTML = `${FUNKE}<span class="ki-pille__name"></span>`;
  pille.addEventListener('click', () => (blatt && !blatt.hidden ? schliessen() : oeffnen()));
  document.body.appendChild(pille);

  for (const ereignis of ['firn-gruppe', 'firn-gruppen', 'firn-profil']) window.addEventListener(ereignis, beschriften);
  /* Eine neue Seite entscheidet neu, wer antwortet. */
  window.addEventListener('tvza-route', () => { gewaehlt = ''; beschriften(); });
  window.addEventListener('popstate', () => { gewaehlt = ''; beschriften(); });
  /* Eine andere Seite (die Gruppe im Rahmen) hat etwas geändert — etwa
     den Namen des Assistenten: der Vorrat ist alt. */
  window.addEventListener('storage', e => {
    if (e.key === STAND) { vorraete.clear(); beschriften(); }
  });
  beschriften();
  return pille;
}

/* ── Das Gespräch ──────────────────────────────────────────────────── */

function blattBauen() {
  blatt = document.createElement('section');
  blatt.className = 'ki-blatt';
  blatt.hidden = true;
  blatt.setAttribute('role', 'dialog');
  blatt.setAttribute('aria-labelledby', 'kiName');
  blatt.innerHTML = `
    <header class="ki-blatt__kopf">
      <span class="ki-blatt__zeichen" aria-hidden="true">${FUNKE}</span>
      <div class="ki-blatt__wer">
        <div class="ki-blatt__name" id="kiName"></div>
        <div class="ki-blatt__unter"></div>
      </div>
      <button class="ki-blatt__zu" type="button" aria-label="${esc(t('common.schliessen', 'Schliessen'))}">${ZU}</button>
    </header>
    <div class="ki-wahl" hidden></div>
    <div class="ki-verlauf" aria-live="polite"></div>
    <div class="ki-vorschlaege"></div>
    <form class="ki-eingabe">
      <textarea class="ki-feld" rows="1" maxlength="1000" autocomplete="off"></textarea>
      ${Erkennung() ? `<button class="ki-mikro" type="button" aria-pressed="false" aria-label="${esc(t('ki.diktieren', 'Diktieren'))}" title="${esc(t('ki.diktieren', 'Diktieren'))}">${MIKRO}</button>` : ''}
      <button class="ki-senden" type="submit" aria-label="${esc(t('ki.senden', 'Senden'))}">${SENDEN}</button>
    </form>
    <label class="ki-stufe">
      <input type="checkbox" class="ki-stufe__haken" />
      <span>${esc(t('ki.gruendlich', 'Deep Thinking'))}</span>
      <span class="ki-stufe__rest"></span>
    </label>`;
  document.body.appendChild(blatt);

  blatt.querySelector('.ki-blatt__zu').addEventListener('click', schliessen);
  blatt.querySelector('.ki-mikro')?.addEventListener('click', diktieren);
  blatt.addEventListener('keydown', e => { if (e.key === 'Escape') schliessen(); });
  const feld = blatt.querySelector('.ki-feld');
  blatt.querySelector('.ki-eingabe').addEventListener('submit', e => { e.preventDefault(); senden(feld.value); });
  feld.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(feld.value); }
  });
  feld.addEventListener('input', () => { feld.style.height = 'auto'; feld.style.height = `${Math.min(feld.scrollHeight, 120)}px`; });
  blatt.querySelector('.ki-vorschlaege').addEventListener('click', e => {
    const v = e.target.closest('[data-vorschlag]');
    if (v) senden(v.dataset.vorschlag);
  });
  blatt.querySelector('.ki-wahl').addEventListener('click', e => {
    const k = e.target.closest('[data-wer]');
    if (!k || arbeitet) return;
    gewaehlt = k.dataset.wer;
    beschriften();
    feld.focus();
  });
  blatt.querySelector('.ki-verlauf').addEventListener('click', kartenKlick);
  stufeZeigen();
  beschriften();
}

function oeffnen() {
  if (!blatt) blattBauen();
  blatt.hidden = false;
  document.body.classList.add('ki-offen');
  pille.setAttribute('aria-expanded', 'true');
  if (!verlauf.length && !blatt.querySelector('.ki-verlauf').childElementCount) begruessen();
  blatt.querySelector('.ki-feld').focus();
  gruppenAuffrischen();
}

/* Die Gruppen der Leiste kommen aus den Mitgliedschaften — ändert der
   Admin danach etwas an einer Gruppe (Assistent freigeschaltet, v.35.57.2:
   Michel sah danach keinen Wechsel zum Assistenten der Gruppe), erfährt
   die Leiste das erst beim nächsten Laden. Beim Öffnen darum frisch. */
async function gruppenAuffrischen() {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const groups = await import('./groups.js');
    window.__firnGruppen = await groups.meineGruppen(uid);
    beschriften();
  } catch { /* dann bleibt es, wie es war */ }
}

function schliessen() {
  if (!blatt) return;
  diktat?.stop?.();
  blatt.hidden = true;
  document.body.classList.remove('ki-offen');
  pille?.setAttribute('aria-expanded', 'false');
  pille?.focus();
}

function begruessen() {
  const liste = blatt.querySelector('.ki-verlauf');
  let gesehen = false;
  try { gesehen = localStorage.getItem(HINWEIS) === '1'; } catch {}
  if (!gesehen) {
    liste.insertAdjacentHTML('beforeend', `<p class="ki-hinweis">${esc(t('ki.datenschutz',
      'Deine Fragen gehen mit deinen Terminen an Google Gemini. Schreib nichts hinein, das niemand lesen soll.'))}</p>`);
    try { localStorage.setItem(HINWEIS, '1'); } catch {}
  }
  const a = aktuell;
  if (!a) return;
  nachricht('ki', a.persoenlich
    ? t('ki.halloIch', 'Hallo! Ich bin dein persönlicher Assistent. Ich trage dir Erinnerungen und eigene Termine ein, verschiebe sie und sage dir, was ansteht — auch in deinen Gruppen.')
    : a.eigen
      ? t('ki.halloGruppe', 'Hallo! Ich bin {name}, der Assistent von «{gruppe}». Ich kenne die Termine der Gruppe und plane Trainings, Lager und Rennen.', { name: a.name, gruppe: a.gruppe })
      : t('ki.halloGruppeStandard', 'Hallo! Ich bin der Assistent von «{gruppe}». Ich kenne die Termine der Gruppe und plane Trainings, Lager und Rennen.', { gruppe: a.gruppe }));
  vorschlaegeZeigen(true);
}

function vorschlaegeZeigen(zeigen = true) {
  const feld = blatt.querySelector('.ki-vorschlaege');
  if (!zeigen || !aktuell) { feld.innerHTML = ''; return; }
  const gruppe = gruppenJetzt().find(g => g.id === aktuell.wer);
  const leite = gruppe && (gruppe.meineRolle === 'head' || gruppe.meineRolle === 'staff');
  const liste = aktuell.persoenlich
    ? [t('ki.v.woche', 'Was steht diese Woche an?'), t('ki.v.erinnerung', 'Erinnere mich morgen um 18 Uhr ans Packen')]
    : [t('ki.v.gruppeWoche', 'Was steht in der Gruppe diese Woche an?'),
      ...(leite ? [t('ki.v.training', 'Plane nächste Woche zwei Trainings')] : [])];
  feld.innerHTML = liste.map(v =>
    `<button class="ki-vorschlag" type="button" data-vorschlag="${esc(v)}">${esc(v)}</button>`).join('');
}

function nachricht(wer, text) {
  const liste = blatt.querySelector('.ki-verlauf');
  const el = document.createElement('div');
  el.className = `ki-nachricht ki-nachricht--${wer}`;
  /* Die Antwort des Assistenten kommt in Markdown (**fett**, Listen) —
     formatiert statt roh (v.35.60.0). Was man selbst schreibt, bleibt Text. */
  if (wer === 'ki') { el.classList.add('fmt'); el.innerHTML = formatiert(text); } else el.textContent = text;
  liste.appendChild(el);
  liste.scrollTop = liste.scrollHeight;
  return el;
}

function stufeZeigen() {
  if (!blatt) return;
  const rest = blatt.querySelector('.ki-stufe__rest');
  const haken = blatt.querySelector('.ki-stufe__haken');
  rest.textContent = hochUebrig === null ? '' : t('ki.nochMal', 'noch {n}× heute', { n: hochUebrig });
  if (hochUebrig === 0) haken.checked = false;
  haken.disabled = hochUebrig === 0;
}

/* ── Kontext: nur, was dieser Assistent kennen darf ────────────────── */

async function kontextLaden(a) {
  const vorrat = vorraete.get(a.wer);
  if (vorrat && Date.now() - vorrat.am < VORRAT_MS) return vorrat.kontext;
  const uid = auth.currentUser?.uid;
  const groups = await import('./groups.js');
  const alle = await groups.meineGruppen(uid).catch(() => gruppenJetzt());
  const gruppen = a.persoenlich ? alle : alle.filter(g => g.id === a.wer);
  const [jeGruppe, eigene, erinnerungen, quellen] = await Promise.all([
    Promise.all(gruppen.map(g => groups.ladeTermine(g.id)
      .then(liste => liste.map(e => ({ ...e, gid: g.id }))).catch(() => []))),
    a.persoenlich ? getDocs(query(collection(db, 'calendarDays'), where('ownerUid', '==', uid)))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []) : [],
    a.persoenlich ? getDocs(collection(db, 'users', uid, 'reminders'))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []) : [],
    trainingsQuellen(groups, gruppen, uid, !a.persoenlich),
  ]);
  const jetzt = new Date();
  const heute = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
  const trainings = planEinheiten(quellen, heute).map(e => ({
    ...e, fuer: e.fuer === groups.PLAN_FUER_ALLE || !e.fuer ? 'alle' : e.fuer === uid ? 'du' : 'athlet',
  }));
  const kontext = kontextBauen({
    jetzt: new Date(), sprache: document.documentElement.lang || 'de-CH', seite: seiteJetzt(),
    aktiveGid: aktiveGid(alle), wer: a.wer, gruppen, termine: jeGruppe.flat(), eigene, erinnerungen,
    trainings, leitet: groups.leitet,
  });
  vorraete.set(a.wer, { am: Date.now(), kontext });
  return kontext;
}

/* Die Trainingspläne (v.35.59.0): der persönliche Assistent kennt die
   Pläne für alle und die eigenen, der der Gruppe für die Leitung alle —
   wer den Kader leitet, fragt "was trainieren wir am Dienstag", und die
   Excel ist meist pro Athlet. Dieselbe Abfrage wie die Woche
   (ladePlaene), die Regel entscheidet. */
async function trainingsQuellen(groups, gruppen, uid, alsGruppe) {
  const je = await Promise.all(gruppen.map(async g => {
    const alsLeitung = alsGruppe && groups.leitet(g.meineRolle);
    let plaene = [];
    try { plaene = await groups.ladePlaene(g.id, uid, alsLeitung); } catch { return []; }
    return plaene.map(plan => {
      let programm = null;
      try { programm = JSON.parse(plan.json); } catch { /* kaputter Plan: weglassen */ }
      return programm ? { gid: g.id, gruppe: g.name || '', plan: { ...plan, json: undefined }, programm } : null;
    }).filter(Boolean);
  }));
  return je.flat();
}

/* ── Fragen ────────────────────────────────────────────────────────── */

async function senden(roh) {
  const frage = String(roh || '').trim();
  const a = aktuell;
  if (!frage || arbeitet || !a) return;
  diktat?.stop?.();
  const feld = blatt.querySelector('.ki-feld');
  feld.value = '';
  feld.style.height = 'auto';
  vorschlaegeZeigen(false);
  nachricht('ich', frage);
  const warten = nachricht('ki', t('ki.denkt', 'Denkt nach …'));
  warten.classList.add('ki-nachricht--warten');
  arbeitet = true;
  blatt.classList.add('is-arbeitet');
  const hoch = blatt.querySelector('.ki-stufe__haken').checked;
  try {
    const kontext = await kontextLaden(a);
    const token = await auth.currentUser.getIdToken();
    const antwort = await fragen({ basis: kiBasis(), token, frage, hoch, verlauf, kontext, assistent: a });
    warten.remove();
    verlauf.push({ rolle: 'nutzer', text: frage });
    const text = antwort.text || (antwort.aktionen.length ? t('ki.vorschlag', 'Hier ist mein Vorschlag:') : '…');
    nachricht('ki', text);
    verlauf.push({ rolle: 'assistent', text });
    if (antwort.hochUebrig !== null) hochUebrig = antwort.hochUebrig;
    if (antwort.hochAufgebraucht) nachricht('info', t('ki.hochAus', 'Deep Thinking geht heute nicht mehr — die Antwort kommt von der schnellen Stufe.'));
    stufeZeigen();
    for (const aktion of antwort.aktionen) karteZeigen(aktionPruefen(aktion, kontext));
  } catch (e) {
    warten.remove();
    if (!e?.code) reportClientError('ki-fragen', e);
    nachricht('info', fehlerText(e?.code, e?.grund, t));
  } finally {
    arbeitet = false;
    blatt.classList.remove('is-arbeitet');
  }
}

/* ── Vorschläge als Karten ─────────────────────────────────────────── */

const offene = new Map();
let naechste = 0;

function karteZeigen(pruefung) {
  const liste = blatt.querySelector('.ki-verlauf');
  const el = document.createElement('div');
  el.className = 'ki-karte';
  if (!pruefung.ok) {
    el.classList.add('ki-karte--nein');
    el.textContent = t('ki.geht', 'Das trage ich nicht ein: {grund}', { grund: pruefung.grund });
    liste.appendChild(el);
    return;
  }
  const id = String(naechste++);
  offene.set(id, pruefung);
  const z = aktionZeile(pruefung, { sprache: document.documentElement.lang || 'de-CH', t });
  el.dataset.karte = id;
  el.innerHTML = `
    <div class="ki-karte__was">${esc(z.was)}</div>
    <div class="ki-karte__titel">${esc(z.titel)}</div>
    <div class="ki-karte__wann">${esc(z.wann)}${z.ort ? ` · ${esc(z.ort)}` : ''}</div>
    <div class="ki-karte__knoepfe">
      <button class="b b--primary" type="button" data-ja>${esc(pruefung.art === 'verschieben'
        ? t('ki.verschieben', 'Verschieben') : t('ki.eintragen', 'Eintragen'))}</button>
      <button class="b b--secondary" type="button" data-nein>${esc(t('ki.nein', 'Nein'))}</button>
    </div>`;
  liste.appendChild(el);
  liste.scrollTop = liste.scrollHeight;
}

async function kartenKlick(e) {
  const karte = e.target.closest('[data-karte]');
  if (!karte) return;
  const pruefung = offene.get(karte.dataset.karte);
  if (!pruefung) return;
  const knoepfe = karte.querySelector('.ki-karte__knoepfe');
  if (e.target.closest('[data-nein]')) {
    offene.delete(karte.dataset.karte);
    knoepfe.outerHTML = `<div class="ki-karte__stand">${esc(t('ki.verworfen', 'Verworfen'))}</div>`;
    return;
  }
  if (!e.target.closest('[data-ja]')) return;
  knoepfe.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    await ausfuehren(pruefung);
    offene.delete(karte.dataset.karte);
    karte.classList.add('ki-karte--erledigt');
    knoepfe.outerHTML = `<div class="ki-karte__stand">${esc(pruefung.art === 'verschieben'
      ? t('ki.verschoben', 'Verschoben') : t('ki.eingetragen', 'Eingetragen'))}</div>`;
  } catch (fehler) {
    reportClientError('ki-eintragen', fehler);
    knoepfe.querySelectorAll('button').forEach(b => { b.disabled = false; });
    nachricht('info', t('ki.f.eintragen', 'Das liess sich nicht eintragen.'));
  }
}

/** Schreibt, was die Person bestätigt hat — mit ihren Rechten. */
export async function ausfuehren(pruefung, { uid = auth.currentUser?.uid } = {}) {
  const d = pruefung.daten;
  if (pruefung.art === 'erinnerung') {
    await addDoc(collection(db, 'users', uid, 'reminders'),
      { ...d, completed: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else if (pruefung.art === 'eigen') {
    await addDoc(collection(db, 'calendarDays'),
      { ownerUid: uid, ...d, planHtml: '', planUrl: '', createdAt: serverTimestamp() });
  } else if (pruefung.art === 'gruppe') {
    const groups = await import('./groups.js');
    await groups.terminAnlegen(pruefung.ziel.gid, uid, d);
  } else if (pruefung.art === 'verschieben') {
    const z = pruefung.ziel;
    if (z.quelle === 'gruppe') {
      const groups = await import('./groups.js');
      await groups.terminAendern(z.gid, z.eid, d);
    } else if (z.quelle === 'eigen') {
      await updateDoc(doc(db, 'calendarDays', z.id), d);
    } else {
      await updateDoc(doc(db, 'users', uid, 'reminders', z.id), { ...d, updatedAt: serverTimestamp() });
    }
  } else {
    throw new Error('unbekannte Aktion');
  }
  /* Der Vorrat ist alt, und die anderen Seiten (Kalender, Gruppe im
     Rahmen) erfahren es über 'storage'. */
  vorraete.clear();
  try { localStorage.setItem(STAND, String(Date.now())); } catch {}
}

