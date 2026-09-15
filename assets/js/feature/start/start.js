/* ══════════════════════════════════════════════════════════════════
   Der private Start — Profil, Bereiche, Projekte, Einstellungen.

   Bis v.35.10.0 stand das alles als Inline-Modul in index.html: 1526
   Zeilen in einer Datei von 108 kB. Das ist der Grund, warum die
   Startseite als einzige nie auf das Kit umgestellt wurde — man
   fasste sie nicht an, ohne alles andere mit anzufassen.

   Der Umzug selbst hat nichts umgeschrieben. Nur die Einrueckung ist
   weg und die Importpfade sind angepasst: ein Inline-Modul loest
   relativ zum DOKUMENT auf, eine Datei relativ zu sich selbst.
   ══════════════════════════════════════════════════════════════════ */

import {
  auth, db, requireAuth, wireOfflineBanner, escHtml,
  MODULES, CORE_MODULE_KEYS, allowedModules, enabledModules, getProfile, sharesForEmail,
  projekteReparatur, istTvza, imKreis,
  sharesByOwner, reportClientError
} from '../../firebase-config.js';

/* tOr und nicht t() mit ??: t() gibt bei unbekanntem Schluessel den
   SCHLUESSEL zurueck, nie undefined. Solange der Katalog laedt, bleibt
   es deutsch. */
/* Ohne i18n.js fehlte hier das Einsetzen der Platzhalter: aus
   "{grund}" wurde kein Grund, sondern das Wort {grund} selbst. */
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
import {
  signOut, sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc, getDoc, getDocFromServer, setDoc, collection, addDoc, onSnapshot, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, where, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ICONS, icon } from '../../shell.js?v=25';
import { initialsOf } from '../../nav.js?v=25';
import { frage, meldung } from '../../dialog.js';
import { gemerktEinloesen, einladungsLink, kreisEinladungsText, codeZeigen } from '../../einladung.js';
import { meineGruppen, leitet, kontakte } from '../../groups.js';
import { beobachteUnterhaltungen } from '../../chat-stand.js';
import { ungelesenGesamt } from '../../chat-modell.js';
import { nameAus } from '../../bekannte.js';

/* Modulschlüssel → Bereichsfarbe. Wie in nav.js ausgeschrieben,
   weil die beiden nicht deckungsgleich sind. */
const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura', admin: 'admin',
  training: 'training',
};
const PERSON_AVATAR_COLORS = [
  ['#dcecff','#174a88'], ['#e4f4e8','#27613b'], ['#f4e5ff','#63358a'],
  ['#fff0d7','#7b4c10'], ['#ffe2e8','#85334b'], ['#dff5f3','#17635d']
];
function personAvatarStyle(identity) {
  const hash = [...String(identity||'')].reduce((sum,char)=>sum+char.charCodeAt(0),0);
  const [background, ink] = PERSON_AVATAR_COLORS[hash % PERSON_AVATAR_COLORS.length];
  return `--tint:${background};--deep:${ink}`;
}

wireOfflineBanner();

// Theme-Umschalter wird automatisch von theme.js verkabelt (#themeToggle).

// Nicht angemeldet → öffentliche Seite zuerst (Login erst danach).
/* Die Wurzel schickt Abgemeldete auf die Willkommen-Seite und
   nicht ins Anmeldeformular: wer hier zum ersten Mal landet, weiss
   noch gar nicht, wofuer er sich anmelden soll. Von dort geht es
   weiter zu login.html — und nie zu public.html, das bleibt ein
   Link, den man verschickt. */
/* Ein Einladungslink (?k=) merkt requireAuth selbst und schickt dann
   zum Registrieren statt auf Willkommen (firebase-config.js). */
const user = await requireAuth('willkommen.html');
if (sessionStorage.getItem('tvza-send-verification') === '1') {
  sessionStorage.removeItem('tvza-send-verification');
  if (!user.emailVerified) {
    void sendEmailVerification(user, {
      url: new URL('login.html?verified=1', location.href).href
    }).catch(() => {});
  }
}

const svgIcon = paths => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON_LOCK   = svgIcon('<path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z"/><path d="M7 11V7a5 5 0 0110 0v4"/>');
const ICON_GLOBE  = svgIcon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>');
const ICON_PENCIL = svgIcon('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const ICON_CLOSE  = svgIcon('<path d="M18 6L6 18M6 6l12 12"/>');

// ── Profile & Module ──────────────────────────
let profile = await getProfile(user);

// Selbstheilung: Vor v.29.8.0 konnte die Gast-Seite ein echtes
// Familienkonto zusätzlich als Gast markieren. Ein vorhandenes
// users/{uid}-Profil beweist die Mitgliedschaft; der falsche Gast-Eintrag
// darf dann laut Regeln entfernt werden.
if (Object.keys(profile).length) {
  try {
    const guest = await getDoc(doc(db, 'guestProfiles', user.uid));
    if (guest.exists()) await deleteDoc(guest.ref);
  } catch (e) { reportClientError('guest-self-heal', e); }
}
/* Die Projekte, die ein Fehler von v.35.3.0 ausgeblendet hat — siehe
   projekteReparatur in firebase-config.js. Scheitert das Schreiben,
   gilt die Reparatur trotzdem fuer diese Sitzung; beim naechsten
   Laden wird es erneut versucht. */
{
  const repariert = projekteReparatur(profile);
  if (repariert) {
    profile = { ...profile, modules: repariert };
    setDoc(doc(db, 'users', user.uid), { modules: repariert }, { merge: true })
      .catch(e => reportClientError('projekte-reparatur', e));
  }
}

if (!Object.keys(profile).length) {
  await signOut(auth).catch(() => {});
  window.location.replace('login.html?reason=membership');
  // Stop this module while navigation completes; otherwise restricted
  // queries below would flash an empty dashboard.
  await new Promise(() => {});
}

/* Wartet ein Code (vom Link, vielleicht von vor dem Konto), jetzt
   beitreten und hin — über den Router, sobald die Leiste steht. */
/* Nur oben — ein vorgeladener Start im Rahmen des Routers löst nichts
   ein, sonst träten zwei Dokumente zugleich bei. */
if (window.parent === window) void (async () => {
  const beitritt = await gemerktEinloesen(user.uid);
  if (!beitritt) return;
  if (beitritt.fehler) {
    await meldung({ titel: t('grp.f.beitritt', 'Der Beitritt hat nicht geklappt.'), text: beitritt.fehler });
    return;
  }
  /* In den TVZA-Kreis (v.35.56.0): neu laden — Zeichen, Bereiche und
     der persönliche Assistent kommen mit dem Profil. */
  if (beitritt.kreis) {
    if (!beitritt.schon) location.reload();
    return;
  }
  const ziel = new URL('pages/gruppe.html', location.href).href;
  for (let i = 0; i < 20 && !window.tvzaNavigate; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.tvzaNavigate?.(ziel)) location.href = ziel;
})();

const name = profile.displayName || 'du';
const ownerName = profile.displayName || '';
document.getElementById('userName').textContent = name;
// Avatar initials (§5.1) — replaces the .user-chip that spelled the
// whole name out beside an arrow.
document.getElementById('userInitials').textContent = initialsOf(profile.displayName);
try { localStorage.setItem('tvza-name', profile.displayName || ''); } catch (e) {}
try { window.dispatchEvent(new CustomEvent('tvza-name', { detail: profile.displayName || '' })); } catch (e) {}
let appUsers = [];
let appUsersLoaded = false;
/* 'tvza' ist der persönliche Teil (v.35.35.0). storedOrder nimmt einen
   neuen Abschnitt in eine gespeicherte Reihenfolge auf, ohne sie zu
   verwerfen.

   Für den TVZA-Kreis ist Start TVZA (v.35.48.0): zuerst das Eigene,
   dann das Geteilte, und die Firn-Bereiche unten, mit dem Zeichen Firn
   darüber. Wer eine Reihenfolge gespeichert hat, behält sie. */
const kreis = imKreis(profile);
const overviewSectionDefaults = kreis
  ? ['tvza', 'projects', 'shared', 'tracker']
  : ['tracker', 'shared', 'tvza', 'projects'];
document.getElementById('firnMarke').hidden = !kreis;
const trackerTileDefaults = ['ski', 'food', 'watch', 'weather', 'dm', 'trip', 'matura', 'maturatracker', 'training'];
const quickAccessExcluded = new Set(['dm', 'watch', 'trip']);
let reorderEditing = false;

function storedOrder(key, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    const valid = Array.isArray(saved) ? saved.filter(id => defaults.includes(id)) : [];
    return [...new Set([...valid, ...defaults])];
  } catch (e) {
    localStorage.removeItem(key);
    return defaults;
  }
}

const overviewOrderKey = `tvza.overviewOrder.${user.uid}`;
const collapsedSectionsKey = `tvza.collapsedSections.${user.uid}`;
const trackerOrderKey = `tvza.trackerTileOrder.${user.uid}`;
let overviewSectionOrder = storedOrder(overviewOrderKey, overviewSectionDefaults);
let trackerTileOrder = storedOrder(trackerOrderKey, trackerTileDefaults);
let collapsedSections = new Set();
try {
  collapsedSections = new Set(JSON.parse(localStorage.getItem(collapsedSectionsKey) || '[]'));
} catch (e) {
  localStorage.removeItem(collapsedSectionsKey);
}

function saveOverviewState() {
  localStorage.setItem(overviewOrderKey, JSON.stringify(overviewSectionOrder));
  localStorage.setItem(collapsedSectionsKey, JSON.stringify([...collapsedSections]));
}

function saveTrackerOrder() {
  localStorage.setItem(trackerOrderKey, JSON.stringify(trackerTileOrder));
}

