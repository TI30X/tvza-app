/* ══════════════════════════════════════════════════════════════════
   Die Hülle — header and navigation, one copy for every page (§5).

   Before this, the app had three different headers: index.html used
   .app-brand + .header-actions, the tracker pages used .page-title with
   inline-styled emoji spans, and maturaarbeit.html had its own
   .header-top / .header-title-block. The gear even changed id between
   pages — #settingsBtn on index and watchlist, #profileBtn on
   foodtracker. A page also had no way to reach any other page except
   "Zurück" to the dashboard, so Food → Nachrichten took two steps.

   Every page now calls mountShell() and gets the same header and the
   same four-destination navigation. One breakpoint, 900px: below it the
   bar sits at the bottom, above it a 248px rail on the left with the
   Bereiche listed open, so a Bereich is one click and not two.

   Loaded as a module, because it reads MODULES from firebase-config.
   ══════════════════════════════════════════════════════════════════ */

import { MODULES, enabledModules } from './firebase-config.js';

/* ── Icons (§4.5) ──────────────────────────────────────────────────
   One set, Feather-like. The Bereich glyphs are the ones already in
   index.html — the handoff says to keep them. Everything that used an
   emoji as a *function* symbol is in here instead; emoji the user typed
   themselves stay untouched, because there they are content. */
export const ICONS = {
  start:    '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  nachrichten: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  bereiche: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',

  ski:     '<path d="M8 3l4 8 5-5 5 15H2L8 3z"/>',
  food:    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  watch:   '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  weather: '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  trip:    '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  matura:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  maturatracker: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  publicProjects: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  dm:      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',

  back:    '<path d="M15 18l-6-6 6-6"/>',
  gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  close:   '<path d="M18 6L6 18M6 6l12 12"/>',
  trash:   '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sun:     '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
};

/* Weather glyphs, keyed off WMO codes. index.html needed these in two
   separate places — the header pill and the dashboard tile — and had a
   full emoji ternary in each. One set, one mapping. */
export const WEATHER_GLYPHS = {
  sun:   '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  part:  '<path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4"/><circle cx="10" cy="10" r="3.2"/><path d="M17.5 19H8a4 4 0 1 1 1.1-7.85A5 5 0 0 1 19 13a3 3 0 0 1-1.5 6z"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  fog:   '<path d="M4 9h16M4 13h16M6 17h12"/>',
  rain:  '<path d="M18 9h-1.26A7 7 0 1 0 9 18h9a4.5 4.5 0 0 0 0-9z"/><path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2"/>',
  snow:  '<path d="M18 9h-1.26A7 7 0 1 0 9 18h9a4.5 4.5 0 0 0 0-9z"/><path d="M8 21h.01M12 21h.01M16 21h.01"/>',
  storm: '<path d="M18 9h-1.26A7 7 0 1 0 9 18h9a4.5 4.5 0 0 0 0-9z"/><path d="M13 17l-2.5 4h4L12 24"/>',
};

/** WMO weather code -> inline SVG. */
export function weatherIcon(code, size = 14) {
  const c = Number(code);
  const k = c === 0 ? 'sun'
    : (c === 1 || c === 2) ? 'part'
    : c === 3 ? 'cloud'
    : (c === 45 || c === 48) ? 'fog'
    : ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) ? 'rain'
    : ((c >= 71 && c <= 77) || c === 85 || c === 86) ? 'snow'
    : c >= 95 ? 'storm' : 'part';
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${WEATHER_GLYPHS[k]}</svg>`;
}

/** Inline SVG for one icon. */
export function icon(name, size = 18) {
  const d = ICONS[name];
  if (!d) return '';
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${d}</svg>`;
}

/* ── Which Bereich a module belongs to, for colour ─────────────────
   The keys in MODULES and the data-bereich values in the CSS are not
   quite the same set, so the mapping is explicit rather than guessed. */
const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura',
  publicProjects: 'kalender',
};

