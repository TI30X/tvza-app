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

import { auth, db, MODULES, getProfile } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ICONS, icon, areaModuleKeys } from './shell.js?v=4';
import { mountSettingsLayer } from './settings-layer.js';
import { mountAppRouter } from './router.js?v=4';
import { mountGlobalReminderOverlay } from './reminders-overlay.js';

const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura', admin: 'admin',
  publicProjects: 'kalender',
};

const TABS = [
  { id: 'start',       label: 'Start',       icon: 'start',       href: 'index.html' },
  { id: 'kalender',    label: 'Kalender',    icon: 'kalender',    href: 'pages/planner.html' },
  { id: 'nachrichten', label: 'Nachrichten', icon: 'nachrichten', href: 'pages/messages.html' },
  { id: 'bereiche',    label: 'Bereiche',    icon: 'bereiche',    href: 'pages/bereiche.html' },
];

/* Die Regel "eine Sache, ein Ort" (§6.4) liegt in shell.js, weil beide
   Dateien eine Leiste bauen und sie sonst auseinanderlaufen. Hier nur
   weitergereicht, damit index.html und bereiche.html sie wie bisher
   von nav.js beziehen können. */
export { ownsTab } from './shell.js?v=4';

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

function areaLinks(profile) {
  const b = base();
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  return areaModuleKeys(profile)
    .map(k => {
      const isCurrent = MODULES[k].page.split('/').pop() === currentFile;
      return `
        <a class="nav__bereich${isCurrent ? ' is-active' : ''}" href="${b}${MODULES[k].page}"
           data-bereich="${BEREICH_OF[k] || ''}" ${isCurrent ? 'aria-current="page"' : ''}>
          <i>${icon(ICONS[k] ? k : 'bereiche', 14)}</i>
          <span class="nav__bereich-name">${esc(MODULES[k].name)}</span>
        </a>`;
    }).join('');
}

function refreshAreaNavigation(profile) {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const links = areaLinks(profile);
  let section = nav.querySelector('.nav__section');
  let list = nav.querySelector('.nav__bereiche');

  if (!links) {
    section?.remove();
    list?.remove();
    return;
  }
  if (!section) {
    section = document.createElement('div');
    section.className = 'nav__section marke';
    section.textContent = 'Bereiche';
    nav.appendChild(section);
  }
  if (!list) {
    list = document.createElement('div');
    list.className = 'nav__bereiche';
    nav.appendChild(list);
  }
  list.innerHTML = links;

  /* pushState may have moved the address bar into /pages/. Freeze the
     freshly rendered relative destinations now, just like the router
     does on first mount. */
  list.querySelectorAll('a[href]').forEach(link => { link.href = link.href; });
}

function mount(profile) {
  const profileName = String(profile?.displayName || profile?.name || '').trim();
  const appbar = document.querySelector('.appbar');
  if (appbar && profileName) appbar.dataset.profileName = profileName;
  if (profileName) {
    try { localStorage.setItem('tvza-name', profileName); } catch {}
  }
  const existingNav = document.querySelector('.nav');
  if (existingNav) {
    mountGlobalReminderOverlay();
    mountAppRouter(existingNav);
    return;
  }
  const b = base();
  const active = activeTab();

  const tabs = TABS.map(t => `
    <a class="nav__item${t.id === active ? ' is-active' : ''}" href="${b}${t.href}"
       data-nav-tab="${t.id}"
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
  const bereiche = areaLinks(profile);

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Hauptnavigation');
  nav.innerHTML = tabs + (bereiche
    ? `<div class="nav__section marke">Bereiche</div><div class="nav__bereiche">${bereiche}</div>`
    : '');

  document.body.appendChild(nav);
  mountGlobalReminderOverlay({ activeFile:location.pathname.split('/').pop() || 'index.html' });
  document.body.classList.add('has-nav');
  nav.addEventListener('click', event => {
    if (event.target.closest('a[aria-current="page"]')) event.preventDefault();
  });
  primeNavigation(profile, nav);
  mountAppRouter(nav);
}

/* Initialen wie auf der Startseite: erster Buchstabe des Vornamens und
   des letzten Namensteils. Vorher lief hier eine eigene Regel, die bei
   fehlendem Namen auf die E-Mail zurückfiel — daraus wurde aus
   tzanten@bluewin.ch ein "TB" statt "TZ". */
export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '·';
}

/* The pages remain deliberately small and independent, but the next
   destination can still be ready before it is clicked. Browsers that
   support cross-document view transitions use the matching CSS in
   style.css; the prefetch is a harmless speed-up for all others. */
function primeNavigation(profile, nav) {
  const b = base();
  const prefetched = new Set(
    [...document.querySelectorAll('link[data-tvza-prefetch]')]
      .map(link => link.dataset.tvzaPrefetch)
  );
  const hrefs = [
    ...TABS.map(tab => b + tab.href),
    ...areaModuleKeys(profile).map(key => b + MODULES[key].page),
  ];
  const warm = href => {
    if (!href || prefetched.has(href)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    link.dataset.tvzaPrefetch = href;
    link.fetchPriority = 'low';
    document.head.appendChild(link);
    prefetched.add(href);
  };
  [...new Set(hrefs)].forEach(warm);
  nav.addEventListener('pointerover', event => warm(event.target.closest('a[href]')?.getAttribute('href')));
  nav.addEventListener('focusin', event => warm(event.target.closest('a[href]')?.getAttribute('href')));
}

/* ══ Konto-Menü auf den Bereichsseiten ══════════════════════════════
   Die Startseite hat es im Markup; auf den acht Bereichsseiten standen
   stattdessen ein Sonne/Mond-Knopf und teils ein Zahnrad nebeneinander.
   Hier wird dasselbe Menü nachgerüstet — an einer Stelle statt in acht
   Dateien.

   Bereichsoptionen liegen inzwischen ebenfalls in dieser einen
   Einstellungsoberfläche. */
function mountAccountMenu(user, profile) {
  const bar = document.querySelector('.appbar--bereich .appbar__end');
  if (!bar || bar.querySelector('.acct')) return;

  /* Der Sonne/Mond-Knopf verschwindet: Erscheinungsbild und alle
     Bereichsoptionen stehen gemeinsam im einen Einstellungsdialog. */
  const theme = bar.querySelector('#themeToggle, [data-theme-toggle]');
  if (theme) theme.hidden = true;

  const name = profile?.displayName || user.displayName || user.email || 'Konto';
  const ini = initialsOf(name);

  const wrap = document.createElement('div');
  wrap.className = 'acct';
  wrap.innerHTML = `
    <button class="avatar" type="button" aria-haspopup="menu" aria-expanded="false" title="Konto"><span>${esc(ini)}</span></button>
    <div class="acct__menu" role="menu" hidden>
      <div class="acct__head">
        <span class="acct__who">${esc(name)}</span>
        <span class="acct__mail">${esc(user.email || '')}</span>
      </div>
      <button class="acct__item" data-act="settings" type="button" role="menuitem">
        <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Einstellungen</span></button>
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
    if (act === 'settings') window.tvzaOpenSettings?.();
    if (act === 'logout' && confirm('Abmelden?')) {
      try { localStorage.removeItem('tvza-name'); } catch {}
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signOut(auth);
      location.href = base() + 'login.html';
    }
  });
}