function applyOverviewLayout() {
  const main = document.querySelector('.main');
  overviewSectionOrder.forEach(id => {
    const section = document.querySelector(`[data-overview-section="${id}"]`);
    if (section) main.appendChild(section);
  });
  document.querySelectorAll('[data-overview-section]').forEach(section => {
    const id = section.dataset.overviewSection;
    const collapsed = collapsedSections.has(id);
    section.classList.toggle('section--collapsed', collapsed);
    section.querySelector('[data-section-toggle]')?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

function setTrackerTile(key, enabled) {
  const tile = document.querySelector(`[data-tracker-tile="${key}"]`);
  const link = tile?.querySelector('.row');
  if (!tile || !link) return;
  /* Ob das Modul an ist, steht am Element; sichtbar machen tut es
     zeigeBereiche(). So streiten die beiden nie um display. */
  tile.dataset.enabled = enabled ? '1' : '0';
  tile.hidden = !enabled;
  link.hidden = !enabled;
}

/* Eine Reihenfolge über alle Kacheln, aber zwei Raster: jede Kachel geht
   in ihren Teil — Firn oder TVZA. Ziehen ordnet nur innerhalb des
   eigenen Rasters um, eine Kachel wandert also nie hinüber. */
function applyTrackerTileOrder() {
  const firn = document.getElementById('trackerGrid');
  const tvza = document.getElementById('tvzaGrid');
  trackerTileOrder.forEach(id => {
    const tile = document.querySelector(`[data-tracker-tile="${id}"]`);
    if (tile) (istTvza(id) && tvza ? tvza : firn).appendChild(tile);
  });
}

/* Jeder eingeschaltete Bereich steht in der Liste.
 *
 * Frueher waren es die ersten VIER, und "der Rest" sollte im
 * Bereiche-Tab wohnen. Den Tab gibt es seit v.33 nicht mehr, und
 * pages/bereiche.html verlinkt niemand — fuenf eingeschaltete Module
 * waren damit von Start aus schlicht nicht erreichbar. Eine Liste
 * traegt alle, also faellt die Begrenzung weg.
 *
 * quickAccessExcluded bleibt: Kalender und Nachrichten haben eigene
 * Tabs, und "eine Sache, ein Ort" (§6.4) gilt weiter. */
function zeigeBereiche() {
  const tiles = [...document.querySelectorAll('[data-tracker-tile]')];
  tiles.forEach(tile => {
    const sichtbar = tile.dataset.enabled === '1' &&
      !quickAccessExcluded.has(tile.dataset.trackerTile);
    tile.hidden = !sichtbar;
    tile.setAttribute('aria-hidden', sichtbar ? 'false' : 'true');
    const link = tile.querySelector('.row');
    if (link) link.hidden = !sichtbar;
  });
  /* Der TVZA-Teil steht nur da, wenn darin etwas an ist — für ein Konto
     ohne persönliche Bereiche gibt es ihn nicht. Der Hinweis "noch kein
     Bereich" gilt den Firn-Bereichen. */
  const sichtbare = tiles.filter(tile => !tile.hidden);
  const tvza = document.getElementById('tvzaSection');
  if (tvza) tvza.hidden = !sichtbare.some(tile => istTvza(tile.dataset.trackerTile));
  document.getElementById('noModulesHint').hidden =
    sichtbare.some(tile => !istTvza(tile.dataset.trackerTile));
}

const h = new Date().getHours();
const g = h>=5&&h<12 ? 'Guten Morgen' : h>=12&&h<18 ? 'Guten Tag' : h>=18 ? 'Guten Abend' : 'Gute Nacht';
/* Der Vorname: mit dem ganzen Namen war der Gruss am Handy abgeschnitten
   ("Guten Abend, Michel van Zant…"). Der ganze Name steht im Konto-Menü. */
const vorname = String(profile.displayName || '').trim().split(/\s+/)[0] || name;
document.getElementById('greetingText').textContent = `${g}, ${vorname}`;
document.getElementById('greetingDate').textContent =
  new Date().toLocaleDateString('de-CH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

function applyModules() {
  const mods = enabledModules(profile);
  setTrackerTile('ski', mods.ski);
  setTrackerTile('food', mods.food);
  setTrackerTile('watch', mods.watch);
  setTrackerTile('weather', mods.weather);
  setTrackerTile('dm', mods.dm);
  setTrackerTile('trip', mods.trip);
  setTrackerTile('matura', mods.matura);
  setTrackerTile('maturatracker', mods.maturatracker);
  setTrackerTile('training', mods.training);
  document.getElementById('projectsSection').style.display = mods.projects ? '' : 'none';
  // The chip may not have registered yet — it is a module too, and
  // module order is document order. Record the wanted state either
  // way; whichever runs second applies it.
  window.tvzaWeatherWanted = !!mods.weather;
  if (window.tvzaWeatherChip) window.tvzaWeatherChip.setVisible(!!mods.weather);
  if (mods.dm) startDmBadge(); else stopDmBadge();
  applyTrackerTileOrder();
  zeigeBereiche();
  applyOverviewLayout();
}

/* ════ DM unread badge (live) ════ */
let dmUnsub = null, dmPrevTotal = null;
function startDmBadge() {
  if (dmUnsub) return;
  /* Dieselbe Zahl wie am Tab (chat-stand.js, v.35.61.0): stumme Chats
     zählen nicht, die Chats der Gruppen schon. */
  dmUnsub = beobachteUnterhaltungen(user.uid, liste => {
    const total = ungelesenGesamt(liste);
    const badge = document.getElementById('dmTileBadge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = total > 0 ? '' : 'none';
    }
    // Foreground ping when new messages arrive (skip the first snapshot).
    if (dmPrevTotal != null && total > dmPrevTotal && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('💬 Neue Nachricht', { body: 'Du hast neue Nachrichten in Firn.', icon: 'assets/icons/firn-192.png', tag: 'firn-dm' }); } catch (e) {}
    }
    dmPrevTotal = total;
  });
}
function stopDmBadge() {
  if (dmUnsub) { dmUnsub(); dmUnsub = null; }
  dmPrevTotal = null;
  const badge = document.getElementById('dmTileBadge');
  if (badge) badge.style.display = 'none';
}

applyModules();

document.querySelectorAll('[data-section-toggle]').forEach(btn => btn.addEventListener('click', () => {
  const id = btn.dataset.sectionToggle;
  if (collapsedSections.has(id)) collapsedSections.delete(id);
  else collapsedSections.add(id);
  saveOverviewState();
  applyOverviewLayout();
}));

/* ════ Reorder engine — Edit-Modus ("Anordnen") ════
   Reordering is only active while in edit mode, so normal taps
   open tiles and swipes scroll the page. Inside edit mode a lifted
   clone follows the finger and the remaining items glide into their
   new spots (FLIP) instead of jumping. */
const sortables = [];
let drag = null;   // active drag
let cand = null;   // press, before threshold
let suppressClick = false;

function registerSortable(cfg) { sortables.push(cfg); }  // { itemSelector, grid, commit }

function depth(node) { let d = 0; while (node) { d++; node = node.parentElement; } return d; }

function matchSortable(el) {
  let best = null;
  for (const cfg of sortables) {
    const item = el.closest(cfg.itemSelector);
    if (item && (!best || depth(item) > depth(best.item))) best = { cfg, item };
  }
  return best;  // innermost wins (tile beats its section)
}

// FLIP: smoothly animate siblings from their old to new positions.
function reorderFlip(container, itemSelector, action) {
  const items = [...container.querySelectorAll(itemSelector)];
  const first = new Map();
  items.forEach(t => first.set(t, t.getBoundingClientRect()));
  action();
  items.forEach(t => {
    const f = first.get(t); if (!f) return;
    const l = t.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (dx || dy) {
      t.style.transition = 'none';
      t.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        t.style.transition = 'transform 0.23s cubic-bezier(0.2,0.85,0.25,1)';
        t.style.transform = '';
      });
    }
  });
}

function startDrag(c, px, py) {
  cand = null;
  const item = c.item;
  const rect = item.getBoundingClientRect();
  const clone = item.cloneNode(true);
  clone.classList.add('reorder-clone');
  clone.removeAttribute('id');
  Object.assign(clone.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px', margin: '0',
    zIndex: '1000', pointerEvents: 'none'
  });
  document.body.appendChild(clone);
  item.classList.add('reorder-placeholder');
  drag = {
    cfg: c.cfg, item, clone, container: item.parentNode,
    pointerId: c.pointerId, ox: px - rect.left, oy: py - rect.top,
    px, py
  };
  moveDrag(px, py);
  startAutoScroll();
}

function moveDrag(px, py) {
  drag.px = px; drag.py = py;
  drag.clone.style.left = (px - drag.ox) + 'px';
  drag.clone.style.top = (py - drag.oy) + 'px';
  reorderTarget(px, py);
}

// Auto-scroll the page when the dragged item nears the top/bottom edge —
// so you can move a tile or whole section across a long page without lifting.
let autoScrollRAF = null;
function startAutoScroll() {
  if (autoScrollRAF) return;
  const EDGE = 90, MAX = 16;
  const step = () => {
    if (!drag) { autoScrollRAF = null; return; }
    const h = window.innerHeight;
    let dy = 0;
    if (drag.py < EDGE) dy = -MAX * (1 - drag.py / EDGE);
    else if (drag.py > h - EDGE) dy = MAX * (1 - (h - drag.py) / EDGE);
    if (dy) {
      const before = window.scrollY;
      window.scrollBy(0, dy);
      // if the page actually moved, the finger now hovers new content → re-evaluate
      if (window.scrollY !== before) reorderTarget(drag.px, drag.py);
    }
    autoScrollRAF = requestAnimationFrame(step);
  };
  autoScrollRAF = requestAnimationFrame(step);
}
function stopAutoScroll() {
  if (autoScrollRAF) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
}

function reorderTarget(px, py) {
  const dragging = drag.item, cfg = drag.cfg, container = drag.container;
  const pr = dragging.getBoundingClientRect();
  if (px >= pr.left && px <= pr.right && py >= pr.top && py <= pr.bottom) return; // over the gap → hold
  const items = [...container.querySelectorAll(cfg.itemSelector)]
    .filter(t => t !== dragging && t.offsetParent !== null);
  let target = null;
  for (const t of items) {
    const r = t.getBoundingClientRect();
    if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) { target = t; break; }
  }
  if (!target) {
    let best = Infinity;
    for (const t of items) {
      const r = t.getBoundingClientRect();
      const dd = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
      if (dd < best) { best = dd; target = t; }
    }
  }
  if (!target) return;
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let before;
  if (cfg.grid) {
    const my = r.height * 0.22, mx = r.width * 0.22; // dead-zone to stop flicker
    if (py < cy - my) before = true;
    else if (py > cy + my) before = false;
    else if (px < cx - mx) before = true;
    else if (px > cx + mx) before = false;
    else return;
  } else {
    const my = r.height * 0.30;
    if (py < cy - my) before = true;
    else if (py > cy + my) before = false;
    else return;
  }
  if (before && target.previousElementSibling === dragging) return;
  if (!before && target.nextElementSibling === dragging) return;
  reorderFlip(container, cfg.itemSelector,
    () => container.insertBefore(dragging, before ? target : target.nextSibling));
}

function endDrag() {
  stopAutoScroll();
  const d = drag; drag = null;
  const item = d.item;
  const rect = item.getBoundingClientRect();
  d.clone.classList.add('reorder-clone--landing');
  d.clone.style.transition = 'left 0.22s cubic-bezier(0.2,0.85,0.25,1), top 0.22s cubic-bezier(0.2,0.85,0.25,1), transform 0.22s ease';
  d.clone.style.transform = 'none';
  d.clone.style.left = rect.left + 'px';
  d.clone.style.top = rect.top + 'px';
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  setTimeout(() => {
    d.clone.remove();
    item.classList.remove('reorder-placeholder');
    try { d.cfg.commit(); } catch (e) { reportClientError('reorder', e); }
  }, 230);
}

