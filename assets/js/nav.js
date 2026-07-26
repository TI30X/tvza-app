/* ══════════════════════════════════════════════════════════════════
   Navigation, dropped onto a page with one line:

       <script type="module" src="../assets/js/nav.js"></script>

   This is the half of the Hülle (§5.2) that can go in without touching
   a single existing page script. It mounts the four-destination
   navigation and nothing else — the legacy <header> on each page stays
   exactly where it is, so every handler that binds to .back-btn,
   #settingsBtn or #profileBtn keeps working.

   The unified header (§5.1) replaces those elements and therefore has
   to be done page by page; this does not wait for it. It fixes the
   finding that actually costs the family something every day: from any
   sub-page the only way out was "Zurück" to the dashboard, so Food to
   Nachrichten was two steps through the start page.

   Self-contained on purpose: it resolves auth and the profile itself
   rather than being handed them, so adding it to a page cannot break
   that page.
   ══════════════════════════════════════════════════════════════════ */

import { auth, MODULES, enabledModules, getProfile } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ICONS, icon } from './shell.js';

const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura',
  publicProjects: 'kalender',
};

const TABS = [
  { id: 'start',       label: 'Start',       icon: 'start',       href: 'index.html' },
  { id: 'kalender',    label: 'Kalender',    icon: 'kalender',    href: 'pages/planner.html' },
  { id: 'nachrichten', label: 'Nachrichten', icon: 'nachrichten', href: 'pages/messages.html' },
  { id: 'bereiche',    label: 'Bereiche',    icon: 'bereiche',    href: 'pages/bereiche.html' },
];

/* "Eine Sache, ein Ort" (§6.4): a Bereich that already owns one of the
   four tabs must not be listed a second time — not in the Bereiche tab,
   not in the laptop rail, not in the Schnellzugriff. Derived from TABS
   rather than written out, so the two lists cannot drift apart when a
   tab is added or its target changes. Today this covers trip (Kalender)
   and dm (Nachrichten). */
const TAB_HREFS = new Set(TABS.map(t => t.href));
export const ownsTab = key => TAB_HREFS.has(MODULES[key]?.page);

/* Pages live either at the root or in /pages/. */
const base = () => (location.pathname.includes('/pages/') ? '../' : './');

function activeTab() {
  const f = location.pathname.split('/').pop() || 'index.html';
  if (f === '' || f === 'index.html') return 'start';
  if (f === 'planner.html') return 'kalender';
  if (f === 'messages.html') return 'nachrichten';
  return 'bereiche';
}

/* Pages the navigation has no business on: the login screen, the public
   share page and the guest view, none of which are "inside" the app. */
const SKIP = ['login.html', 'public.html', 'guest.html'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mount(profile) {
  if (document.querySelector('.nav')) return;
  const b = base();
  const active = activeTab();

  const tabs = TABS.map(t => `
    <a class="nav__item${t.id === active ? ' is-active' : ''}" href="${b}${t.href}"
       ${t.id === active ? 'aria-current="page"' : ''}>
      ${icon(t.icon, 21)}
      <span>${t.label}</span>
      ${t.id === 'nachrichten'
        ? '<span class="nav__dot" hidden></span><span class="nav__count" hidden></span>'
        : ''}
    </a>`).join('');

  /* On a laptop the Bereiche are listed open beneath the tabs, so a
     Bereich is one click instead of two. On a phone they are not
     rendered — that is what the Bereiche tab is for. */
  const mods = profile ? enabledModules(profile) : {};
  const bereiche = Object.keys(MODULES)
    .filter(k => mods[k] && MODULES[k].page && !ownsTab(k))
    .map(k => `
      <a class="nav__bereich" href="${b}${MODULES[k].page}" data-bereich="${BEREICH_OF[k] || ''}">
        <i>${icon(ICONS[k] ? k : 'bereiche', 14)}</i><span>${esc(MODULES[k].name)}</span>
      </a>`).join('');

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Hauptnavigation');
  nav.innerHTML = tabs + (bereiche
    ? `<div class="nav__section marke">Bereiche</div><div class="nav__bereiche">${bereiche}</div>`
    : '');

  document.body.appendChild(nav);
  document.body.classList.add('has-nav');
}

/** Unread count: a dot on the phone, a number in the laptop rail. */
export function setUnread(n) {
  n = Number(n) || 0;
  const dot = document.querySelector('.nav__dot');
  const count = document.querySelector('.nav__count');
  if (dot) dot.hidden = n < 1;
  if (count) { count.hidden = n < 1; count.textContent = n > 99 ? '99+' : String(n); }
}
window.tvzaSetUnread = setUnread;   // so page scripts can call it without importing

const file = location.pathname.split('/').pop() || 'index.html';
if (!SKIP.includes(file)) {
  onAuthStateChanged(auth, async user => {
    if (!user) return;                       // signed out: requireAuth redirects
    let profile = null;
    try { profile = await getProfile(user); } catch { /* rail just stays empty */ }
    mount(profile);
  });
}
