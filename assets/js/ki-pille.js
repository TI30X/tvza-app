/* ══════════════════════════════════════════════════════════════════
   Die Pille — der Assistent, der überall ist (v.35.53.0).

   Michel: "nicht eine eigene Tabelle, sondern wie eine fliegende Pille,
   die überall ist" — und: "wäre cool, wenn Gruppen die Möglichkeit
   hätten, ihren Assistenten zu benennen und einen eigenen zu haben".

   Die Pille schwebt über jeder Seite der App (nur im obersten Dokument,
   nie in einem Rahmen des Routers — sonst stünde sie doppelt da). Sie
   trägt den Namen des Assistenten der aktiven Gruppe ("Coach Maxi"),
   ohne eigenen Namen "Assistent". Ein Tipp öffnet das Gespräch: am Handy
   als Blatt über der Leiste, am Laptop als Spalte rechts.

   Was hier passiert:
   - Kontext laden: die eigenen Gruppen, deren Termine, die eigenen
     Termine und Erinnerungen — mit den Rechten der Person, fünf Minuten
     gemerkt (ki.js entscheidet, was davon mitgeht).
   - Fragen: an den Worker (worker/ki.js), mit dem ID-Token. Der
     Gemini-Schlüssel ist nie hier.
   - Vorschläge: jede Aktion des Assistenten wird geprüft
     (aktionPruefen) und als Karte gezeigt. Erst "Eintragen" schreibt.
   Ohne Worker-Adresse gibt es die Pille nicht.
   ══════════════════════════════════════════════════════════════════ */

import { auth, db, reportClientError } from './firebase-config.js';
import { WORKER_BASIS } from './worker-config.js';
import {
  assistentVon, kontextBauen, aktionPruefen, aktionZeile, fragen, fehlerText,
} from './ki.js';
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

let pille = null;
let blatt = null;
let verlauf = [];
let vorrat = null;          // { am, kontext, gruppen }
let hochUebrig = null;
let arbeitet = false;

/* ── Welche Gruppe, welcher Assistent ──────────────────────────────── */

function gruppenJetzt() {
  return Array.isArray(window.__firnGruppen) ? window.__firnGruppen : (vorrat?.gruppen || []);
}
function aktiveGruppe(gruppen = gruppenJetzt()) {
  let gemerkt = '';
  try { gemerkt = localStorage.getItem('firn.gruppe') || ''; } catch {}
  return gruppen.find(g => g.id === gemerkt) || gruppen[0] || null;
}
const assistent = () => assistentVon(aktiveGruppe(), t);