window.addEventListener('pointerdown', e => {
  if (!reorderEditing || drag || cand) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const m = matchSortable(e.target);
  if (!m) return;
  e.preventDefault();
  cand = { ...m, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
});

window.addEventListener('pointermove', e => {
  if (drag) {
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
    return;
  }
  if (!cand || e.pointerId !== cand.pointerId) return;
  if (Math.hypot(e.clientX - cand.x0, e.clientY - cand.y0) > 6) {
    e.preventDefault();
    startDrag(cand, e.clientX, e.clientY);
  }
}, { passive: false });

function releasePointer(e) {
  if (drag && e.pointerId === drag.pointerId) { endDrag(); return; }
  if (cand && e.pointerId === cand.pointerId) cand = null;
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

// Block link/button activation while sorting (and the click right after a drop).
document.addEventListener('click', e => {
  if (!reorderEditing && !suppressClick) return;
  const inItem = sortables.some(cfg => e.target.closest(cfg.itemSelector));
  if (!inItem) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

// ── Edit-mode toggle ──
const editModeBtn = document.getElementById('editModeBtn');
const reorderHint = document.getElementById('reorderHint');
function setReorderEditing(on) {
  reorderEditing = on;
  document.body.classList.toggle('reorder-editing', on);
  editModeBtn.classList.toggle('active', on);
  editModeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  editModeBtn.querySelector('.edit-label').textContent = on ? 'Fertig' : 'Anordnen';
  if (!on && drag) endDrag();
  /* Beim Anordnen aendert sich nichts an der Sichtbarkeit mehr — es
     stehen ohnehin alle in der Liste. Neu gezeichnet wird trotzdem,
     damit eine gerade eingeschaltete Zeile sofort erscheint. */
  zeigeBereiche();
}
editModeBtn.addEventListener('click', () => setReorderEditing(!reorderEditing));
document.getElementById('reorderHintDone').addEventListener('click', () => setReorderEditing(false));
// Native HTML5 drag is no longer used — stop ghost-drag on the handles.
document.querySelectorAll('[draggable="true"]').forEach(el => { el.draggable = false; });

registerSortable({
  itemSelector: '[data-tracker-tile]',
  grid: true,
  commit() {
    trackerTileOrder = [...document.querySelectorAll('[data-tracker-tile]')]
      .map(tile => tile.dataset.trackerTile);
    saveTrackerOrder();
  }
});

registerSortable({
  itemSelector: '[data-overview-section]',
  commit() {
    overviewSectionOrder = [...document.querySelectorAll('[data-overview-section]')]
      .map(section => section.dataset.overviewSection);
    saveOverviewState();
  }
});

// ── Konto-Menü (Einstellungen + Abmelden) ─────
const acct = document.getElementById('acct');
const acctMenu = document.getElementById('acctMenu');
const acctToggle = document.getElementById('userChip');

function closeAcct() {
  acctMenu.hidden = true;
  acctToggle.setAttribute('aria-expanded', 'false');
}
function openAcct() {
  document.getElementById('acctWho').textContent = name || 'Konto';
  document.getElementById('acctMail').textContent = user.email || '';
  acctMenu.hidden = false;
  acctToggle.setAttribute('aria-expanded', 'true');
}
acctToggle.addEventListener('click', e => {
  e.stopPropagation();
  acctMenu.hidden ? openAcct() : closeAcct();
});
// Klick daneben und Escape schliessen das Menü.
document.addEventListener('click', e => { if (!acct.contains(e.target)) closeAcct(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAcct(); });

document.getElementById('acctLogout').addEventListener('click', async () => {
  closeAcct();
  if (await frage({
    titel: t('acct.abmeldenFrage', 'Abmelden?'),
    ja: t('acct.abmelden', 'Abmelden'),
  })) {
    try { localStorage.removeItem('tvza-name'); } catch (e) {}
    await signOut(auth);
    window.location.href = 'login.html';
  }
});

// ── Config: Timos UID (für Legacy-Elternansicht) ──
let timoUid = '';
if (profile.isTimo === true) {
  const configRef = doc(db, 'config', 'tvza');
  const configSnap = await getDoc(configRef).catch(() => null);
  const configPatch = { timoUid: user.uid };
  // Beta default: optional verification reduces testing friction. Preserve
  // any explicit admin choice once the flag exists.
  if (!configSnap?.exists() || typeof configSnap.data().requireEmailVerification !== 'boolean') {
    configPatch.requireEmailVerification = false;
  }
  await setDoc(configRef, configPatch, { merge: true })
    .catch(error => reportClientError('admin-config-save', error));
  timoUid = user.uid;
} else if (profile.isParent === true) {
  try { const cfg = await getDoc(doc(db, 'config', 'tvza')); if (cfg.exists()) timoUid = cfg.data().timoUid || ''; } catch (e) {}
}

/* ════ Einstellungen / Module ════════════════ */
const settingsModal = document.getElementById('settingsModal');
const embeddedSettings = window.parent !== window &&
  new URLSearchParams(location.search).get('embed') === 'settings';
const embeddedAdmin = window.parent !== window &&
  new URLSearchParams(location.search).get('embed') === 'admin';
const tellSettingsParent = message => {
  if (embeddedSettings) {
    window.parent.postMessage(message, location.origin === 'null' ? '*' : location.origin);
  }
};
if (embeddedSettings) {
  window.addEventListener('tvza-theme-change', event => {
    tellSettingsParent({ type:'tvza-settings-theme', mode:event.detail?.mode || 'auto' });
  });
}

/* ── Sprache ──────────────────────────────────────────────────
   Die Liste kommt aus i18n.js, damit es genau eine Stelle gibt, an
   der eine neue Sprache eingetragen wird. Ohne eigene Wahl steht
   "Systemsprache" oben und die App folgt dem Geraet. */
const languageSelect = document.getElementById('settingsLanguage');
if (languageSelect && window.TVZAI18n) {
  const i18n = window.TVZAI18n;
  /* tOr und nicht t(): beim ersten Füllen ist der Katalog noch nicht da,
     und t() gäbe den Schlüssel zurück — bis v.35.44.0 stand in der Auswahl
     "lang.system" (Falle 5). Wenn der Katalog kommt, wird neu gefüllt. */
  const fillLanguages = () => {
    const current = i18n.hasStoredChoice() ? i18n.lang : '';
    languageSelect.innerHTML =
      `<option value="">${escHtml(i18n.tOr('lang.system', 'Systemsprache'))}</option>` +
      i18n.LANGUAGES.map(l => `<option value="${l.id}">${l.native}</option>`).join('');
    languageSelect.value = current;
  };
  fillLanguages();
  i18n.ready?.then(fillLanguages, () => {});
  window.addEventListener('tvza-lang-change', fillLanguages);

  languageSelect.addEventListener('change', async () => {
    const chosen = languageSelect.value || i18n.systemLanguage();
    if (!languageSelect.value) {
      try { localStorage.removeItem('tvza-lang'); } catch {}
    }
    await i18n.setLanguage(chosen);
    if (!languageSelect.value) {
      try { localStorage.removeItem('tvza-lang'); } catch {}
    }
    tellSettingsParent({ type:'tvza-settings-lang', lang:languageSelect.value || '' });
    /* Ueber Geraete hinweg: still scheitern lassen, die App laeuft
       auch ohne — localStorage traegt die Wahl auf diesem Geraet. */
    try {
      const user = auth.currentUser;
      if (user) await setDoc(doc(db, 'users', user.uid), { lang: languageSelect.value || null }, { merge:true });
    } catch (error) { reportClientError('lang-save', error); }
  });
}
/* ── Erscheinungsbild ─────────────────────────────────────────
   Drei Knöpfe statt eines Symbols (◐), das man durchtippen musste, um zu
   erraten, was es tut (v.35.58.0). Gespeichert wie von theme.js; die
   Hülle hört über tvza-theme-change mit (tellSettingsParent oben). */
const themeWahl = document.getElementById('themeWahl');
if (themeWahl && window.TVZATheme) {
  const zeigen = () => {
    const modus = window.TVZATheme.getMode();
    themeWahl.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === modus)));
  };
  themeWahl.addEventListener('click', event => {
    const knopf = event.target.closest('[data-mode]');
    if (!knopf) return;
    try { localStorage.setItem('tvza-theme', knopf.dataset.mode); } catch {}
    window.TVZATheme.applyTheme(knopf.dataset.mode);
  });
  window.addEventListener('tvza-theme-change', zeigen);
  zeigen();
}

/* "Deine Gruppen" (v.35.60.0): je Gruppe, die man leitet, eine Zeile in
   ihre Einstellungen (gruppe.html?g=…&einst=1). Die Einstellungen stehen
   meist als Ebene über einer anderen Seite — dann führt die Ebene hin
   (tvza-settings-gehe), sonst die Seite selbst. */
async function renderGruppenEinst() {
  const teil = document.getElementById('gruppenEinstSection');
  const liste = document.getElementById('gruppenEinstListe');
  if (!teil || !liste || !user) return;
  let geleitet = [];
  try { geleitet = (await meineGruppen(user.uid)).filter(g => leitet(g.meineRolle)); }
  catch (error) { reportClientError('settings-gruppen', error); }
  teil.hidden = !geleitet.length;
  liste.innerHTML = geleitet.map(g => `
    <button class="settings-row settings-row--link" type="button" data-gruppe-einst="${escHtml(g.id)}">
      <span class="settings-row-label">${escHtml(g.name || t('nav.gruppe', 'Gruppe'))}</span>
      <span class="settings-row-mehr">${escHtml(t('grp.einst', 'Einstellungen der Gruppe'))}
        <svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></span>
    </button>`).join('');
}
document.getElementById('gruppenEinstListe')?.addEventListener('click', event => {
  const zeile = event.target.closest('[data-gruppe-einst]');
  if (!zeile) return;
  const ziel = new URL(`pages/gruppe.html?g=${encodeURIComponent(zeile.dataset.gruppeEinst)}&einst=1`, location.href).href;
  if (embeddedSettings) { tellSettingsParent({ type:'tvza-settings-gehe', url:ziel }); return; }
  closeSettings();
  if (!window.tvzaNavigate?.(ziel)) location.href = ziel;
});

function closeSettings() {
  settingsModal.classList.remove('visible');
  tellSettingsParent({ type:'tvza-settings-close' });
}
function focusSettingsSection(section) {
  if (!section) return;
  const target = settingsModal.querySelector(`[data-settings-section="${CSS.escape(section)}"]`);
  if (!target || target.hidden) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ block:'start', behavior:'smooth' });
    target.classList.add('settings-section--focused');
    setTimeout(() => target.classList.remove('settings-section--focused'), 1200);
  });
}
function openSettings(section = '') {
  renderModuleToggles();
  renderGruppenEinst();
  loadBereichSettings();
  renderShareModuleOptions();
  renderMyShares();
  document.getElementById('adminSection').style.display = 'none';
  settingsModal.classList.add('visible');
  focusSettingsSection(section);
  renderShareTargets();
}
const adminHealthData = {
  gruppen:'checking',
  invites:'checking',
  users:'checking',
  food:'checking',
  inviteCount:0,
  foodCount:0,
};
function resetAdminHealth() {
  adminHealthData.gruppen = 'checking';
  adminHealthData.invites = 'checking';
  adminHealthData.users = 'checking';
  adminHealthData.food = 'checking';
  adminHealthData.inviteCount = 0;
  adminHealthData.foodCount = 0;
  renderAdminHealth();
}
function renderAdminHealth() {
  const state = document.getElementById('adminHealthState');
  const checks = document.getElementById('adminHealthChecks');
  const alerts = document.getElementById('adminHealthAlerts');
  if (!state || !checks || !alerts) return;
  const secureTransport = location.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(location.hostname);
  const isOnline = navigator.onLine;
  const componentStates = [
    adminHealthData.gruppen,
    adminHealthData.invites,
    adminHealthData.users,
    adminHealthData.food,
  ];
  const hasError = componentStates.includes('error');
  const isChecking = componentStates.includes('checking');
  const statusItems = [
    {
      label: secureTransport ? 'Verbindung verschlüsselt' : 'Verbindung nicht verschlüsselt',
      kind: secureTransport ? 'ok' : 'error',
    },
    {
      label: profile.isTimo === true ? 'Adminzugriff bestätigt' : 'Adminzugriff fehlt',
      kind: profile.isTimo === true ? 'ok' : 'error',
    },
    {
      label: isChecking ? 'Daten werden geprüft' : hasError ? 'Prüfung unvollständig' : 'Daten erfolgreich geprüft',
      kind: isChecking ? 'checking' : hasError ? 'error' : 'ok',
    },
  ];
  checks.innerHTML = statusItems.map(item => `
    <span class="admin-health-check is-${item.kind}">
      <span aria-hidden="true">${item.kind === 'ok' ? '✓' : item.kind === 'checking' ? '•' : '!'}</span>
      ${escHtml(item.label)}
    </span>`).join('');

  const messages = [];
  if (!isOnline) messages.push({ kind:'warning', text:'Keine Netzwerkverbindung. Änderungen werden erst nach der Verbindung synchronisiert.' });
  if (!secureTransport) messages.push({ kind:'error', text:'Die Verbindung ist nicht verschlüsselt. Keine Admin-Aktionen ausführen.' });
  if (hasError) messages.push({ kind:'error', text:'Mindestens ein Verwaltungsbereich konnte nicht vollständig geprüft werden. Seite neu laden und erneut kontrollieren.' });
  if (adminHealthData.foodCount > 0) {
    messages.push({
      kind:'warning',
      text:`${adminHealthData.foodCount} Food-${adminHealthData.foodCount === 1 ? 'Anfrage wartet' : 'Anfragen warten'} auf eine Prüfung.`,
    });
  }
  if (adminHealthData.inviteCount > 0) {
    messages.push({
      kind:'info',
      text:`${adminHealthData.inviteCount} offene ${adminHealthData.inviteCount === 1 ? 'Einladung' : 'Einladungen'}.`,
    });
  }
  if (!messages.length && !isChecking) {
    messages.push({ kind:'safe', text:'Keine aktiven Warnungen. Alle geprüften Bereiche sind in Ordnung.' });
  } else if (!messages.length) {
    messages.push({ kind:'info', text:'Die Verwaltungsdaten werden gerade geprüft.' });
  }
  alerts.innerHTML = messages.map(message => `
    <div class="admin-health-alert is-${message.kind}">
      <span class="admin-health-alert__mark" aria-hidden="true">${message.kind === 'safe' ? '✓' : message.kind === 'error' ? '!' : message.kind === 'warning' ? '!' : 'i'}</span>
      <span>${escHtml(message.text)}</span>
    </div>`).join('');

  const needsAction = !secureTransport || hasError || profile.isTimo !== true;
  const hasWarning = !isOnline || adminHealthData.foodCount > 0;
  state.dataset.state = needsAction ? 'error' : isChecking ? 'checking' : hasWarning ? 'warning' : 'safe';
  state.textContent = needsAction ? 'Handlung nötig' : isChecking ? 'Prüfung läuft' : hasWarning ? 'Bitte prüfen' : 'Geschützt';
}
function openAdmin() {
  document.querySelector('#settingsModal .modal-title').textContent = 'Admin';
  settingsModal.classList.add('visible');
  if (profile.isTimo !== true) {
    document.getElementById('adminSection').style.display = '';
    document.getElementById('adminSection').innerHTML =
      '<section class="settings-section"><p class="settings-section-title">Kein Zugriff</p><p class="form-hint">Dieser Bereich ist nur für Administratoren verfügbar.</p></section>';
    return;
  }
  resetAdminHealth();
  document.getElementById('adminSection').style.display = '';
  document.getElementById('memberInviteSection').style.display = '';
  document.getElementById('superAdminUserSection').style.display = '';
  document.getElementById('superAdminFoodSection').style.display = '';
  document.getElementById('superAdminKiSection').hidden = false;
  void renderAdminKiGruppen();
  document.getElementById('superAdminKreisSection').hidden = false;
  void renderKreisEinladungen();
  loadInviteGroups().then(renderMemberInvites);
  loadAppUsers().then(() => {
    renderAdminUsers();
    renderFoodRequests();
  });
}
document.getElementById('acctSettings').addEventListener('click', () => { closeAcct(); openSettings(); });
/* Hier stand bis v.35.44.0 ein Zuhörer auf #openSettingsLink — dem
   Einstellungs-Link des alten Startmenüs, das v.35.12.0 abgeschafft hat.
   Das Element gab es seitdem nicht mehr, die Zeile warf, und ALLES
   darunter lief nie: der Schliessknopf der Einstellungen, das Speichern
   der Modul-Schalter, Teilen, Einladungen, "Meine Projekte", der Service
   Worker. Kein Fehler war zu sehen ausser in der Konsole. Seit v.35.45.0
   prüft seiten-ids.test.mjs, dass jedes Element, das ein Modul ohne
   ?. anfasst, in seiner Seite steht. */
