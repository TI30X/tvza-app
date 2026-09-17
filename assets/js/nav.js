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
import { ICONS, icon, areaModuleKeys, TABS, mountRail, kontoKnopf, setzeKonto } from './shell.js?v=30';
import { mountAppRouter } from './router.js?v=20';
import { mountGlobalReminderOverlay } from './reminders-overlay.js';
import { eigeneKarte, kartenNachtragen } from './personen.js';
import { beobachteUnterhaltungen } from './chat-stand.js';
import { ungelesenGesamt } from './chat-modell.js';
/* Die Tastatur misst jede Seite selbst (v.35.69.0, tastatur.js) — bis
   dahin stand der Beobachter hier, und Gruppe, Training, Einheit und
   Video laden nav.js nicht. */
import { tastaturBeobachten } from './tastatur.js';

const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura', admin: 'admin',
  training: 'training',
};

/* ── Sprache ────────────────────────────────────────────────────────
   Die Leiste entsteht im Code, nicht im Markup. Sie traegt darum
   dieselben data-i18n-Attribute wie eine statische Seite und wird nach
   dem Einhaengen einmal durch applyTo geschickt. Faellt i18n.js aus,
   bleiben die deutschen Beschriftungen im Template stehen. */
const label = (key, fallback) => window.TVZAI18n?.tOr(key, fallback) ?? fallback;
const relabel = root => window.TVZAI18n?.applyTo(root);

/* TABS, TAB_I18N und activeTab kommen aus shell.js. Sie standen hier
   frueher noch einmal woertlich — in denselben Zeilen, in denen der
   Kommentar unten davor warnt, dass beide Dateien auseinanderlaufen.
   Eine Liste, ein Ort. */

/* Die Regel "eine Sache, ein Ort" (§6.4) liegt in shell.js, weil beide
   Dateien eine Leiste bauen und sie sonst auseinanderlaufen. Hier nur
   weitergereicht, damit index.html sie wie bisher
   von nav.js beziehen können. */
export { ownsTab } from './shell.js?v=30';

/* Pages live either at the root or in /pages/. */
const base = () => (location.pathname.includes('/pages/') ? '../' : './');

/* Pages the navigation has no business on: the login screen, the public
   share page and the guest view, none of which are "inside" the app. */
const SKIP = ['login.html', 'public.html', 'guest.html'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Hier stand einmal die Bereichsliste der Seitenleiste. Sie ist weg,
   seit die Startseite sie traegt: auf einem Laptop standen die
   Bereiche sonst ZWEIMAL auf demselben Bildschirm, links und in der
   Mitte. "Eine Sache, ein Ort" (§6.4) gilt auch fuer Navigation.

   Der Preis ist ein Klick mehr von einer anderen Seite aus — genau
   der Weg, den ein Handy ohnehin immer geht. */

function mount(profile) {
  const profileName = String(profile?.displayName || profile?.name || '').trim();
  const appbar = document.querySelector('.appbar');
  if (appbar && profileName) appbar.dataset.profileName = profileName;
  if (profileName) {
    try { localStorage.setItem('tvza-name', profileName); } catch {}
  }
  /* Eine Seite, die ihre Leiste schon hat (mountShell), bekommt nur
     noch Router und Erinnerungen — sonst stuende sie zweimal da. */
  const existingNav = document.querySelector('.nav');
  if (existingNav) {
    setzeKonto(profile);
    mountGlobalReminderOverlay();
    mountAppRouter(existingNav);
    return;
  }
  /* Bis v.35.23.0 baute nav.js hier eine eigene, magere Leiste: nur
     die vier Tabs, ohne Marke, ohne Einklappen, ohne Konto. Auf Start
     sah die Leiste darum anders aus als auf Gruppe. Jetzt ist es
     derselbe Baustein. */
  const nav = mountRail({ profile });
  primeNavigation(profile, nav);
}

/* Der dritte Tab (Name der aktiven Gruppe, "Gruppe wechseln") steht seit
   v.35.31.0 in shell.js, gruppeInDerLeiste() — hier lief er nur auf den
   Seiten, die nav.js laden, und die Gruppenseite gehoert nicht dazu. */

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
  setzeKonto(profile, user?.email);
  /* Start traegt sein Konto-Menue im eigenen Markup (index.html,
     #acct); die Bereichsseiten bekommen es hier. Ein Kopf, der schon
     eins hat, bekommt kein zweites. */
  const bar = document.querySelector('.appbar__end');
  if (!bar || document.querySelector('.appbar .acct')) return;

  /* Der Sonne/Mond-Knopf verschwindet: Erscheinungsbild und alle
     Bereichsoptionen stehen gemeinsam im einen Einstellungsdialog. */
  const theme = bar.querySelector('#themeToggle, [data-theme-toggle]');
  if (theme) theme.hidden = true;

  const wrap = kontoKnopf('kopf');
  bar.appendChild(wrap);
  relabel(wrap);
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
/* Seit v.35.61.0 aus chat-stand.js: dazu die Gruppenchats und der Chat
   jeder Gruppe, und stumme Unterhaltungen zählen nicht (Michel: "man
   sollte bestimmte Chats stummschalten können"). */
function watchUnread(user) {
  beobachteUnterhaltungen(user.uid, liste => setUnread(ungelesenGesamt(liste)));
}

const file = location.pathname.split('/').pop() || 'index.html';
if (!SKIP.includes(file)) {
  onAuthStateChanged(auth, async user => {
    if (!user) return;                       // signed out: requireAuth redirects
    let profile = null;
    try { profile = await getProfile(user); } catch { /* rail just stays empty */ }
    mount(profile);
    mountAccountMenu(user, profile);
    /* Die Namenskarte (personen.js, seit v.35.47.0): hier, weil nav.js
       auf jeder Seite läuft — wer nur je die Gruppe öffnet, bekommt sie
       genauso. Der Admin trägt dabei einmal am Tag die fehlenden Karten
       der anderen nach. Beides still: scheitert es, bleibt die Seite,
       wie sie ist. */
    if (profile && Object.keys(profile).length) {
      void eigeneKarte(user.uid, profile);
      if (profile.isTimo === true) kartenNachtragen().catch(() => {});
    }
    watchUnread(user);
    tastaturBeobachten();
    /* Hier stand zweimal refreshAreaNavigation(profile) — eine
       Funktion, die v.35.19.0 geloescht hatte. Der Aufruf ins Leere war
       syntaktisch gueltig und warf erst zur Laufzeit, bei JEDEM Laden
       einer Seite: der erste Snapshot kommt immer. Die Leiste zeichnet
       keine Bereiche mehr; es bleibt, das Profil nachzufuehren, damit
       das Vorladen die aktuelle Auswahl kennt. */
    window.addEventListener('tvza-modules-change', event => {
      if (!event.detail || typeof event.detail !== 'object') return;
      profile = { ...(profile || {}), modules:event.detail };
    });
    onSnapshot(doc(db, 'users', user.uid), snapshot => {
      if (!snapshot.exists()) return;
      profile = snapshot.data();
      setzeKonto(profile, user.email);
    }, () => { /* preference events still provide an immediate fallback */ });
  });
}
