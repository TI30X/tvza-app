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
  sharesByOwner, reportClientError
} from '../../firebase-config.js';
import {
  signOut, sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc, getDoc, getDocFromServer, setDoc, collection, addDoc, onSnapshot, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, where, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ICONS, icon } from '../../shell.js?v=7';
import { initialsOf } from '../../nav.js?v=7';

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
if (!Object.keys(profile).length) {
  await signOut(auth).catch(() => {});
  window.location.replace('login.html?reason=membership');
  // Stop this module while navigation completes; otherwise restricted
  // queries below would flash an empty dashboard.
  await new Promise(() => {});
}

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
const overviewSectionDefaults = ['tracker', 'shared', 'projects'];
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

function applyTrackerTileOrder() {
  const grid = document.getElementById('trackerGrid');
  trackerTileOrder.forEach(id => {
    const tile = document.querySelector(`[data-tracker-tile="${id}"]`);
    if (tile) grid.appendChild(tile);
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
}

const h = new Date().getHours();
const g = h>=5&&h<12 ? 'Guten Morgen' : h>=12&&h<18 ? 'Guten Tag' : h>=18 ? 'Guten Abend' : 'Gute Nacht';
document.getElementById('greetingText').textContent = `${g}, ${name}`;
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
  const anyTracker = mods.ski || mods.food || mods.weather || mods.matura || mods.maturatracker || mods.training;
  // The chip may not have registered yet — it is a module too, and
  // module order is document order. Record the wanted state either
  // way; whichever runs second applies it.
  window.tvzaWeatherWanted = !!mods.weather;
  if (window.tvzaWeatherChip) window.tvzaWeatherChip.setVisible(!!mods.weather);
  if (mods.dm) startDmBadge(); else stopDmBadge();
  document.getElementById('noModulesHint').hidden = anyTracker;
  applyTrackerTileOrder();
  zeigeBereiche();
  applyOverviewLayout();
}

/* ════ DM unread badge (live) ════ */
let dmUnsub = null, dmPrevTotal = null;
function startDmBadge() {
  if (dmUnsub) return;
  dmUnsub = onSnapshot(query(collection(db, 'dms'), where('participants', 'array-contains', user.uid)), snap => {
    let total = 0;
    snap.forEach(d => { total += (d.data().unread?.[user.uid]) || 0; });
    const badge = document.getElementById('dmTileBadge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = total > 0 ? '' : 'none';
    }
    // Foreground ping when new messages arrive (skip the first snapshot).
    if (dmPrevTotal != null && total > dmPrevTotal && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('💬 Neue Nachricht', { body: 'Du hast neue Nachrichten in TVZA.', icon: 'assets/icons/icon-192.png', tag: 'tvza-dm' }); } catch (e) {}
    }
    dmPrevTotal = total;
  }, err => reportClientError('dm-badge', err));
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
  if (confirm('Abmelden?')) {
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
  const fillLanguages = () => {
    const current = i18n.hasStoredChoice() ? i18n.lang : '';
    languageSelect.innerHTML =
      `<option value="">${i18n.t('lang.system')}</option>` +
      i18n.LANGUAGES.map(l => `<option value="${l.id}">${l.native}</option>`).join('');
    languageSelect.value = current;
  };
  fillLanguages();
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
  loadBereichSettings();
  renderShareModuleOptions();
  renderMyShares();
  document.getElementById('adminSection').style.display = 'none';
  settingsModal.classList.add('visible');
  focusSettingsSection(section);
  loadAppUsers().then(() => {
    renderUserSuggestions();
  });
}
const adminHealthData = {
  families:'checking',
  invites:'checking',
  users:'checking',
  food:'checking',
  inviteCount:0,
  foodCount:0,
};
function resetAdminHealth() {
  adminHealthData.families = 'checking';
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
    adminHealthData.families,
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
  loadInviteFamilies().then(renderMemberInvites);
  loadAppUsers().then(() => {
    renderAdminUsers();
    renderFoodRequests();
  });
}
document.getElementById('acctSettings').addEventListener('click', () => { closeAcct(); openSettings(); });
document.getElementById('openSettingsLink').addEventListener('click', openSettings);
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

function userOptionLabel(u) {
  return `${u.displayName || u.email} <${u.email}>`;
}

function renderUserSuggestions() {
  document.getElementById('appUserSuggestions').innerHTML = appUsers
    .filter(u => u.uid !== user.uid)
    .map(u => `<option value="${escHtml(userOptionLabel(u))}"></option>`)
    .join('');
}

function resolveShareUser(raw) {
  const val = raw.trim().toLowerCase();
  if (!val) return null;
  return appUsers.find(u => {
    const email = String(u.email || '').toLowerCase();
    const name = String(u.displayName || '').toLowerCase();
    return email === val || name === val || userOptionLabel(u).toLowerCase() === val;
  }) || null;
}

function renderModuleToggles() {
  const allowed = allowedModules(profile);
  const mods = enabledModules(profile);
  const availableModules = Object.values(MODULES)
    .filter(m => m.key !== 'admin' && !CORE_MODULE_KEYS.includes(m.key) && allowed[m.key]);
  if (!availableModules.length) {
    document.getElementById('moduleToggles').innerHTML = '<p style="font-size:13px;color:var(--ink-soft)">Noch keine Module freigeschaltet.</p>';
    return;
  }
  document.getElementById('moduleToggles').innerHTML = availableModules.map(m => `
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
    </label>`).join('');
}

let modulesSaveQueue = Promise.resolve();
let modulesSaveVersion = 0;
function selectedPersonalModules() {
  const modules = {};
  document.querySelectorAll('#moduleToggles [data-mod]').forEach(cb => modules[cb.dataset.mod] = cb.checked);
  return modules;
}
function savePersonalModules() {
  const modules = selectedPersonalModules();
  const version = ++modulesSaveVersion;
  const status = document.getElementById('modulesSaveStatus');
  status.dataset.state = 'saving';
  status.textContent = 'Speichert';
  modulesSaveQueue = modulesSaveQueue.then(async () => {
    try {
      await setDoc(doc(db, 'users', user.uid), { modules }, { merge:true });
      profile = { ...profile, modules };
      applyModules();
      syncPublicFeed();
      window.dispatchEvent(new CustomEvent('tvza-modules-change', { detail:modules }));
      tellSettingsParent({ type:'tvza-settings-modules', modules });
      if (version === modulesSaveVersion) {
        status.dataset.state = 'saved';
        status.textContent = 'Gespeichert';
      }
    } catch (error) {
      reportClientError('personal-modules-save', error);
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
  savePersonalModules();
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
  await loadAppUsers();
  const target = resolveShareUser(document.getElementById('shareUser').value);
  const role = document.querySelector('input[name="shareRole"]:checked').value;
  if (!target) { alert('Bitte eine Person aus den Vorschlägen auswählen.'); return; }
  if (target.uid === user.uid) { alert('Du kannst nicht mit dir selbst teilen.'); return; }
  const shareId = `${user.uid}__${target.uid}__${moduleKey}`;
  await setDoc(doc(db, 'shares', shareId), {
    ownerUid: user.uid, ownerName, module: moduleKey,
    targetUid: target.uid, targetEmail: target.email.toLowerCase(), targetName: target.displayName || '',
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

/* ════ Admin · family invitations ═══════════════════════════ */
function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

let inviteFamilies = [];
async function loadInviteFamilies() {
  try {
    const snap = await getDocs(query(
      collection(db, 'families'),
      where('members', 'array-contains', user.uid)
    ));
    inviteFamilies = snap.docs
      .map(item => ({ id:item.id, ...item.data() }))
      .filter(item => item.headUid === user.uid || (item.managers || []).includes(user.uid))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));
    adminHealthData.families = 'ok';
  } catch (error) {
    reportClientError('invite-families', error);
    inviteFamilies = [];
    adminHealthData.families = 'error';
  }
  const picker = document.getElementById('memberInviteFamily');
  const noGroup = profile.isTimo === true
    ? '<option value="">Keine Gruppe – nur TVZA</option>'
    : '<option value="" disabled>Keine Gruppe – nur für App-Admin</option>';
  picker.innerHTML = noGroup + inviteFamilies
    .map(item => `<option value="${escHtml(item.id)}">${escHtml(item.name || 'Unbenannte Gruppe')}</option>`)
    .join('');
  if (profile.isTimo !== true && inviteFamilies.length) picker.value = inviteFamilies[0].id;
  renderAdminHealth();
  return inviteFamilies;
}

async function renderMemberInvites() {
  if (profile.isTimo !== true && !inviteFamilies.length) return;
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
          <span class="row__sub">${escHtml(
            invite.familyId
              ? (inviteFamilies.find(item => item.id === invite.familyId)?.name || 'Kalendergruppe')
              : 'Nur TVZA'
          )} · ${escHtml(invite.code)}</span>
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
      const text = `TVZA-Einladung\nE-Mail: ${invite.email}\n${link}`;
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
  const familyId = document.getElementById('memberInviteFamily').value || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Bitte eine gültige E-Mail-Adresse eingeben.');
    return;
  }
  const btn = document.getElementById('memberInviteCreate');
  btn.disabled = true;
  try {
    let code = newInviteCode();
    while ((await getDoc(doc(db, 'memberInvites', code))).exists()) code = newInviteCode();
    const family = inviteFamilies.find(item => item.id === familyId);
    const batch = writeBatch(db);
    batch.set(doc(db, 'memberInvites', code), {
      email,
      familyId,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'mail', `member-invite-${code}`), {
      to: [email],
      template: {
        name: 'member-invite',
        data: {
          inviteCode: code,
          familyName: family?.name || 'TVZA'
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
    return `
    <details class="admin-user" data-admin-user="${escHtml(u.uid)}">
      <summary class="row admin-user__head">
        <span class="avatar avatar--ink" style="${personAvatarStyle(u.uid||u.email)}">${escHtml(initialsOf(u.displayName||u.email))}</span>
        <span class="row__body">
          <span class="row__title">${escHtml(u.displayName || 'Ohne Name')}</span>
          <span class="row__sub">${escHtml(u.email || '')}</span>
        </span>
        <span class="row__end"><span class="role-badge">${u.isTimo ? 'Admin' : enabledCount + ' Module'}</span></span>
      </summary>
      <div class="admin-user__body">
        <div class="admin-mods">
          ${Object.values(MODULES).filter(m => manageableModuleKeys.includes(m.key)).map(m => `
            <label class="admin-mod" data-bereich="${BEREICH_OF[m.key] || ''}">
              <input type="checkbox" data-admin-allowed="${m.key}" ${allowed[m.key] ? 'checked' : ''} />
              <span class="admin-mod__icon">${icon(ICONS[m.key] ? m.key : 'bereiche', 15)}</span>
              <span>${escHtml(m.name)}</span>
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

  wrap.querySelectorAll('[data-admin-save]').forEach(btn => btn.addEventListener('click', async () => {
    const uid = btn.dataset.adminSave;
    const row = wrap.querySelector(`[data-admin-user="${CSS.escape(uid)}"]`);
    const allowedModulesNext = {};
    row.querySelectorAll('[data-admin-allowed]').forEach(cb => allowedModulesNext[cb.dataset.adminAllowed] = cb.checked);
    const isTimo = row.querySelector('[data-admin-timo]').checked;
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

      await updateDoc(doc(db, 'users', uid), {
        allowedModules: allowedModulesNext,
        isTimo
      });
      if (uid === user.uid) {
        profile = { ...profile, allowedModules: allowedModulesNext, isTimo };
        applyModules();
        syncPublicFeed();
      }
      await loadAppUsers(true);
      renderUserSuggestions();
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
    wrap.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-icon">📁</div><p class="empty-text">Noch keine Projekte. Füge dein erstes hinzu!</p></div>`;
    return;
  }
  items = sortProjects(items);
  wrap.innerHTML = items.map(p => `
    <div class="link-row project-row" data-project-row="${p.id}">
      <span class="link-icon">${escHtml(p.emoji || '🔗')}</span>
      <a class="link-title" href="${escHtml(p.url)}" target="_blank" rel="noopener">
        <span>${escHtml(p.name)}</span>
        <small>${p.isPublic ? 'Öffentlich' : 'Privat'}</small>
      </a>
      <div class="project-actions">
        <button class="action-btn ${p.isPublic ? 'action-btn--public' : ''}" data-pub="${p.id}" data-ispub="${p.isPublic ? '1':''}" title="${p.isPublic ? 'Veröffentlichung beenden' : 'Projekt veröffentlichen'}">
          <span>${p.isPublic ? ICON_GLOBE : ICON_LOCK}</span>
          <b>${p.isPublic ? 'Öffentlich' : 'Privat'}</b>
        </button>
        <button class="action-btn" data-edit="${p.id}" data-emoji="${escHtml(p.emoji||'')}" data-name="${escHtml(p.name)}" data-url="${escHtml(p.url)}" title="Projekt bearbeiten">
          <span>${ICON_PENCIL}</span><b>Bearbeiten</b>
        </button>
        <button class="action-btn action-btn--danger" data-del="${p.id}" title="Projekt löschen">
          <span>${ICON_CLOSE}</span><b>Löschen</b>
        </button>
      </div>
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