/* "Bereiche verwalten" im Bereiche-Tab springt hierher zurück. Ohne
   diese Zeile passierte nach dem Sprung schlicht nichts. */
if (location.hash === '#settings') {
  history.replaceState(null, '', location.pathname + location.search);
  openSettings(new URLSearchParams(location.search).get('section') || '');
}
if (location.hash === '#admin' && embeddedAdmin) {
  history.replaceState(null, '', location.pathname + location.search);
  queueMicrotask(openAdmin);
}
if (embeddedSettings) {
  window.addEventListener('message', event => {
    if (location.origin !== 'null' && event.origin !== location.origin) return;
    if (event.data?.type === 'tvza-settings-section') openSettings(event.data.section || '');
  });
}
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

async function loadAppUsers(force = false) {
  if (appUsersLoaded && !force) {
    adminHealthData.users = 'ok';
    renderAdminHealth();
    return appUsers;
  }
  try {
    const qs = await getDocs(collection(db, 'users'));
    appUsers = qs.docs.map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.email)
      .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), 'de-CH'));
    appUsersLoaded = true;
    adminHealthData.users = 'ok';
  } catch (e) {
    reportClientError('users-load', e);
    appUsers = [];
    adminHealthData.users = 'error';
  }
  renderAdminHealth();
  return appUsers;
}

/* Teilen mit wem? Bis v.35.46.0 lud hier JEDES Konto alle Profile der
   App und bot sie mit E-Mail als Vorschlag an ("Name <adresse>"). Jetzt
   stehen zur Wahl die Leute aus den eigenen Gruppen, nur mit Namen; wer
   denselben Namen trägt, bekommt seine Gruppe dazu. Nur der Admin sieht
   alle — er darf die Profile ohnehin lesen. */
let shareTargets = [];
async function loadShareTargets() {
  try {
    if (profile.isTimo === true) {
      await loadAppUsers();
      shareTargets = appUsers.filter(u => u.uid !== user.uid)
        .map(u => ({ uid: u.uid, name: nameAus(u) || u.email, gruppen: [] }));
    } else {
      shareTargets = await kontakte(user.uid, { kreis: imKreis(profile) });
    }
  } catch (e) {
    reportClientError('share-targets', e);
    shareTargets = [];
  }
  return shareTargets;
}

async function renderShareTargets() {
  const sel = document.getElementById('shareUser');
  await loadShareTargets();
  const gleichnamig = name => shareTargets.filter(b => b.name === name).length > 1;
  sel.innerHTML = `<option value="">${shareTargets.length ? 'Person wählen' : 'Noch niemand aus deinen Gruppen'}</option>`
    + shareTargets.map(b => {
      const zusatz = gleichnamig(b.name) && b.gruppen.length ? ` · ${b.gruppen.join(', ')}` : '';
      return `<option value="${escHtml(b.uid)}">${escHtml(b.name + zusatz)}</option>`;
    }).join('');
}

function renderModuleToggles() {
  const allowed = allowedModules(profile);
  const mods = enabledModules(profile);
  const availableModules = Object.values(MODULES)
    .filter(m => m.key !== 'admin' && !CORE_MODULE_KEYS.includes(m.key) && allowed[m.key]);
  if (!availableModules.length) {
    document.getElementById('moduleToggles').innerHTML = '<p class="form-hint">Noch keine Module freigeschaltet.</p>';
    return;
  }
  const zeile = m => `
    <label class="row row--check${mods[m.key] ? ' is-checked' : ''}" data-bereich="${BEREICH_OF[m.key] || ''}">
      <span class="row__icon">${icon(ICONS[m.key] ? m.key : 'bereiche', 18)}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(m.name)}</span>
        <span class="row__sub">${escHtml(m.sub)}</span>
      </span>
      <span class="row__end">
        <span class="module-toggle-state">${mods[m.key] ? 'Sichtbar' : 'Ausgeblendet'}</span>
        <input type="checkbox" data-mod="${m.key}" ${mods[m.key] ? 'checked' : ''} />
      </span>
    </label>`;
  /* Zwei Gruppen, wie auf Start: die Firn-Bereiche und der persönliche
     TVZA-Teil. Eine Gruppe ohne freigegebenen Bereich erscheint nicht. */
  const firn = availableModules.filter(m => !istTvza(m.key));
  const tvza = availableModules.filter(m => istTvza(m.key));
  document.getElementById('moduleToggles').innerHTML = [
    firn.length ? `<div class="marke">${escHtml(t('set.firnBereiche', 'Firn'))}</div>${firn.map(zeile).join('')}` : '',
    tvza.length ? `<div class="marke marke--tvza"><span class="tvza-marke">TVZA</span> ${escHtml(t('home.persoenlich', 'Persönlich'))}</div>${tvza.map(zeile).join('')}` : '',
  ].join('');
}