/* ── The four destinations (§5.2) ──────────────────────────────────*/
const TABS = [
  { id: 'start',       label: 'Start',       icon: 'start',       href: 'index.html' },
  { id: 'kalender',    label: 'Kalender',    icon: 'kalender',    href: 'pages/planner.html' },
  { id: 'nachrichten', label: 'Nachrichten', icon: 'nachrichten', href: 'pages/messages.html' },
  { id: 'bereiche',    label: 'Bereiche',    icon: 'bereiche',    href: 'pages/bereiche.html' },
];

/* "Eine Sache, ein Ort" (§6.4): ein Bereich, der schon einen der vier
   Tabs besitzt, darf nicht zusätzlich in der Bereichsliste stehen.
   Die Regel wohnt hier, weil shell.js und nav.js beide eine Leiste
   bauen — vorher hatte nur nav.js den Filter, und die Bereiche-Seite
   (die mountShell benutzt) zeigte darum Kalender und Nachrichten
   doppelt, die Startseite nicht. Aus TABS abgeleitet, damit die Listen
   nicht auseinanderlaufen. */
const TAB_HREFS = new Set(TABS.map(t => t.href));
export const ownsTab = key => TAB_HREFS.has(MODULES[key]?.page);
export function areaModuleKeys(profile) {
  const mods = profile ? enabledModules(profile) : {};
  return Object.keys(MODULES)
    .filter(key => mods[key] && MODULES[key].page && !ownsTab(key));
}

/* Pages sit either at the root or in /pages/, so links need a prefix. */
function base() {
  return location.pathname.includes('/pages/') ? '../' : './';
}

/** Which tab should be lit for the page we are on. */
function activeTab() {
  const f = location.pathname.split('/').pop() || 'index.html';
  if (f === '' || f === 'index.html') return 'start';
  if (f === 'planner.html') return 'kalender';
  if (f === 'messages.html') return 'nachrichten';
  return 'bereiche';   // every Bereich page belongs under Bereiche
}

let shellState = { unread: 0, profile: null };

/**
 * Put the header and the navigation on the page.
 *
 * @param {object}  o
 * @param {'tab'|'bereich'} o.variant  tab page or Bereich page
 * @param {string} [o.title]     Bereich pages: the centred title
 * @param {string} [o.bereich]   Bereich pages: colour key, e.g. 'food'
 * @param {string} [o.greeting]  Start: the greeting line
 * @param {string} [o.date]      Start: the date under the greeting
 * @param {string} [o.backHref]  Bereich pages: where the back arrow goes
 * @param {object} [o.profile]   for the avatar initials and the rail
 * @param {Function} [o.onSettings] gear handler; omit to hide the gear
 */
