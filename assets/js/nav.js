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

/* ══ Konto-Menü auf den Bereichsseiten ══════════════════════════════
   Die Startseite hat es im Markup; auf den acht Bereichsseiten standen
   stattdessen ein Sonne/Mond-Knopf und teils ein Zahnrad nebeneinander.
   Hier wird dasselbe Menü nachgerüstet — an einer Stelle statt in acht
   Dateien.

   Die alten Knöpfe bleiben im DOM und werden nur versteckt: jede
   Seite hat eigene Handler daran hängen (foodtracker öffnet sein
   Profil, watchlist seine Einstellungen). Der Menüeintrag löst den
   Originalknopf per click() aus, statt seine Logik nachzubauen — so
   kann hier nichts kaputtgehen, was vorher lief. */
function mountAccountMenu(user, profile) {
  const bar = document.querySelector('.appbar--bereich .appbar__end');
  if (!bar || bar.querySelector('.acct')) return;

  const theme = bar.querySelector('#themeToggle, [data-theme-toggle]');
  const settings = bar.querySelector('#profileBtn, #settingsBtn');
  [theme, settings].forEach(b => { if (b) b.hidden = true; });

  const name = profile?.name || user.displayName || user.email || 'Konto';
  const ini = (name.match(/\b\p{L}/gu) || ['·']).slice(0, 2).join('').toUpperCase();

  const wrap = document.createElement('div');
  wrap.className = 'acct';
  wrap.innerHTML = `
    <button class="avatar" type="button" aria-haspopup="menu" aria-expanded="false" title="Konto"><span>${esc(ini)}</span></button>
    <div class="acct__menu" role="menu" hidden>
      <div class="acct__head">
        <span class="acct__who">${esc(name)}</span>
        <span class="acct__mail">${esc(user.email || '')}</span>
      </div>
      ${theme ? `<button class="acct__item" data-act="theme" type="button" role="menuitem">
        <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg>
        <span>Design</span></button>` : ''}
      ${settings ? `<button class="acct__item" data-act="settings" type="button" role="menuitem">
        <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Einstellungen</span></button>` : ''}
      <button class="acct__item acct__item--danger" data-act="logout" type="button" role="menuitem">
        <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
        <span>Abmelden</span></button>
    </div>`;
  bar.appendChild(wrap);

  const btn = wrap.querySelector('.avatar');
  const menu = wrap.querySelector('.acct__menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  menu.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'theme')    theme.click();
    if (act === 'settings') settings.click();
    if (act === 'logout' && confirm('Abmelden?')) {
      try { localStorage.removeItem('tvza-name'); } catch {}
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signOut(auth);
      location.href = base() + 'login.html';
    }
  });
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
    mountAccountMenu(user, profile);
  });
}