let modulesSaveQueue = Promise.resolve();
let modulesSaveVersion = 0;
/* Gespeichert wird NUR der Schalter, der sich bewegt hat.
   Bis v.35.22.0 stand hier der Zustand ALLER Schalter — auch die
   Vorgaben, die niemand angefasst hatte. Damit fror jede Vorgabe im
   Profil ein, und als Projekte am 3. September fuer ein paar Stunden
   per Vorgabe aus war, blieb es fuer immer aus. Ein gespeicherter Wert
   ist eine Entscheidung; eine Vorgabe ist keine.

   Das Profil wird sofort nachgezogen und nicht erst nach dem Speichern:
   wer zwei Schalter schnell hintereinander umlegt, wuerde sonst beim
   zweiten den ersten verlieren. Scheitert es, geht der Schalter zurueck. */
function savePersonalModules(key, an) {
  const vorher = profile.modules || {};
  const modules = { ...vorher, [key]: an };
  profile = { ...profile, modules };
  const version = ++modulesSaveVersion;
  const status = document.getElementById('modulesSaveStatus');
  /* Erst beim ersten Speichern sichtbar — vorher stand "Gespeichert" da,
     bevor man etwas geändert hatte. Ohne data-i18n: den Zustand kennt nur
     der Code (Falle 5). */
  status.hidden = false;
  status.dataset.state = 'saving';
  status.textContent = 'Speichert';
  modulesSaveQueue = modulesSaveQueue.then(async () => {
    try {
      await setDoc(doc(db, 'users', user.uid), { modules: { [key]: an } }, { merge:true });
      applyModules();
      /* Hier stand syncPublicFeed() — seit v.35.4.0 ohne Definition. Der
         Aufruf warf NACH dem erfolgreichen Speichern: die Oberflaeche
         meldete "Nicht gespeichert", und das Ereignis darunter, das
         Start und Huelle nachzieht, kam nie an. */
      window.dispatchEvent(new CustomEvent('tvza-modules-change', { detail:modules }));
      tellSettingsParent({ type:'tvza-settings-modules', modules });
      if (version === modulesSaveVersion) {
        status.dataset.state = 'saved';
        status.textContent = 'Gespeichert';
      }
    } catch (error) {
      reportClientError('personal-modules-save', error);
      /* Zurueck auf den alten Stand — und hatte der Schalter keinen
         gespeicherten Wert, dann auf KEINEN. Ein undefined im Profil
         ueberdeckte die Vorgabe genauso wie ein false. */
      const zurueck = { ...(profile.modules || {}) };
      if (Object.prototype.hasOwnProperty.call(vorher, key)) zurueck[key] = vorher[key];
      else delete zurueck[key];
      profile = { ...profile, modules: zurueck };
      if (version === modulesSaveVersion) {
        status.dataset.state = 'error';
        status.textContent = 'Nicht gespeichert';
        renderModuleToggles();
      }
    }
  });
}
document.getElementById('moduleToggles').addEventListener('change', event => {
  if (!event.target.matches('[data-mod]')) return;
  const row = event.target.closest('.row--check');
  row?.classList.toggle('is-checked', event.target.checked);
  const state = row?.querySelector('.module-toggle-state');
  if (state) state.textContent = event.target.checked ? 'Sichtbar' : 'Ausgeblendet';
  savePersonalModules(event.target.dataset.mod, event.target.checked);
});

/* ════ Bereich-specific settings, inside the one Settings surface ════ */
function foodSettingsRef() {
  return doc(db, 'foodlog', user.uid, 'meta', 'profile');
}

async function loadBereichSettings() {
  const allowed = allowedModules(profile);
  const foodSection = document.getElementById('foodSettingsSection');
  const watchSection = document.getElementById('watchSettingsSection');
  foodSection.hidden = !allowed.food;
  watchSection.hidden = !allowed.watch;
  document.getElementById('watchSettingsDivider').hidden = !allowed.watch;

  if (allowed.food) {
    try {
      const snap = await getDoc(foodSettingsRef());
      const food = snap.exists() ? snap.data() : {};
      document.getElementById('settingsFoodWeight').value = food.weight || '';
      document.getElementById('settingsFoodGoal').value = food.goal || 'halten';
    } catch (error) {
      reportClientError('food-settings-load', error);
      document.getElementById('settingsFoodStatus').textContent = 'Food-Einstellungen konnten nicht geladen werden.';
    }
  }
  if (allowed.watch) {
    try {
      document.getElementById('settingsWatchApiKey').value = localStorage.getItem('tvza-finnhub-key') || '';
      document.getElementById('settingsWatchAlert').value = localStorage.getItem('tvza-wl-alertpct') || '5';
    } catch {}
    const notify = document.getElementById('settingsWatchNotify');
    if (!('Notification' in window)) {
      notify.textContent = 'Auf diesem Gerät nicht verfügbar';
      notify.disabled = true;
    } else if (Notification.permission === 'granted') {
      notify.textContent = 'Benachrichtigungen sind aktiv';
      notify.disabled = true;
    } else {
      notify.textContent = 'Benachrichtigungen aktivieren';
      notify.disabled = false;
    }
  }
}

document.getElementById('settingsFoodSave').addEventListener('click', async () => {
  const status = document.getElementById('settingsFoodStatus');
  const weight = parseFloat(document.getElementById('settingsFoodWeight').value) || null;
  const goal = document.getElementById('settingsFoodGoal').value;
  status.textContent = 'Speichert…';
  try {
    const foodProfile = { weight, goal };
    await setDoc(foodSettingsRef(), foodProfile);
    status.textContent = 'Gespeichert.';
    tellSettingsParent({ type:'tvza-settings-food', profile:foodProfile });
  } catch (error) {
    reportClientError('food-settings-save', error);
    status.textContent = 'Konnte nicht gespeichert werden.';
  }
});

document.getElementById('settingsWatchSave').addEventListener('click', () => {
  const status = document.getElementById('settingsWatchStatus');
  try {
    localStorage.setItem('tvza-finnhub-key', document.getElementById('settingsWatchApiKey').value.trim());
    localStorage.setItem('tvza-wl-alertpct', document.getElementById('settingsWatchAlert').value);
    status.textContent = 'Gespeichert.';
    tellSettingsParent({ type:'tvza-settings-watch' });
  } catch {
    status.textContent = 'Konnte nicht gespeichert werden.';
  }
});

document.getElementById('settingsWatchNotify').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  const button = document.getElementById('settingsWatchNotify');
  if (permission === 'granted') {
    button.textContent = 'Benachrichtigungen sind aktiv';
    button.disabled = true;
  }
});

/* ════ Teilen ════════════════════════════════ */
function renderShareModuleOptions() {
  const sel = document.getElementById('shareModule');
  const allowed = allowedModules(profile);
  sel.innerHTML = Object.values(MODULES).filter(m => m.shareable && allowed[m.key])
    .map(m => `<option value="${m.key}">${escHtml(m.emoji + ' ' + m.name)}</option>`).join('');
}

document.getElementById('shareCreate').addEventListener('click', async () => {
  const moduleKey = document.getElementById('shareModule').value;
  if (!moduleKey) { alert('Du hast kein teilbares Modul freigeschaltet.'); return; }
  const target = shareTargets.find(b => b.uid === document.getElementById('shareUser').value);
  const role = document.querySelector('input[name="shareRole"]:checked').value;
  if (!target) { alert('Bitte eine Person auswählen.'); return; }
  if (target.uid === user.uid) { alert('Du kannst nicht mit dir selbst teilen.'); return; }
  const shareId = `${user.uid}__${target.uid}__${moduleKey}`;
  await setDoc(doc(db, 'shares', shareId), {
    ownerUid: user.uid, ownerName, module: moduleKey,
    /* Keine targetEmail mehr (v.35.47.0): gefunden wird eine Freigabe
       über targetUid, und die Adresse gehört nicht in ein Dokument, das
       auch die teilende Person liest. */
    targetUid: target.uid, targetName: target.name,
    role,
    createdAt: serverTimestamp()
  });
  document.getElementById('shareUser').value = '';
  renderMyShares();
  alert('Geteilt! Die Person sieht das Modul nach dem Anmelden unter „Mit mir geteilt".');
});

async function renderMyShares() {
  const wrap = document.getElementById('myShares');
  const shares = await sharesByOwner(user.uid);
  if (!shares.length) { wrap.innerHTML = '<p style="font-size:13px;color:var(--ink-soft)">Noch nichts geteilt.</p>'; return; }
  wrap.innerHTML = '<p class="marke" style="margin-bottom:8px">Von mir geteilt</p><div class="rows">' + shares.map(s => `
    <div class="row" data-bereich="${BEREICH_OF[s.module] || ''}">
      <span class="shared-identity">
        <span class="row__icon">${icon(ICONS[s.module] ? s.module : 'bereiche', 18)}</span>
        <span class="avatar avatar--ink shared-identity__person" style="${personAvatarStyle(s.targetUid||s.targetEmail)}">${escHtml(initialsOf(s.targetName||s.targetEmail))}</span>
      </span>
      <span class="row__body">
        <span class="row__title">${escHtml(s.targetName || s.targetEmail)}</span>
        <span class="row__sub">${escHtml(MODULES[s.module]?.name || s.module)} · ${s.role === 'edit' ? 'Bearbeiten' : 'Nur ansehen'}</span>
      </span>
      <span class="row__end">
        <button class="b b--danger" data-unshare="${s.id}" title="Freigabe entfernen">Entfernen</button>
      </span>
    </div>`).join('') + '</div>';
  wrap.querySelectorAll('[data-unshare]').forEach(b => b.addEventListener('click', async () => {
    await deleteDoc(doc(db, 'shares', b.dataset.unshare)).catch(error => reportClientError('share-delete', error));
    renderMyShares();
  }));
}

/* ════ Admin · Einladungen per E-Mail ════════════════════════ */
function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Eingeladen wird in eine GRUPPE (seit v.35.33.0). Vorher standen hier
   die Kalendergruppen (families), in denen man Verwaltung war — das
   zweite Gruppenmodell, das v.35.32.0 aufgeloest hat. Zur Wahl stehen
   die Gruppen, die man leitet: nur dort darf man laut Regel einladen. */