export function mountShell(o = {}) {
  const variant = o.variant || 'tab';
  const b = base();
  shellState.profile = o.profile || null;

  document.querySelectorAll('.appbar, .nav').forEach(el => el.remove());

  /* ── Header ─────────────────────────────────────────────────── */
  const bar = document.createElement('header');
  bar.className = 'appbar';
  if (o.bereich) bar.dataset.bereich = o.bereich;

  const initials = initialsOf(o.profile);

  if (variant === 'bereich') {
    bar.innerHTML = `
      <div class="appbar__inner">
        <button class="appbar__btn" id="shellBack" aria-label="Zurück">${icon('back')}</button>
        <span class="appbar__title">${esc(o.title || '')}</span>
        ${o.onSettings
          ? `<button class="appbar__btn" id="shellGear" aria-label="Einstellungen">${icon('gear')}</button>`
          : '<span class="appbar__btn" style="visibility:hidden"></span>'}
      </div>
      <div class="appbar__accent"></div>`;
  } else {
    const heading = o.greeting
      ? `<div class="appbar__greet">${esc(o.greeting)}</div>
         ${o.date ? `<div class="appbar__date">${esc(o.date)}</div>` : ''}`
      : `<div class="appbar__greet">${esc(o.title || '')}</div>`;
    bar.innerHTML = `
      <div class="appbar__inner">
        <div class="appbar__spacer">${heading}</div>
        <a class="wx-pill" id="shellWx" href="${b}pages/weather.html" style="display:none"></a>
        <button class="avatar" id="shellAvatar" aria-label="Konto">${esc(initials)}</button>
      </div>`;
  }
  document.body.insertBefore(bar, document.body.firstChild);

  /* ── Navigation ─────────────────────────────────────────────── */
  const active = activeTab();
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Hauptnavigation');

  const tabs = TABS.map(t => `
    <a class="nav__item${t.id === active ? ' is-active' : ''}" href="${b}${t.href}"
       data-nav-tab="${t.id}"
       ${t.id === active ? 'aria-current="page"' : ''}>
      ${icon(t.icon, 21)}
      <span>${t.label}</span>
      ${t.id === 'nachrichten' ? '<span class="nav__dot" hidden></span><span class="nav__count" hidden></span>' : ''}
    </a>`).join('');

  /* On a laptop the Bereiche are listed open under the tabs, so
     reaching one is a single click. On a phone they are not rendered
     at all — the Bereiche tab is the way there. */
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  const bereiche = areaModuleKeys(o.profile)
    .map(k => {
      const m = MODULES[k];
      const moduleFile = m.page.split('/').pop();
      const isCurrent = moduleFile === currentFile;
      return `<a class="nav__bereich${isCurrent ? ' is-active' : ''}" href="${b}${m.page}"
                 data-bereich="${BEREICH_OF[k] || ''}" ${isCurrent ? 'aria-current="page"' : ''}>
                <i>${icon(ICONS[k] ? k : 'bereiche', 14)}</i>
                <span class="nav__bereich-name">${esc(m.name)}</span>
                ${isCurrent ? '<span class="nav__current">Aktuell</span>' : ''}
              </a>`;
    }).join('');

  nav.innerHTML = tabs + (bereiche
    ? `<div class="nav__section marke">Bereiche</div><div class="nav__bereiche">${bereiche}</div>`
    : '') + (o.onSettings
    ? `<a class="nav__item nav__settings" id="shellNavSettings" href="#">${icon('gear', 21)}<span>Einstellungen</span></a>`
    : '');

  document.body.appendChild(nav);
  document.body.classList.add('has-nav');
  nav.addEventListener('click', event => {
    if (event.target.closest('a[aria-current="page"]')) event.preventDefault();
  });

  /* ── Wiring ─────────────────────────────────────────────────── */
  const backBtn = document.getElementById('shellBack');
  if (backBtn) backBtn.onclick = () => {
    if (o.backHref) location.href = o.backHref;
    else if (history.length > 1) history.back();
    else location.href = b + 'index.html';
  };
  const gear = document.getElementById('shellGear');
  if (gear && o.onSettings) gear.onclick = o.onSettings;
  const navSettings = document.getElementById('shellNavSettings');
  if (navSettings && o.onSettings) navSettings.onclick = e => { e.preventDefault(); o.onSettings(); };
  const avatar = document.getElementById('shellAvatar');
  if (avatar) avatar.onclick = o.onAccount || o.onSettings || null;

  setUnread(shellState.unread);
  return bar;
}

/** Unread messages: a dot on the phone, a number in the laptop rail. */
export function setUnread(n) {
  shellState.unread = n = Number(n) || 0;
  const dot = document.querySelector('.nav__dot');
  const count = document.querySelector('.nav__count');
  if (dot) dot.hidden = n < 1;
  if (count) { count.hidden = n < 1; count.textContent = n > 99 ? '99+' : String(n); }
}

/** The weather pill in the header. Hidden until there is something. */
export function setWeather(temp, condition) {
  const el = document.getElementById('shellWx');
  if (!el) return;
  if (temp === null || temp === undefined || temp === '') { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `${icon('sun', 14)}<span>${esc(String(temp))}</span>`;
  if (condition) el.title = condition;
}

function initialsOf(profile) {
  const name = (profile?.displayName || profile?.name || profile?.email || '').trim();
  if (!name) return '·';
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2);
  return letters.toUpperCase();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
