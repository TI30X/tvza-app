/* ══════════════════════════════════════════════════════════════════
   Der Überblick auf Start (v.35.66.0) — laden und zeichnen.

   Michel: "Home darf nie leer sein … heutige oder nächste Trainings,
   bevorstehende Termine, eigene Gruppen, Trainingsfortschritt und den
   zugänglichen Assistenten. Ein neues Konto ohne Gruppe bekommt
   Beitreten und Erstellen. Keine Daten, lädt, offline und Laden
   gescheitert auseinanderhalten. Kompakt."

   Was gezeigt wird, entscheidet ueberblick.js (rein). Hier: holen —
   alle Quellen nebeneinander, keine davon mit einer Frist, nach der sie
   still wegfällt (so fiel die alte Tageskarte meistens aus, siehe dort)
   —, und neu zeichnen, sobald etwas ankommt.

   Eigenes Modul auf der Seite, mit eigenem requireAuth, wie heute.js:
   ein Fehler in einem grossen Modul nimmt den Überblick nicht mit.
   ══════════════════════════════════════════════════════════════════ */

import { db, requireAuth, getProfile, reportClientError } from '../../firebase-config.js';
import {
  beobachteMeineGruppen, ladeTermine, ladePlaene, ladeProtokolle, leitet, aktiveGruppeSetzen,
} from '../../groups.js';
import { wichtigeInfos, zustand, isoVon } from '../../ueberblick.js';
import { nachDatum, einheitZiel, plusTage } from '../../wochenplan.js';
import { gruppenStil, kuerzel } from '../../gruppenwahl.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  training: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  termin: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  absage: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M9 13l6 6M15 13l-6 6M3 10h18"/></svg>',
  erinnerung: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  plan: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
};
ICON.eigen = ICON.termin;

let uid = '';
let gruppen = null;          // null: noch nicht gemeldet
let stand = { termine: [], plaene: [], protokolle: {}, erinnerungen: [], eigene: [] };
let fehler = 0;
let quellen = 0;
let laedt = true;
let geladenFuer = '';

/* ── Wann ─────────────────────────────────────────────────────────── */