let inviteGroups = [];
async function loadInviteGroups() {
  try {
    inviteGroups = (await meineGruppen(user.uid)).filter(g => leitet(g.meineRolle));
    adminHealthData.gruppen = 'ok';
  } catch (error) {
    reportClientError('invite-groups', error);
    inviteGroups = [];
    adminHealthData.gruppen = 'error';
  }
  const picker = document.getElementById('memberInviteFamily');
  const noGroup = profile.isTimo === true
    ? '<option value="">Keine Gruppe – nur Firn</option>'
    : '<option value="" disabled>Keine Gruppe – nur für App-Admin</option>';
  picker.innerHTML = noGroup + inviteGroups
    .map(item => `<option value="${escHtml(item.id)}">${escHtml(item.name || 'Unbenannte Gruppe')}</option>`)
    .join('');
  if (profile.isTimo !== true && inviteGroups.length) picker.value = inviteGroups[0].id;
  renderAdminHealth();
  return inviteGroups;
}

/* Wohin eine Einladung fuehrt, fuer die Liste. Alte, noch offene
   Einladungen in eine Kalendergruppe tragen familyId statt gid. */
function einladungsZiel(invite) {
  if (invite.gid) return inviteGroups.find(item => item.id === invite.gid)?.name || 'Gruppe';
  if (invite.familyId) return 'Kalendergruppe (alt)';
  return 'Nur Firn';
}

async function renderMemberInvites() {
  if (profile.isTimo !== true && !inviteGroups.length) return;
  const wrap = document.getElementById('memberInviteList');
  try {
    const inviteQuery = profile.isTimo === true
      ? collection(db, 'memberInvites')
      : query(collection(db, 'memberInvites'), where('createdBy', '==', user.uid));
    const snap = await getDocs(inviteQuery);
    const invites = snap.docs.map(d => ({ code: d.id, ...d.data() }))
      .sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), 'de-CH'));
    adminHealthData.invites = 'ok';
    adminHealthData.inviteCount = invites.length;
    renderAdminHealth();
    if (!invites.length) {
      wrap.innerHTML = '<p class="form-hint" style="margin-top:10px">Keine offenen Einladungen.</p>';
      return;
    }
    wrap.innerHTML = '<div class="rows" style="margin-top:10px">' + invites.map(invite => `
      <div class="row">
        <span class="avatar avatar--ink" style="${personAvatarStyle(invite.email)}">${escHtml(initialsOf(invite.email))}</span>
        <span class="row__body">
          <span class="row__title">${escHtml(invite.email || 'Ohne E-Mail')}</span>
          <span class="row__sub">${escHtml(einladungsZiel(invite))} · ${escHtml(invite.code)}</span>
        </span>
        <span class="row__end">
          <button class="b" data-invite-copy="${escHtml(invite.code)}" type="button">Kopieren</button>
          <button class="b b--danger" data-invite-delete="${escHtml(invite.code)}" type="button">Entfernen</button>
        </span>
      </div>`).join('') + '</div>';
    wrap.querySelectorAll('[data-invite-copy]').forEach(btn => btn.addEventListener('click', async () => {
      const invite = invites.find(x => x.code === btn.dataset.inviteCopy);
      if (!invite) return;
      const link = `${location.origin}${location.pathname.replace(/index\.html$/, 'login.html')}?invite=${encodeURIComponent(invite.code)}`;
      const text = `Firn-Einladung\nE-Mail: ${invite.email}\n${link}`;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Kopiert';
      } catch {
        window.prompt('Einladung kopieren:', text);
      }
    }));
    wrap.querySelectorAll('[data-invite-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Einladung entfernen?')) return;
      await deleteDoc(doc(db, 'memberInvites', btn.dataset.inviteDelete));
      renderMemberInvites();
    }));
  } catch (error) {
    reportClientError('member-invites', error);
    adminHealthData.invites = 'error';
    renderAdminHealth();
    wrap.innerHTML = '<p class="form-hint" style="margin-top:10px">Einladungen konnten nicht geladen werden.</p>';
  }
}

document.getElementById('memberInviteCreate').addEventListener('click', async () => {
  const input = document.getElementById('memberInviteEmail');
  const email = input.value.trim().toLowerCase();
  const gid = document.getElementById('memberInviteFamily').value || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Bitte eine gültige E-Mail-Adresse eingeben.');
    return;
  }
  const btn = document.getElementById('memberInviteCreate');
  btn.disabled = true;
  try {
    let code = newInviteCode();
    while ((await getDoc(doc(db, 'memberInvites', code))).exists()) code = newInviteCode();
    const gruppe = inviteGroups.find(item => item.id === gid);
    const batch = writeBatch(db);
    /* gid nur, wenn es eine Gruppe ist — ohne Gruppe (nur Firn) fehlt das
       Feld ganz; so unterscheidet die Regel die beiden Faelle. */
    batch.set(doc(db, 'memberInvites', code), {
      email,
      ...(gid ? { gid } : {}),
      createdBy: user.uid,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'mail', `member-invite-${code}`), {
      to: [email],
      template: {
        name: 'member-invite',
        data: {
          inviteCode: code,
          familyName: gruppe?.name || 'Firn'
        }
      },
      createdAt: serverTimestamp()
    });
    await batch.commit();
    input.value = '';
    await renderMemberInvites();
  } catch (error) {
    reportClientError('member-invite-create', error);
    alert('Einladung konnte nicht erstellt werden.');
  } finally {
    btn.disabled = false;
  }
});

async function renderAdminUsers() {
  if (profile.isTimo !== true) return;
  const wrap = document.getElementById('adminUsers');
  await loadAppUsers();
  const manageableUsers = appUsers.filter(u => u.uid !== user.uid);
  const manageableModuleKeys = Object.keys(MODULES)
    .filter(key => key !== 'admin' && !CORE_MODULE_KEYS.includes(key));
  if (!manageableUsers.length) { wrap.innerHTML = '<p style="font-size:13px;color:var(--ink-soft)">Keine weiteren Benutzer gefunden.</p>'; return; }
  wrap.innerHTML = manageableUsers.map(u => {
    const allowed = allowedModules(u);
    const enabledCount = manageableModuleKeys.filter(key => allowed[key]).length;
    const kreis = imKreis(u);
    const merkmal = u.isTimo ? 'Admin' : `${kreis ? 'TVZA · ' : ''}${enabledCount} Module`;
    return `
    <details class="admin-user" data-admin-user="${escHtml(u.uid)}">
      <summary class="row admin-user__head">
        <span class="avatar avatar--ink" style="${personAvatarStyle(u.uid||u.email)}">${escHtml(initialsOf(u.displayName||u.email))}</span>
        <span class="row__body">
          <span class="row__title">${escHtml(u.displayName || 'Ohne Name')}</span>
          <span class="row__sub">${escHtml(u.email || '')}</span>
        </span>
        <span class="row__end"><span class="role-badge">${merkmal}</span></span>
      </summary>
      <div class="admin-user__body">
        <!-- Der TVZA-Kreis (v.35.48.0): Freunde und Familie. Nur wer
             darin ist, sieht TVZA; wer einem Verein beitritt, ist es nicht. -->
        <label class="admin-mod admin-mod--kreis">
          <input type="checkbox" data-admin-kreis ${kreis ? 'checked' : ''} />
          <span class="admin-mod__icon tvza-marke">TVZA</span>
          <span>Im TVZA-Kreis</span>
        </label>
        <!-- Der persönliche Assistent (v.35.55.0): im Kreis immer dabei,
             sonst hier einzeln — später, wenn jemand privat für Firn zahlt. -->
        <label class="admin-mod admin-mod--ki" title="Im TVZA-Kreis immer dabei">
          <input type="checkbox" data-admin-ki ${u.ki === true || kreis ? 'checked' : ''} ${kreis ? 'disabled' : ''} />
          <span class="admin-mod__icon"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></span>
          <span>Persönlicher Assistent</span>
        </label>
        <div class="admin-mods">
          ${Object.values(MODULES).filter(m => manageableModuleKeys.includes(m.key)).map(m => `
            <label class="admin-mod" data-bereich="${BEREICH_OF[m.key] || ''}">
              <input type="checkbox" data-admin-allowed="${m.key}" ${allowed[m.key] ? 'checked' : ''} />
              <span class="admin-mod__icon">${icon(ICONS[m.key] ? m.key : 'bereiche', 15)}</span>
              <span>${escHtml(m.name)}</span>
              ${istTvza(m.key) ? '<span class="tvza-marke">TVZA</span>' : ''}
            </label>`).join('')}
          <label class="admin-mod admin-mod--admin">
            <input type="checkbox" data-admin-timo ${u.isTimo ? 'checked' : ''} />
            <span class="admin-mod__icon"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="m12 3 2.6 5.7 6.4.7-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.7z"/></svg></span>
            <span>Admin</span>
          </label>
        </div>
        <button class="b b--primary" data-admin-save="${escHtml(u.uid)}">Speichern</button>
      </div>
    </details>`;
  }).join('');

  /* Hinein heisst: die TVZA-Bereiche sind frei; hinaus: keiner. Der
     Admin kann danach einzelne wieder abwählen. So bedeutet der Schalter
     etwas, das man sieht, statt eines Felds, das nur zusammen mit
     anderen Häkchen wirkt. */
  wrap.querySelectorAll('[data-admin-kreis]').forEach(schalter => schalter.addEventListener('change', () => {
    const row = schalter.closest('[data-admin-user]');
    /* Im Kreis ist der persönliche Assistent dabei — der Schalter zeigt es. */
    const ki = row.querySelector('[data-admin-ki]');
    if (ki) { ki.disabled = schalter.checked; if (schalter.checked) ki.checked = true; }
    row.querySelectorAll('[data-admin-allowed]').forEach(cb => {
      if (istTvza(cb.dataset.adminAllowed)) cb.checked = schalter.checked;
    });
  }));

  wrap.querySelectorAll('[data-admin-save]').forEach(btn => btn.addEventListener('click', async () => {
    const uid = btn.dataset.adminSave;
    const row = wrap.querySelector(`[data-admin-user="${CSS.escape(uid)}"]`);
    const allowedModulesNext = {};
    row.querySelectorAll('[data-admin-allowed]').forEach(cb => allowedModulesNext[cb.dataset.adminAllowed] = cb.checked);
    const isTimo = row.querySelector('[data-admin-timo]').checked;
    const kreis = row.querySelector('[data-admin-kreis]').checked;
    /* Nur, was der Admin eigens freischaltet; der Kreis bringt ihn ohnehin. */
    const kiSchalter = row.querySelector('[data-admin-ki]');
    const ki = !!kiSchalter && !kiSchalter.disabled && kiSchalter.checked;
    if (uid === user.uid && !isTimo) { alert('Du kannst dir selbst den Admin-Zugriff nicht entfernen.'); return; }
    const moduleKeys = manageableModuleKeys;
    const allowedKeys = Object.keys(allowedModulesNext);
    const validPayload = Object.getPrototypeOf(allowedModulesNext) === Object.prototype
      && allowedKeys.length === moduleKeys.length
      && moduleKeys.every(key => typeof allowedModulesNext[key] === 'boolean');
    if (!validPayload) {
      reportClientError('member-modules-save', { code:'invalid-module-payload' });
      alert('Die Modul-Auswahl ist ungültig und wurde nicht gespeichert. Bitte lade die Seite neu und versuche es nochmals.');
      return;
    }

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Speichert…';
    try {
      // Firestore authorises this write from the acting user's current
      // users/{uid} document. Re-read it here so a revoked or stale admin
      // session produces a useful explanation instead of a silent no-op.
      const actingAdmin = await getDocFromServer(doc(db, 'users', user.uid));
      if (!actingAdmin.exists() || actingAdmin.data().isTimo !== true) {
        const error = new Error('The acting user is not an admin in Firestore.');
        error.code = 'admin-access-revoked';
        throw error;
      }

      /* Profil und Kreisliste in EINEM Stapel: die Liste ist, was
         Freunde und Familie im Chat einander finden lässt, und darf dem
         Profil nie widersprechen. */
      const stapel = writeBatch(db);
      stapel.update(doc(db, 'users', uid), {
        allowedModules: allowedModulesNext,
        isTimo,
        kreis,
        ki
      });
      if (kreis || isTimo) stapel.set(doc(db, 'kreis', uid), { seit: serverTimestamp() });
      else stapel.delete(doc(db, 'kreis', uid));
      await stapel.commit();
      if (uid === user.uid) {
        profile = { ...profile, allowedModules: allowedModulesNext, isTimo, kreis };
        applyModules();
      }
      await loadAppUsers(true);
      await renderAdminUsers();
    } catch (error) {
      reportClientError('member-modules-save', error);
      const code = typeof error?.code === 'string' ? error.code : 'operation-failed';
      const message = code === 'admin-access-revoked'
        ? 'Dein Admin-Zugriff ist in Firestore nicht mehr aktiv. Lade die Seite neu oder lass dein Konto von einem Admin prüfen (Fehlercode: admin-access-revoked).'
        : code === 'permission-denied' || code === 'firestore/permission-denied'
          ? `Firestore hat das Speichern abgelehnt. Prüfe, ob dein eigenes Konto weiterhin als Admin freigeschaltet ist (Fehlercode: ${code}).`
          : code === 'invalid-argument' || code === 'firestore/invalid-argument'
            ? `Die Modul-Auswahl enthält ungültige Daten und konnte nicht gespeichert werden (Fehlercode: ${code}).`
            : `Die Modul-Freigaben konnten nicht gespeichert werden (Fehlercode: ${code}).`;
      alert(message);
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    }
  }));
}