function beschriften() {
  if (!pille) return;
  const a = assistent();
  pille.querySelector('.ki-pille__name').textContent = a.name;
  pille.setAttribute('aria-label', t('ki.oeffnen', '{name} fragen', { name: a.name }));
  pille.classList.toggle('ki-pille--eigen', a.eigen);
  if (blatt) {
    blatt.querySelector('.ki-blatt__name').textContent = a.name;
    blatt.querySelector('.ki-blatt__unter').textContent = a.gruppe;
    blatt.querySelector('.ki-feld').placeholder = t('ki.feldPh', '{name} fragen …', { name: a.name });
  }
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
  pille.innerHTML = `${FUNKE}<span class="ki-pille__name"></span>`;
  pille.addEventListener('click', () => (blatt && !blatt.hidden ? schliessen() : oeffnen()));
  document.body.appendChild(pille);
  beschriften();

  window.addEventListener('firn-gruppe', beschriften);
  window.addEventListener('firn-gruppen', beschriften);
  /* Eine andere Seite (die Gruppe im Rahmen) hat etwas geändert — etwa
     den Namen des Assistenten: der Vorrat ist alt. */
  window.addEventListener('storage', e => {
    if (e.key === STAND) { vorrat = null; beschriften(); }
  });
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
    <div class="ki-verlauf" aria-live="polite"></div>
    <div class="ki-vorschlaege"></div>
    <form class="ki-eingabe">
      <textarea class="ki-feld" rows="1" maxlength="1000" autocomplete="off"></textarea>
      <button class="ki-senden" type="submit" aria-label="${esc(t('ki.senden', 'Senden'))}">${SENDEN}</button>
    </form>
    <label class="ki-stufe">
      <input type="checkbox" class="ki-stufe__haken" />
      <span>${esc(t('ki.gruendlich', 'Gründlich'))}</span>
      <span class="ki-stufe__rest"></span>
    </label>`;
  document.body.appendChild(blatt);

  blatt.querySelector('.ki-blatt__zu').addEventListener('click', schliessen);
  blatt.addEventListener('keydown', e => { if (e.key === 'Escape') schliessen(); });
  const feld = blatt.querySelector('.ki-feld');
  const form = blatt.querySelector('.ki-eingabe');
  form.addEventListener('submit', e => { e.preventDefault(); senden(feld.value); });
  feld.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(feld.value); }
  });
  feld.addEventListener('input', () => { feld.style.height = 'auto'; feld.style.height = `${Math.min(feld.scrollHeight, 120)}px`; });
  blatt.querySelector('.ki-vorschlaege').addEventListener('click', e => {
    const v = e.target.closest('[data-vorschlag]');
    if (v) senden(v.dataset.vorschlag);
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
  if (!verlauf.length) begruessen();
  blatt.querySelector('.ki-feld').focus();
}

function schliessen() {
  if (!blatt) return;
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
  const a = assistent();
  /* Ohne eigenen Namen nicht 'Ich bin Assistent' — das liest sich wie ein Formular. */
  nachricht('ki', a.eigen
    ? t('ki.hallo', 'Hallo! Ich bin {name}. Ich kann Termine, Trainings und Erinnerungen für dich eintragen, verschieben oder planen — frag einfach.', { name: a.name })
    : t('ki.halloStandard', 'Hallo! Ich kann Termine, Trainings und Erinnerungen für dich eintragen, verschieben oder planen — frag einfach.'));
  vorschlaegeZeigen();
}

function vorschlaegeZeigen() {
  const leite = gruppenJetzt().some(g => g.meineRolle === 'head' || g.meineRolle === 'staff');
  const liste = [
    t('ki.v.woche', 'Was steht diese Woche an?'),
    t('ki.v.erinnerung', 'Erinnere mich morgen um 18 Uhr ans Packen'),
    ...(leite ? [t('ki.v.training', 'Plane nächste Woche zwei Trainings')] : []),
  ];
  blatt.querySelector('.ki-vorschlaege').innerHTML = liste.map(v =>
    `<button class="ki-vorschlag" type="button" data-vorschlag="${esc(v)}">${esc(v)}</button>`).join('');
}

function nachricht(wer, text) {
  const liste = blatt.querySelector('.ki-verlauf');
  const el = document.createElement('div');
  el.className = `ki-nachricht ki-nachricht--${wer}`;
  el.textContent = text;
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

/* ── Kontext ───────────────────────────────────────────────────────── */

async function kontextLaden() {
  if (vorrat && Date.now() - vorrat.am < VORRAT_MS) return vorrat;
  const uid = auth.currentUser?.uid;
  const groups = await import('./groups.js');
  const gruppen = await groups.meineGruppen(uid).catch(() => gruppenJetzt());
  const [jeGruppe, eigene, erinnerungen] = await Promise.all([
    Promise.all(gruppen.map(g => groups.ladeTermine(g.id)
      .then(liste => liste.map(e => ({ ...e, gid: g.id }))).catch(() => []))),
    getDocs(query(collection(db, 'calendarDays'), where('ownerUid', '==', uid)))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
    getDocs(collection(db, 'users', uid, 'reminders'))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
  ]);
  const seite = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  const kontext = kontextBauen({
    jetzt: new Date(), sprache: document.documentElement.lang || 'de-CH', seite,
    aktiveGid: aktiveGruppe(gruppen)?.id || '', gruppen, termine: jeGruppe.flat(), eigene, erinnerungen,
    leitet: groups.leitet,
  });
  vorrat = { am: Date.now(), kontext, gruppen };
  beschriften();
  return vorrat;
}

/* ── Fragen ────────────────────────────────────────────────────────── */

async function senden(roh) {
  const frage = String(roh || '').trim();
  if (!frage || arbeitet) return;
  const feld = blatt.querySelector('.ki-feld');
  feld.value = '';
  feld.style.height = 'auto';
  blatt.querySelector('.ki-vorschlaege').innerHTML = '';
  nachricht('ich', frage);
  const warten = nachricht('ki', t('ki.denkt', 'Denkt nach …'));
  warten.classList.add('ki-nachricht--warten');
  arbeitet = true;
  blatt.classList.add('is-arbeitet');
  const hoch = blatt.querySelector('.ki-stufe__haken').checked;
  try {
    const { kontext, gruppen } = await kontextLaden();
    const token = await auth.currentUser.getIdToken();
    const antwort = await fragen({
      basis: kiBasis(), token, frage, hoch, verlauf, kontext, assistent: assistentVon(aktiveGruppe(gruppen), t),
    });
    warten.remove();
    verlauf.push({ rolle: 'nutzer', text: frage });
    const text = antwort.text || (antwort.aktionen.length ? t('ki.vorschlag', 'Hier ist mein Vorschlag:') : '…');
    nachricht('ki', text);
    verlauf.push({ rolle: 'assistent', text });
    if (antwort.hochUebrig !== null) hochUebrig = antwort.hochUebrig;
    if (antwort.hochAufgebraucht) nachricht('info', t('ki.hochAus', 'Gründlich geht heute nicht mehr — die Antwort kommt von der schnellen Stufe.'));
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
  vorrat = null;
  try { localStorage.setItem(STAND, String(Date.now())); } catch {}
}