function wannText(datum, zeit) {
  const heute = isoVon(new Date());
  const tag = datum === heute ? t('start.heute', 'Heute')
    : datum === plusTage(heute, 1) ? t('start.morgen', 'Morgen')
    : (window.TVZAI18n?.format?.date?.(new Date(`${datum}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short' })
      || new Date(`${datum}T12:00:00`).toLocaleDateString(document.documentElement.lang || 'de', { weekday: 'short', day: 'numeric', month: 'short' }));
  return zeit ? `${tag} · ${zeit}` : tag;
}

/* ── Eine Zeile ───────────────────────────────────────────────────── */

function adresse(x) {
  if (x.art === 'training') return `pages/${einheitZiel(x.gid, x.planId, { unit: x.unit }, x.datum, 'training').slice(2)}`;
  if (x.art === 'termin' || x.art === 'absage') return `pages/gruppe.html?g=${encodeURIComponent(x.gid)}&termin=${encodeURIComponent(x.id)}`;
  if (x.art === 'plan') return `pages/gruppe.html?g=${encodeURIComponent(x.gid)}`;
  return 'pages/planner.html';
}

function zeile(x) {
  const titel = x.art === 'absage' ? t('start.abgesagt', 'Abgesagt: {titel}', { titel: x.titel })
    : x.art === 'plan' ? t('start.neuerPlan', 'Neuer Plan: {titel}', { titel: x.titel })
    : x.titel;
  const unter = [
    x.art === 'plan' ? '' : x.ueberfaellig ? t('start.ueberfaellig', 'Überfällig') : wannText(x.datum, x.zeit || (x.art === 'training' ? x.slot : '')),
    x.gruppe,
  ].filter(Boolean).join(' · ');
  const f = x.fortschritt;
  const rechts = f && f.gesamt
    ? (f.fertig ? `<span class="wichtig__ok">${esc(t('start.erledigt', 'Erledigt'))}</span>`
      : `<span class="wichtig__prog">${f.erledigt}/${f.gesamt}</span>`)
    : '';
  return `
    <a class="row wichtig__zeile" href="${esc(adresse(x))}" data-art="${esc(x.art)}"${x.gid ? ` data-gid="${esc(x.gid)}"` : ''}>
      <span class="row__icon">${ICON[x.art] || ICON.termin}</span>
      <span class="row__body">
        <span class="row__title">${esc(titel)}</span>
        <span class="row__sub">${esc(unter)}</span>
        ${x.notiz ? `<span class="wichtig__notiz">${esc(x.notiz)}</span>` : ''}
      </span>
      ${rechts ? `<span class="row__end">${rechts}</span>` : ''}
    </a>`;
}

/* ── Zeichnen ─────────────────────────────────────────────────────── */

function zeichneWichtig() {
  const liste = $('wichtigListe');
  if (!liste) return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const info = wichtigeInfos({ jetzt: new Date(), uid, gruppen: gruppen || [], ...stand });
  const z = zustand({ laedt: laedt || gruppen === null, offline, fehler, quellen, nichts: info.nichts });
  $('wichtigTitel').textContent = info.abend ? t('start.morgenTitel', 'Morgen') : t('start.heuteTitel', 'Heute');
  const hinweis = $('wichtigStand');
  hinweis.textContent = offline ? t('start.offlineStand', 'Offline — zeigt, was zuletzt geladen war') : '';
  hinweis.hidden = !hinweis.textContent;
  $('ueberblick').setAttribute('aria-busy', z === 'laedt' ? 'true' : 'false');

  if (z === 'laedt') {
    liste.innerHTML = `<p class="empty-hint">${esc(t('start.laedt', 'Lädt, was ansteht …'))}</p>`;
    return;
  }
  if (z === 'fehler' || z === 'offline') {
    liste.innerHTML = `
      <p class="empty-hint">${esc(z === 'offline'
        ? t('start.offline', 'Offline — und noch nichts auf diesem Gerät gespeichert. Sobald wieder Netz ist, steht hier, was ansteht.')
        : t('start.fehler', 'Was ansteht, liess sich gerade nicht laden.'))}</p>
      <button class="linkknopf" type="button" id="wichtigNochmal">${esc(t('start.nochmal', 'Erneut laden'))}</button>`;
    return;
  }
  if (z === 'leer' || z === 'offline-leer') {
    liste.innerHTML = `<p class="empty-hint">${esc((gruppen || []).length
      ? t('start.nichtsGeplant', 'In den nächsten zwei Wochen steht nichts an.')
      : t('start.nochNichts', 'Noch nichts geplant. Tritt einer Gruppe bei oder gründe eine — dann steht hier, was ansteht.'))}</p>`;
    return;
  }

  const jetzt = info.jetzt.map(zeile).join('');
  const leerJetzt = info.jetzt.length ? '' : `<p class="empty-hint wichtig__ruhig">${esc(info.abend
    ? t('start.morgenRuhig', 'Morgen steht nichts an.')
    : t('start.heuteRuhig', 'Heute steht nichts an.'))}</p>`;
  const mehr = info.mehrJetzt ? `<a class="linkknopf wichtig__mehr" href="pages/planner.html">${esc(t('start.mehr', '+ {n} weitere im Kalender', { n: info.mehrJetzt }))}</a>` : '';
  const spaeter = info.demnaechst.length
    ? `<div class="marke brief__marke">${esc(t('start.demnaechst', 'Demnächst'))}</div>${info.demnaechst.map(zeile).join('')}`
    : '';
  liste.innerHTML = `${leerJetzt}${jetzt}${mehr}${spaeter}`;
}

/* Die eigenen Gruppen — oder, ohne Gruppe, die zwei Wege hinein. */
function zeichneGruppen() {
  const el = $('startGruppen');
  if (!el || gruppen === null) return;
  el.hidden = false;
  if (!gruppen.length) {
    el.innerHTML = `
      <div class="marke">${esc(t('start.losGehts', 'Los geht’s'))}</div>
      <div class="start-wege">
        <a class="start-weg" href="pages/gruppe.html?anlegen=1">
          <span class="start-weg__wort">${esc(t('grp.neu', 'Gruppe erstellen'))}</span>
          <span class="start-weg__sub">${esc(t('start.erstellenSub', 'Für deinen Kader, Verein oder deine Familie.'))}</span>
        </a>
        <a class="start-weg" href="pages/gruppe.html?beitreten=1">
          <span class="start-weg__wort">${esc(t('grp.beitreten', 'Mit Code beitreten'))}</span>
          <span class="start-weg__sub">${esc(t('start.beitretenSub', 'Du hast einen Link oder Code bekommen.'))}</span>
        </a>
      </div>`;
    return;
  }
  const stil = gruppenStil(gruppen);
  el.innerHTML = `
    <div class="marke">${esc(t('start.deineGruppen', 'Deine Gruppen'))}</div>
    <div class="start-gruppen__liste">
      ${gruppen.map(g => `
        <a class="start-gruppe" href="pages/gruppe.html?g=${encodeURIComponent(g.id)}" data-gruppe="${esc(g.id)}" style="${esc(stil(g.id))}">
          <span class="start-gruppe__zeichen" aria-hidden="true">${esc(kuerzel(g.name))}</span>
          <span class="start-gruppe__name">${esc(g.name || '')}</span>
        </a>`).join('')}
    </div>`;
}

/* Der Assistent, den man hat — die Pille kennt die Liste. */
function zeichneAssistent() {
  const el = $('startKi');
  if (!el) return;
  const liste = Array.isArray(window.__firnAssistenten) ? window.__firnAssistenten : [];
  el.hidden = !liste.length;
  if (!liste.length) { el.innerHTML = ''; return; }
  el.innerHTML = liste.map(a => `
    <button class="row start-ki__knopf" type="button" data-ki="${esc(a.wer)}">
      <span class="row__icon" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg></span>
      <span class="row__body">
        <span class="row__title">${esc(t('start.fragen', '{name} fragen', { name: a.name }))}</span>
        <span class="row__sub">${esc(a.persoenlich ? t('ki.nurDu', 'Nur für dich') : t('ki.vonGruppe', 'Assistent von «{gruppe}»', { gruppe: a.gruppe }))}</span>
      </span>
    </button>`).join('');
}

function zeichne() {
  zeichneWichtig();
  zeichneGruppen();
  zeichneAssistent();
}

/* ── Laden ────────────────────────────────────────────────────────── */

async function eigenesLaden() {
  const [erinnerungen, eigene] = await Promise.allSettled([
    getDocs(collection(db, 'users', uid, 'reminders')).then(s => s.docs.map(d => d.data())),
    getDocs(query(collection(db, 'calendarDays'), where('ownerUid', '==', uid))).then(s => s.docs.map(d => d.data())),
  ]);
  return {
    erinnerungen: erinnerungen.status === 'fulfilled' ? erinnerungen.value : null,
    eigene: eigene.status === 'fulfilled' ? eigene.value : null,
  };
}

async function allesLaden() {
  const liste = gruppen || [];
  const schluessel = liste.map(g => `${g.id}:${g.meineRolle || ''}`).sort().join('|');
  geladenFuer = schluessel;
  laedt = true;
  zeichneWichtig();

  const jeGruppe = await Promise.allSettled(liste.map(async g => {
    const [termine, plaene, protokolle] = await Promise.allSettled([
      ladeTermine(g.id),
      ladePlaene(g.id, uid, leitet(g.meineRolle)),
      ladeProtokolle(g.id, uid),
    ]);
    return { g, termine, plaene, protokolle };
  }));
  const eigenes = await eigenesLaden();
  if (geladenFuer !== schluessel) return;   // inzwischen neue Gruppen: das Neuere zeichnet

  const neu = { termine: [], plaene: [], protokolle: {}, erinnerungen: eigenes.erinnerungen || [], eigene: eigenes.eigene || [] };
  let n = 2;
  let weg = (eigenes.erinnerungen ? 0 : 1) + (eigenes.eigene ? 0 : 1);
  for (const r of jeGruppe) {
    if (r.status !== 'fulfilled') { n += 3; weg += 3; continue; }
    const { g, termine, plaene, protokolle } = r.value;
    n += 3;
    if (termine.status === 'fulfilled') neu.termine.push(...termine.value.map(x => ({ ...x, gid: g.id })));
    else { weg += 1; reportClientError('start/termine', termine.reason); }
    if (plaene.status === 'fulfilled') {
      for (const plan of plaene.value) {
        let programm = null;
        try { programm = JSON.parse(plan.json); } catch { /* ein kaputter Plan fällt weg */ }
        if (programm) neu.plaene.push({ gid: g.id, plan, programm });
      }
    } else { weg += 1; reportClientError('start/plaene', plaene.reason); }
    if (protokolle.status === 'fulfilled') neu.protokolle[g.id] = nachDatum(protokolle.value);
    else weg += 1;   // Beiwerk: ohne Protokolle fehlt nur der Fortschritt
  }
  stand = neu;
  quellen = n;
  fehler = weg;
  laedt = false;
  zeichneWichtig();
}

/* ── Start ────────────────────────────────────────────────────────── */

(async () => {
  let user;
  try { user = await requireAuth('willkommen.html'); } catch { return; }
  if (!user || !$('ueberblick')) return;
  uid = user.uid;
  void getProfile(user).catch(() => null);

  $('ueberblick').addEventListener('click', event => {
    if (event.target.closest('#wichtigNochmal')) { void allesLaden(); return; }
    const ki = event.target.closest('[data-ki]');
    if (ki) {
      const oben = (() => { try { return window.top || window; } catch { return window; } })();
      oben.dispatchEvent(new CustomEvent('firn-ki-oeffnen', { detail: { wer: ki.dataset.ki } }));
      return;
    }
    /* Eine Gruppe antippen macht sie zur aktiven — wie in der Leiste. */
    const g = event.target.closest('[data-gruppe], [data-gid]');
    if (g) aktiveGruppeSetzen(g.dataset.gruppe || g.dataset.gid);
  });
  window.addEventListener('firn-ki-liste', zeichneAssistent);
  window.addEventListener('online', () => { void allesLaden(); });
  window.addEventListener('offline', zeichneWichtig);
  /* Um Mitternacht (oder am Abend) wechselt, was "heute" ist. */
  setInterval(zeichneWichtig, 5 * 60 * 1000);
  /* Ein Training abgehakt, ein Termin eingetragen (anderer Rahmen,
     Assistent): neu laden. */
  window.addEventListener('storage', e => { if (e.key === 'firn.daten') void allesLaden(); });

  zeichne();
  beobachteMeineGruppen(uid, liste => {
    const neu = Array.isArray(liste) ? liste : [];
    /* Eine leere, unvollständige Liste heisst "noch unbekannt", nicht
       "keine Gruppe" (v.35.62.0) — dann bleibt "lädt" stehen. */
    if (!neu.length && liste?.unvollstaendig) return;
    gruppen = neu;
    zeichneGruppen();
    const schluessel = neu.map(g => `${g.id}:${g.meineRolle || ''}`).sort().join('|');
    if (schluessel !== geladenFuer || laedt) void allesLaden();
  });
})();