/* ════ Admin · TVZA-Einladung (v.35.56.0) ═════════════════
   Michel: "Kann ich jemand einfach in TVZA einladen?" Ein Link für eine
   Person, sieben Tage (kreis-einladung.js). Teilen über das Menü des
   Telefons, sonst kopieren. Offene Links stehen darunter, mit
   Zurückziehen. */
async function renderKreisEinladungen() {
  if (profile.isTimo !== true) return;
  const liste = document.getElementById('kreisEinladungListe');
  const kreis = await import('../../kreis-einladung.js');
  let offene = [];
  try { offene = await kreis.kreisEinladungen(); }
  catch (error) { reportClientError('kreis-einladungen', error); }
  const datum = d => d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long' });
  liste.innerHTML = offene.map(e => `
    <div class="row kreis-einladung" data-kreis-code="${escHtml(e.code)}">
      <span class="row__body">
        <span class="row__title">${escHtml(e.fuer || codeZeigen(e.code))}</span>
        <span class="row__sub">${escHtml(einladungsLink(e.code).replace(/^https?:\/\//, ''))} · bis ${escHtml(datum(e.bis))}</span>
      </span>
      <span class="row__end">
        <button class="btn btn-secondary" type="button" data-kreis-teilen>Teilen</button>
        <button class="btn btn-secondary" type="button" data-kreis-weg>Zurückziehen</button>
      </span>
    </div>`).join('');
  liste.querySelectorAll('[data-kreis-code]').forEach(zeile => {
    const e = offene.find(x => x.code === zeile.dataset.kreisCode);
    zeile.querySelector('[data-kreis-teilen]').addEventListener('click', () => kreisTeilen(e));
    zeile.querySelector('[data-kreis-weg]').addEventListener('click', async () => {
      if (!await frage({ titel: 'Einladung zurückziehen?', text: 'Der Link führt danach nirgends mehr hin.', ja: 'Zurückziehen', gefahr: true })) return;
      try { await kreis.kreisEinladungZuruecknehmen(e.code); } catch (error) { reportClientError('kreis-einladung-weg', error); }
      await renderKreisEinladungen();
    });
  });
}

async function kreisTeilen(e) {
  const text = kreisEinladungsText({ link: einladungsLink(e.code), bis: e.bis, t });
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); await meldung({ titel: 'Kopiert', text }); }
  catch { await meldung({ titel: 'Der Link', text }); }
}

document.getElementById('kreisEinladungNeu')?.addEventListener('click', async () => {
  if (profile.isTimo !== true) return;
  const btn = document.getElementById('kreisEinladungNeu');
  const feld = document.getElementById('kreisEinladungFuer');
  btn.disabled = true;
  try {
    const kreis = await import('../../kreis-einladung.js');
    const neu = await kreis.kreisEinladungErzeugen(user.uid, { fuer: feld.value });
    feld.value = '';
    await renderKreisEinladungen();
    await kreisTeilen(neu);
  } catch (error) {
    reportClientError('kreis-einladung-neu', error);
    await meldung({ titel: 'Der Link liess sich nicht erstellen.' });
  } finally {
    btn.disabled = false;
  }
});

/* ════ Admin · Assistent der Gruppen (v.35.55.0) ═════════════════
   Michel: "wenn die Gruppe dafür zahlt, wird ja extra freigeschaltet".
   Bis es ein Bezahlen gibt, schaltet der Admin frei: groups.ki. Die
   Regel lässt das nur ihn schreiben, nie die Leitung der Gruppe. */
async function renderAdminKiGruppen() {
  if (profile.isTimo !== true) return;
  const wrap = document.getElementById('adminKiGruppen');
  let gruppen = [];
  try {
    const snap = await getDocs(collection(db, 'groups'));
    gruppen = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  } catch (error) {
    reportClientError('admin-ki-gruppen', error);
    wrap.innerHTML = '<p class="settings-section-copy">Die Gruppen liessen sich nicht laden.</p>';
    return;
  }
  if (!gruppen.length) { wrap.innerHTML = '<p class="settings-section-copy">Noch keine Gruppen.</p>'; return; }
  wrap.innerHTML = gruppen.map(g => `
    <label class="admin-mod admin-mod--ki">
      <input type="checkbox" data-admin-ki-gruppe="${escHtml(g.id)}" ${g.ki === true ? 'checked' : ''} />
      <span class="admin-mod__icon"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></span>
      <span>${escHtml(g.name || 'Ohne Namen')}${g.assistent?.name ? ` · ${escHtml(g.assistent.name)}` : ''}</span>
    </label>`).join('');
  wrap.querySelectorAll('[data-admin-ki-gruppe]').forEach(schalter => schalter.addEventListener('change', async () => {
    schalter.disabled = true;
    try {
      await updateDoc(doc(db, 'groups', schalter.dataset.adminKiGruppe), { ki: schalter.checked });
    } catch (error) {
      reportClientError('admin-ki-gruppe', error);
      schalter.checked = !schalter.checked;
    } finally {
      schalter.disabled = false;
    }
  }));
}

/* ════ Admin · Food-Anfragen ═════════════════
   Nutzer-Vorschläge prüfen → freigeben (in `customFoods`,
   sofort für alle sichtbar) oder ablehnen. Beides löscht
   die Anfrage.                                          */