/* ══ Bildschirmtastatur ═════════════════════════════════════════════
   Die Tastatur verkleinert am Handy nur den sichtbaren Ausschnitt, nicht
   das Layout. Eine unten fest verankerte Leiste wird darum mit
   hochgeschoben und legt sich über das Eingabefeld. Die visualViewport-
   API meldet, wie viel Höhe die Tastatur wegnimmt; solange sie offen
   ist, tritt die Navigation zur Seite — beim Schreiben braucht sie
   ohnehin niemand. Fehlt die API, bleibt alles wie bisher. */
function watchKeyboard() {
  /* Nicht über die Viewporthöhe messen: mit
     interactive-widget=resizes-content schrumpft das Layout mit, die
     gemessene Überlappung ist dann null und die Tastatur bliebe
     unerkannt. Der verlässliche Hinweis ist der Fokus in einem
     Schreibfeld — den gibt es genau dann, wenn die Tastatur offen ist. */
  const writable = el => !!el && (
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable ||
    (el.tagName === 'INPUT' &&
      !/^(button|submit|reset|checkbox|radio|file|range|color|image)$/i.test(el.type || 'text'))
  );
  const sync = () => document.body.classList.toggle('kb-open', writable(document.activeElement));
  document.addEventListener('focusin', sync);
  // Kurz warten: beim Wechsel zwischen zwei Feldern liegt der Fokus
  // einen Moment nirgends, das darf die Leiste nicht aufblitzen lassen.
  document.addEventListener('focusout', () => setTimeout(sync, 80));
  sync();
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

/* Der Punkt war zwar gebaut, aber niemand hat setUnread je aufgerufen —
   er konnte darum nie erscheinen. Die Zahl kommt aus denselben Daten,
   die die Nachrichtenliste ohnehin führt: unread.<uid> pro Unterhaltung.
   Weil das hier in nav.js läuft, meldet sich eine neue Nachricht auf
   JEDER Seite, nicht nur in den Nachrichten selbst. Dieselbe Abfrage
   wie in messages.html, also von den Firestore-Regeln gedeckt. */
function watchUnread(user) {
  const q = query(collection(db, 'dms'), where('participants', 'array-contains', user.uid));
  onSnapshot(q, snap => {
    let n = 0;
    snap.forEach(d => { n += Number(d.data()?.unread?.[user.uid]) || 0; });
    setUnread(n);
  }, () => { /* offline oder keine Berechtigung: Punkt bleibt einfach aus */ });
}

const file = location.pathname.split('/').pop() || 'index.html';
if (!SKIP.includes(file)) {
  onAuthStateChanged(auth, async user => {
    if (!user) return;                       // signed out: requireAuth redirects
    let profile = null;
    try { profile = await getProfile(user); } catch { /* rail just stays empty */ }
    const framed = window.parent !== window &&
      new URLSearchParams(location.search).get('tvzaFrame') === '1';
    if (!framed) {
      const settingsLayer = mountSettingsLayer();
      window.tvzaOpenSettings = section => settingsLayer.open(section || '');
    }
    mount(profile);
    mountAccountMenu(user, profile);
    watchUnread(user);
    watchKeyboard();
    window.addEventListener('tvza-modules-change', event => {
      if (!event.detail || typeof event.detail !== 'object') return;
      profile = { ...(profile || {}), modules:event.detail };
      refreshAreaNavigation(profile);
    });
    onSnapshot(doc(db, 'users', user.uid), snapshot => {
      if (!snapshot.exists()) return;
      profile = snapshot.data();
      refreshAreaNavigation(profile);
    }, () => { /* preference events still provide an immediate fallback */ });
  });
}