async function renderFoodRequests() {
  if (profile.isTimo !== true) return;
  const wrap = document.getElementById('adminFoodRequests');
  const badge = document.getElementById('reqCount');
  let reqs = [];
  try {
    const qs = await getDocs(collection(db, 'foodRequests'));
    reqs = qs.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    adminHealthData.food = 'ok';
    adminHealthData.foodCount = reqs.length;
    renderAdminHealth();
  } catch (e) {
    adminHealthData.food = 'error';
    renderAdminHealth();
    wrap.innerHTML = '<p style="font-size:13px;color:var(--ink-soft)">Konnte nicht laden.</p>';
    return;
  }

  if (badge) { badge.style.display = reqs.length ? '' : 'none'; badge.textContent = reqs.length + ' offen'; }
  if (!reqs.length) { wrap.innerHTML = '<p style="font-size:13px;color:var(--ink-soft)">Keine offenen Anfragen.</p>'; return; }

  const field = (k, ph) => `<label style="font-size:12px;color:var(--ink-soft)">${ph}<input class="form-input" data-f="${k}" type="number" step="0.1" min="0" style="margin-top:2px" /></label>`;
  wrap.innerHTML = reqs.map(r => `
    <details class="link-row" data-req="${escHtml(r.id)}" style="display:block;padding:0">
      <summary style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;list-style:none">
        <span class="link-icon">🍽️</span>
        <span class="link-title" style="flex:1">
          <span>${escHtml(r.name || '—')}</span>
          <small>${escHtml(r.requestedByEmail || '')}${r.brand ? ' · ' + escHtml(r.brand) : ''}</small>
        </span>
        <span class="role-badge">prüfen</span>
      </summary>
      <div style="padding:0 14px 14px 54px">
        ${r.note ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">📝 ${escHtml(r.note)}</p>` : ''}
        ${r.barcode ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">🔖 ${escHtml(r.barcode)}</p>` : ''}
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label">Name (in der Liste)</label>
          <input class="form-input" data-f="name" type="text" value="${escHtml(r.name || '')}" />
        </div>
        <p style="font-size:12px;color:var(--ink-soft);margin:0 0 6px">Nährwerte pro 100 g</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px">
          ${field('kcal','kcal')}${field('protein','Protein g')}${field('carbs','KH g')}${field('fat','Fett g')}${field('fibre','Ballaststoffe g')}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-approve="${escHtml(r.id)}" style="padding:9px 12px">✓ Freigeben</button>
          <button class="btn btn-danger" data-reject="${escHtml(r.id)}" style="padding:9px 12px">Ablehnen</button>
        </div>
      </div>
    </details>`).join('');

  // Nährwerte aus der Anfrage vorbefüllen (falls vom Scan vorhanden)
  reqs.forEach(r => {
    const row = wrap.querySelector(`[data-req="${CSS.escape(r.id)}"]`);
    ['kcal','protein','carbs','fat','fibre'].forEach(k => {
      if (r[k] != null && r[k] !== '') { const el = row.querySelector(`[data-f="${k}"]`); if (el) el.value = r[k]; }
    });
  });

  wrap.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.approve;
    const row = wrap.querySelector(`[data-req="${CSS.escape(id)}"]`);
    const val = k => row.querySelector(`[data-f="${k}"]`).value;
    const name = val('name').trim();
    if (!name) { alert('Bitte einen Namen angeben.'); return; }
    if (!val('kcal')) { alert('Bitte mindestens die kcal angeben.'); return; }
    btn.disabled = true;
    try {
      await addDoc(collection(db, 'customFoods'), {
        name,
        kcal: +val('kcal') || 0,
        protein: +val('protein') || 0,
        carbs: +val('carbs') || 0,
        fat: +val('fat') || 0,
        fibre: +val('fibre') || 0,
        micros: [],
        approvedBy: user.email || user.uid,
        createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'foodRequests', id));
      renderFoodRequests();
    } catch (e) { alert('Freigeben fehlgeschlagen.'); btn.disabled = false; }
  }));

  wrap.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Anfrage ablehnen und löschen?')) return;
    try { await deleteDoc(doc(db, 'foodRequests', btn.dataset.reject)); renderFoodRequests(); }
    catch (e) { alert('Löschen fehlgeschlagen.'); }
  }));
}

/* ════ Mit mir geteilt ═══════════════════════ */
(async function renderSharedWithMe() {
  const shares = await sharesForEmail(user.email);
  // Legacy: Elternansicht von Timos Skis (falls isParent gesetzt)
  if (profile.isParent === true && timoUid && timoUid !== user.uid &&
      !shares.some(s => s.ownerUid === timoUid && s.module === 'ski')) {
    shares.push({ ownerUid: timoUid, module: 'ski', role: 'view', ownerName: 'Timo' });
  }
  const sec = document.getElementById('sharedSection');
  if (!shares.length) { sec.hidden = true; applyOverviewLayout(); return; }
  sec.hidden = false;
  document.getElementById('sharedList').innerHTML = shares.map(s => {
    const m = MODULES[s.module];
    if (!m || !m.page) return '';
    const href = `${m.page}?owner=${encodeURIComponent(s.ownerUid)}`;
    return `
    <a class="row" href="${href}" data-bereich="${BEREICH_OF[s.module] || ''}">
      <span class="shared-identity">
        <span class="row__icon">${icon(ICONS[s.module] ? s.module : 'bereiche', 18)}</span>
        <span class="avatar avatar--ink shared-identity__person" style="${personAvatarStyle(s.ownerUid||s.ownerName)}">${escHtml(initialsOf(s.ownerName||'Geteilt'))}</span>
      </span>
      <span class="row__body">
        <span class="row__title">${escHtml(s.ownerName || 'Geteilt')}</span>
        <span class="row__sub">${escHtml(m.name)} · Mit dir geteilt</span>
      </span>
      <span class="row__end"><span class="role-badge">${s.role === 'edit' ? 'Bearbeiten' : 'Ansehen'}</span></span>
    </a>`;
  }).join('');
  applyOverviewLayout();
})();

/* ════ Projekte (eigene) ═════════════════════ */
const projCol = collection(db, 'projects', user.uid, 'items');
const pubDoc = id => doc(db, 'publicProjects', `${user.uid}__${id}`);
let editingId = null;
let latestProjects = [];
const repairedPublicProjects = new Set();

onSnapshot(query(projCol, orderBy('createdAt', 'asc')), snap => {
  latestProjects = sortProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  renderProjects(latestProjects);
  latestProjects.filter(p => p.isPublic).forEach(repairPublicProject);
});

async function repairPublicProject(project) {
  if (repairedPublicProjects.has(project.id)) return;
  repairedPublicProjects.add(project.id);
  try {
    const ref = pubDoc(project.id);
    const existing = await getDoc(ref);
    if (!existing.exists() || !('publicPassword' in existing.data())) return;
    await setDoc(ref, {
      ownerUid: user.uid,
      ownerName,
      emoji: project.emoji || '🔗',
      name: project.name,
      url: project.url,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    repairedPublicProjects.delete(project.id);
    reportClientError('public-project-repair', error);
  }
}

function sortProjects(items) {
  return [...items].sort((a, b) => {
    const ao = Number(a.sortOrder);
    const bo = Number(b.sortOrder);
    if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
    if (Number.isFinite(ao) && !Number.isFinite(bo)) return -1;
    if (!Number.isFinite(ao) && Number.isFinite(bo)) return 1;
    const at = a.createdAt?.toMillis?.() || 0;
    const bt = b.createdAt?.toMillis?.() || 0;
    return at - bt || String(a.name || '').localeCompare(String(b.name || ''), 'de-CH');
  });
}

registerSortable({
  itemSelector: '[data-project-row]',
  commit() {
    const ids = [...document.querySelectorAll('[data-project-row]')].map(row => row.dataset.projectRow);
    latestProjects = ids
      .map(id => latestProjects.find(project => project.id === id))
      .filter(Boolean);
    latestProjects.forEach((project, index) => {
      updateDoc(doc(projCol, project.id), { sortOrder: index }).catch(error => reportClientError('project-order-save', error));
    });
  }
});

function renderProjects(items) {
  const wrap = document.getElementById('projectList');
  if (!items.length) {
    wrap.innerHTML = `<p class="empty-hint">${escHtml(
      t('home.keineProjekte', 'Noch kein Projekt. Der Knopf darunter legt das erste an.'))}</p>`;
    return;
  }
  items = sortProjects(items);
  /* Der Zustand steht in der Unterzeile, nicht noch einmal auf dem
     Knopf — drei beschriftete Knoepfe je Projekt waren der Grund,
     warum die Liste unruhig wirkte. Was der Knopf tut, sagt sein
     title und sein aria-label. */
  const offen = t('home.projektOeffentlich', 'Öffentlich');
  const privat = t('home.projektPrivat', 'Privat');

  wrap.innerHTML = items.map(p => `
    <div class="row" data-project-row="${p.id}">
      <span class="row__icon row__icon--emoji">${escHtml(p.emoji || '🔗')}</span>
      <a class="row__body" href="${escHtml(p.url)}" target="_blank" rel="noopener">
        <span class="row__title">${escHtml(p.name)}</span>
        <span class="row__sub">${p.isPublic ? escHtml(offen) : escHtml(privat)}</span>
      </a>
      <span class="row__end">
        <button class="row__aktion${p.isPublic ? ' row__aktion--an' : ''}" type="button"
                data-pub="${p.id}" data-ispub="${p.isPublic ? '1':''}"
                title="${p.isPublic ? escHtml(t('home.nichtMehrTeilen', 'Veröffentlichung beenden')) : escHtml(t('home.teilen', 'Projekt veröffentlichen'))}"
                aria-label="${p.isPublic ? escHtml(t('home.nichtMehrTeilen', 'Veröffentlichung beenden')) : escHtml(t('home.teilen', 'Projekt veröffentlichen'))}">
          ${p.isPublic ? ICON_GLOBE : ICON_LOCK}
        </button>
        <button class="row__aktion" type="button"
                data-edit="${p.id}" data-emoji="${escHtml(p.emoji||'')}"
                data-name="${escHtml(p.name)}" data-url="${escHtml(p.url)}"
                title="${escHtml(t('home.projektBearbeiten', 'Projekt bearbeiten'))}"
                aria-label="${escHtml(t('home.projektBearbeiten', 'Projekt bearbeiten'))}">
          ${ICON_PENCIL}
        </button>
        <button class="row__aktion row__aktion--gefahr" type="button" data-del="${p.id}"
                title="${escHtml(t('home.projektLoeschen', 'Projekt löschen'))}"
                aria-label="${escHtml(t('home.projektLoeschen', 'Projekt löschen'))}">
          ${ICON_CLOSE}
        </button>
      </span>
    </div>`).join('');

  wrap.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', async () => {
      if (confirm('Projekt löschen?')) {
        await deleteDoc(doc(projCol, b.dataset.del)).catch(error => reportClientError('project-delete', error));
        await deleteDoc(pubDoc(b.dataset.del)).catch(() => {});
      }
    }));

  wrap.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openModal({
      id: b.dataset.edit, emoji: b.dataset.emoji, name: b.dataset.name, url: b.dataset.url
    })));

  wrap.querySelectorAll('[data-pub]').forEach(b =>
    b.addEventListener('click', async () => {
      const id = b.dataset.pub;
      const p = items.find(x => x.id === id);
      const makePublic = !b.dataset.ispub;
      await updateDoc(doc(projCol, id), { isPublic: makePublic });
      if (makePublic) {
        await setDoc(pubDoc(id), {
          ownerUid: user.uid, ownerName, emoji: p.emoji || '🔗',
          name: p.name, url: p.url, updatedAt: serverTimestamp()
        });
      } else {
        await deleteDoc(pubDoc(id)).catch(() => {});
      }
    }));
}

// ── Project modal ─────────────────────────────
const modal = document.getElementById('projectModal');
function openModal(p = null) {
  editingId = p?.id || null;
  document.getElementById('modalTitle').textContent = p ? 'Projekt bearbeiten' : 'Projekt hinzufügen';
  document.getElementById('pEmoji').value = p?.emoji || '';
  document.getElementById('pName').value  = p?.name  || '';
  document.getElementById('pUrl').value   = p?.url   || '';
  modal.classList.add('visible');
}
document.getElementById('addProjectBtn').addEventListener('click', () => openModal());
document.getElementById('modalCancel').addEventListener('click', () => modal.classList.remove('visible'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('visible'); });

document.getElementById('modalSave').addEventListener('click', async () => {
  const emoji = document.getElementById('pEmoji').value.trim() || '🔗';
  const pname = document.getElementById('pName').value.trim();
  let   url   = document.getElementById('pUrl').value.trim();
  if (!pname || !url) { alert('Bitte Name und URL eingeben.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  if (editingId) {
    await updateDoc(doc(projCol, editingId), { emoji, name: pname, url });
    const pubSnap = await getDoc(pubDoc(editingId)).catch(() => null);
    if (pubSnap?.exists()) {
      // Replacement write also scrubs legacy publicPassword fields.
      await setDoc(pubDoc(editingId), {
        ownerUid: user.uid, ownerName, emoji, name: pname,
        url, updatedAt: serverTimestamp()
      });
    }
  } else {
    await addDoc(projCol, {
      emoji, name: pname, url, isPublic: false,
      sortOrder: latestProjects.length, createdAt: serverTimestamp()
    });
  }
  modal.classList.remove('visible');
});

// Seed Timo's default projects once.
if (profile.isTimo === true && !profile.projectsSeeded) {
  const seed = [
    { emoji: '\u{1F3E6}', name: 'Banking App', url: 'https://example.com/REPLACE-banking' },
    { emoji: '\u{1F4DA}', name: 'Werbeposter', url: 'https://example.com/REPLACE-werbeposter' },
  ];
  for (const [index, p] of seed.entries()) await addDoc(projCol, { ...p, isPublic: false, sortOrder: index, createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'users', user.uid), { projectsSeeded: true }).catch(() => {});
}

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => reportClientError('service-worker', error)));
}
