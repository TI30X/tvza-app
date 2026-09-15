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

import { auth, MODULES, enabledModules, imKreis } from './firebase-config.js';
import { mountSettingsLayer } from './settings-layer.js';
import { frage } from './dialog.js';
import { mountAppRouter, basisTitel, basisTitelWahl } from './router.js?v=15';
import { zeichen, wort, softwareZeigen, markeSetzen, aktuelleMarke, seiteMarkieren } from './wechsel.js';
import { mountGlobalReminderOverlay } from './reminders-overlay.js';
import { WORKER_BASIS } from './worker-config.js';
// Notifications belong to the shared shell, not to individual Bereich pages.
// The module skips content frames, so routed pages mount exactly one bell.
import './notifications.js';

/* ── Icons (§4.5) ──────────────────────────────────────────────────
   One set, Feather-like. The Bereich glyphs are the ones already in
   index.html — the handoff says to keep them. Everything that used an
   emoji as a *function* symbol is in here instead; emoji the user typed
   themselves stay untouched, because there they are content. */
export const ICONS = {
  start:    '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  nachrichten: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  gruppe:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bereiche: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',

  ski:     '<path d="M8 3l4 8 5-5 5 15H2L8 3z"/>',
  food:    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  watch:   '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  weather: '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  trip:    '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  matura:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  maturatracker: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  admin:   '<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
  training: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  dm:      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',

  back:    '<path d="M15 18l-6-6 6-6"/>',
  gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  bell:    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  close:   '<path d="M18 6L6 18M6 6l12 12"/>',
  trash:   '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sun:     '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  /* Die Leiste ein- und ausklappen. Absichtlich KEIN Pfeil: neben dem
     Zurueck-Pfeil im Kopf standen sonst zwei gleiche Winkel nebeneinander,
     die zwei verschiedene Dinge taten. */
  leiste:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  abmelden: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  /* Zwei Pfeile gegeneinander: zwischen Gruppen wechseln. */
  wechsel: '<path d="M7 4v14"/><path d="m3 14 4 4 4-4"/><path d="M17 20V6"/><path d="m13 10 4-4 4 4"/>',
};

/* Weather glyphs, keyed off WMO codes. index.html needed these in two
   separate places — the header pill and the dashboard tile — and had a
   full emoji ternary in each. One set, one mapping. */
export const WEATHER_GLYPHS = {
  sun:   '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  part:  '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
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
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura', admin: 'admin',
  training: 'training',
};

/* ── The four destinations (§5.2) ──────────────────────────────────*/
/* ── Sprache ────────────────────────────────────────────────────────
   Die Leiste entsteht im Code, nicht im Markup. Sie traegt darum
   dieselben data-i18n-Attribute wie eine statische Seite und wird nach
   dem Einhaengen einmal durch applyTo geschickt. Faellt i18n.js aus,
   bleiben die deutschen Beschriftungen im Template stehen. */
const TAB_I18N = { start:'nav.start', kalender:'nav.kalender',
                   gruppe:'nav.gruppe', chat:'nav.chat' };
const label = (key, fallback) => window.TVZAI18n?.tOr(key, fallback) ?? fallback;
const relabel = root => window.TVZAI18n?.applyTo(root);

/* ── Die vier Orte ─────────────────────────────────────────────────
   Mir, Zeit, Uns, Reden. Jeder Tab ist ein Ort, kein Sammelbecken.

   Diese Liste ist die EINZIGE. Sie stand bis hierher zweimal — einmal
   hier und einmal in nav.js —, obwohl der Kommentar unter ihr davor
   warnt, dass die beiden auseinanderlaufen. nav.js importiert sie
   jetzt, statt sie zu wiederholen.

   'gruppe' traegt hier nur eine Rueckfallbeschriftung. Im Betrieb
   heisst der Tab wie die Gruppe selbst — "Ski Team Malbun", "Familie
   van Zanten" —, denn er IST die Gruppe und nicht eine Funktion.
   setzeGruppenTab() traegt den Namen nach, sobald er geladen ist.

   'bereiche' hat keinen Tab. Die Module wohnen im privaten Start,
   und "eine Sache, ein Ort" gilt auch fuer sie.

   pages/bereiche.html gab es einmal daneben; sie war zuletzt von
   nirgends verlinkt und ist seit v.35.13.0 geloescht. Ihr Inhalt —
   die Liste der eingeschalteten Bereiche — steht auf Start. */
export const TABS = [
  { id: 'start',    label: 'Start',    icon: 'start',    href: 'index.html' },
  { id: 'kalender', label: 'Kalender', icon: 'kalender', href: 'pages/planner.html' },
  { id: 'gruppe',   label: 'Gruppe',   icon: 'gruppe',   href: 'pages/gruppe.html' },
  { id: 'chat',     label: 'Chat',     icon: 'nachrichten', href: 'pages/messages.html' },
];

export { TAB_I18N };

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

/* Hier standen shellAreaLinks und refreshShellAreaNavigation — die
   offene Bereichsliste der Laptop-Leiste. Sie sind weg, seit die
   Startseite die Bereiche traegt: sonst stehen sie zweimal auf
   demselben Bildschirm.

   areaModuleKeys bleibt: nav.js baut daraus weiterhin die Liste der
   Seiten, die vorgeladen werden duerfen. */

/** Which tab should be lit for the page we are on. */
export function activeTab() {
  const f = location.pathname.split('/').pop() || 'index.html';
  if (f === '' || f === 'index.html') return 'start';
  if (f === 'planner.html') return 'kalender';
  if (f === 'gruppe.html') return 'gruppe';
  if (f === 'messages.html') return 'chat';
  /* Jede Bereichsseite gehoert zum privaten Start. Vorher zeigte sie auf
     den Bereiche-Tab; den gibt es nicht mehr, und "irgendwo unterwegs
     leuchtet gar nichts" waere schlechter als die Wahrheit — ein Bereich
     IST ein Teil von Start. */
  return 'start';
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
 */
export function mountShell(o = {}) {
  const variant = o.variant || 'tab';
  const b = base();
  shellState.profile = o.profile || null;

  document.querySelectorAll('.appbar, .nav').forEach(el => el.remove());

  /* ── Kopf ───────────────────────────────────────────────────────
     Auf jeder Seite dasselbe: links der Titel, rechts das, was nur
     diese Seite braucht, und — nur am Handy — das Konto. Am Laptop
     traegt die Leiste das Konto; zwei Wege zu den Einstellungen auf
     einem Bildschirm waren einer zu viel.

     Einen Zurueck-Pfeil haben nur Unterseiten (eine Einheit, eine
     Videoanalyse). Ein Tab ist kein Ort, von dem man zurueckgeht. */
  const bar = document.createElement('header');
  bar.className = variant === 'bereich' ? 'appbar appbar--unter' : 'appbar';
  if (o.bereich) bar.dataset.bereich = o.bereich;

  const titel = o.greeting
    ? `<div class="appbar__greet">${esc(o.greeting)}</div>
       ${o.date ? `<div class="appbar__date">${esc(o.date)}</div>` : ''}`
    : `<span class="appbar__title">${esc(o.title || '')}</span>`;

  bar.innerHTML = `
    <div class="appbar__inner">
      ${variant === 'bereich'
        ? `<button class="appbar__btn" id="shellBack" type="button" data-i18n-attr="aria-label:a11y.zurueck" aria-label="Zurück">${icon('back')}</button>`
        : ''}
      <div class="appbar__spacer">${titel}</div>
      <span class="appbar__end">
        ${variant === 'tab' ? `<a class="wx-pill" id="shellWx" href="${b}pages/weather.html" style="display:none"></a>` : ''}
      </span>
    </div>`;
  document.body.insertBefore(bar, document.body.firstChild);
  const ende = bar.querySelector('.appbar__end');
  ende.appendChild(kontoKnopf('kopf'));
  /* Die Glocke legt notifications.js an, sobald die Anmeldung steht.
     Auf einer Seite mit mountShell ist der Kopf dann manchmal noch nicht
     gebaut, und die Glocke schwebte mit position:fixed ueber allem — am
     Handy genau ueber dem Konto-Kreis, der dadurch nicht mehr zu
     treffen war. Der Kopf gehoert shell.js, also holt shell.js sie
     herein. Kommt sie spaeter, findet notifications.js .appbar__end. */
  const schwebend = document.querySelector('.tvzn-bell.tvzn-float');
  if (schwebend) {
    schwebend.classList.remove('tvzn-float');
    ende.insertBefore(schwebend, ende.querySelector('.acct'));
  }
  relabel(bar);

  mountRail({ profile: o.profile });

  const backBtn = document.getElementById('shellBack');
  if (backBtn) backBtn.onclick = () => {
    if (o.backHref) location.href = o.backHref;
    else if (history.length > 1) history.back();
    else location.href = b + 'index.html';
  };

  if (window.tvzaShellModulesHandler) {
    window.removeEventListener('tvza-modules-change', window.tvzaShellModulesHandler);
  }
  /* Die Huelle merkt sich die neue Auswahl, zeichnet aber nichts
     nach: in der Leiste steht kein Bereich mehr. Die Startseite hoert
     auf dasselbe Ereignis und zieht ihre Liste nach. */
  window.tvzaShellModulesHandler = event => {
    if (!event.detail || typeof event.detail !== 'object') return;
    shellState.profile = { ...(shellState.profile || {}), modules:event.detail };
  };
  window.addEventListener('tvza-modules-change', window.tvzaShellModulesHandler);

  setUnread(shellState.unread);
  return bar;
}

/* ══ Die Leiste ═════════════════════════════════════════════════════
   EIN Baustein fuer alle Seiten. Bis v.35.23.0 bauten zwei Dateien je
   eine eigene: shell.js die volle (Marke, Einklappen, Einstellungen)
   fuer drei Seiten, nav.js eine magere mit nur den vier Tabs fuer alle
   anderen. Auf Start sah die Leiste darum anders aus als auf Gruppe.

   Aufbau am Laptop, von oben nach unten: Zeichen und Wortmarke, die
   vier Tabs, und am Fuss das Konto und der Klappknopf. Das Konto am
   Fuss ist der EINE Weg zu den Einstellungen auf diesem Bildschirm.
   Am Handy liegt die Leiste unten, und Kopf und Fuss der Leiste
   verschwinden — dort traegt der Kopf der Seite das Konto. */
export function mountRail({ profile = null } = {}) {
  sichereEinstellungen();

  const vorhanden = document.querySelector('.nav');
  if (vorhanden) {
    setzeKonto(profile);
    return vorhanden;
  }

  const b = base();
  const active = activeTab();
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', label('nav.haupt', 'Hauptnavigation'));
  nav.dataset.i18nAttr = 'aria-label:nav.haupt';

  const tabs = TABS.map(t => `
    <a class="nav__item${t.id === active ? ' is-active' : ''}" href="${b}${t.href}"
       data-nav-tab="${t.id}" title="${t.label}" data-i18n-attr="title:${TAB_I18N[t.id]}"
       ${t.id === active ? 'aria-current="page"' : ''}>
      ${icon(t.icon, 20)}
      <span class="nav__wort" data-i18n="${TAB_I18N[t.id]}">${t.label}</span>${t.id === 'gruppe' ? `
      <span class="nav__wort nav__wort--mehrere" data-i18n="nav.gruppen">${label('nav.gruppen', 'Gruppen')}</span>` : ''}
      ${t.id === 'chat' ? '<span class="nav__dot" hidden></span><span class="nav__count" hidden></span>' : ''}
    </a>${t.id === 'gruppe' ? `
    <button class="nav__wechsel" type="button" data-gruppe-wechsel hidden
            title="${label('grp.wechseln', 'Gruppe wechseln')}"
            data-i18n-attr="title:grp.wechseln;aria-label:grp.wechseln" aria-label="${label('grp.wechseln', 'Gruppe wechseln')}">
      ${icon('wechsel', 16)}
      <span class="nav__wort" data-i18n="grp.wechseln">${label('grp.wechseln', 'Gruppe wechseln')}</span>
    </button>
    <div class="nav__gruppen" data-gruppen-liste hidden></div>` : ''}`).join('');

  /* Das Zeichen steht links vom Wort und bleibt stehen, wenn die
     Leiste zuklappt — in 64 Pixeln bricht "Firn" um, das Zeichen
     nicht. Zeichen und Wort sagen, in welcher Software man ist: Firn
     oder TVZA (wechsel.js). Das Zeichen ist darum ein SVG im Dokument,
     kein <img> — es verwandelt sich beim Wechsel. */
  nav.innerHTML = `
    <a class="nav__kopf" href="${b}index.html" aria-label="Firn — Start"></a>
    ${tabs}
    <div class="nav__fuss">
      <button class="nav__klapp" id="shellNavKlapp" type="button"
              data-i18n-attr="title:nav.einklappen;aria-label:nav.einklappen"
              title="Leiste einklappen" aria-label="Leiste einklappen" aria-expanded="true">
        ${icon('leiste', 18)}
        <span class="nav__wort" data-i18n="nav.einklappen">Leiste einklappen</span>
      </button>
    </div>`;
  nav.querySelector('.nav__fuss').prepend(kontoKnopf('leiste'));
  /* Die Marke hängt an der Person (wechsel.js, v.35.52.0): im TVZA-Kreis
     überall TVZA, sonst überall Firn. Ohne geladenes Profil gilt, was
     das Gerät zuletzt wusste. */
  if (profile && Object.keys(profile).length) markeSetzen(imKreis(profile));
  seiteMarkieren(document);
  const software = aktuelleMarke();
  const kopfZeichen = zeichen(software);
  kopfZeichen.classList.add('nav__zeichen');
  const kopfWort = wort();
  kopfWort.classList.add('nav__marke');
  nav.querySelector('.nav__kopf').append(kopfZeichen, kopfWort);

  document.body.appendChild(nav);
  relabel(nav);
  setzeKonto(profile);

  const currentFile = location.pathname.split('/').pop() || 'index.html';
  mountGlobalReminderOverlay({ activeFile:currentFile });
  document.body.classList.add('has-nav');
  nav.addEventListener('click', event => {
    if (event.target.closest('a[aria-current="page"]')) event.preventDefault();
  });
  /* Beim Bauen ohne Bewegung; ändert sich die Marke später (Profil
     kommt, jemand ist neu im Kreis), verwandelt sich die Leiste einmal. */
  softwareZeigen(software);
  mountAppRouter(nav);
  verkabelLeiste();
  gruppeInDerLeiste(nav);
  pilleLaden();
  return nav;
}

/* ══ Die Gruppe in der Leiste ═══════════════════════════════════════
   Der Gruppe-Tab traegt den Namen der aktiven Gruppe, und wer in mehr
   als einer ist, bekommt darunter "Gruppe wechseln".

   Am Laptop stehen die Gruppen seit v.35.49.0 als Liste unter dem Tab
   (der dann "Gruppen" heisst): wer in Kader und Familie ist, wechselt
   mit einem Klick, statt erst einen Dialog zu oeffnen. Darunter, leise,
   "+ Neue Gruppe" — Athleten brauchen das selten, darum kein Knopf.
   Zugeklappt und am Handy bleibt der Wechsel wie er war.

   Das stand bis v.35.30.0 in nav.js — und nav.js laeuft auf der
   Gruppenseite, im Training, in Einheit und Video gar nicht. Dort hiess
   der Tab darum "Gruppe", anderswo "BSV Kader". Jetzt baut die Leiste
   es selbst, auf jeder Seite gleich.

   Alles in try/catch, das im Fehlerfall NICHTS tut: fehlt der Index
   fuer die Mitgliedschaften noch, bleibt der Tab bei "Gruppe" und
   funktioniert weiter. */
function gruppeInDerLeiste(nav) {
  const tab = nav.querySelector('[data-nav-tab="gruppe"]');
  const wechsel = nav.querySelector('[data-gruppe-wechsel]');
  const liste = nav.querySelector('[data-gruppen-liste]');
  if (!tab || !wechsel || typeof auth?.onAuthStateChanged !== 'function') return;

  let gruppen = [];
  let abo = null;
  let zeichne = () => {};
  /* Einmal angebunden, nicht bei jeder Anmeldung ein weiteres Mal. */
  window.addEventListener('firn-gruppe', () => zeichne());
  auth.onAuthStateChanged(async user => {
    abo?.(); abo = null;
    if (!user) return;
    try {
      const groups = await import('./groups.js');
      const wahl = await import('./gruppenwahl.js');
      zeichne = () => {
        const aktiv = groups.waehleAktive(gruppen);
        const feld = tab.querySelector('.nav__wort');
        wechsel.hidden = gruppen.length < 2;
        tab.classList.toggle('hat-gruppenliste', gruppen.length > 1);
        if (liste) {
          const stil = wahl.gruppenStil(gruppen);
          const hier = activeTab() === 'gruppe';
          /* Ohne Gruppe zeigt die Gruppenseite selbst, wie man eine anlegt. */
          liste.hidden = !gruppen.length;
          liste.innerHTML = (gruppen.length > 1 ? gruppen.map(g => `
            <a class="nav__gruppe${g.id === aktiv?.id ? ' is-aktiv' : ''}" href="${esc(tab.getAttribute('href'))}"
               data-gruppe-id="${esc(g.id)}" title="${esc(g.name || '')}" style="${stil(g.id)}"
               ${g.id === aktiv?.id && hier ? 'aria-current="page"' : ''}>
              <span class="nav__gruppe-zeichen" aria-hidden="true">${esc(wahl.kuerzel(g.name))}</span>
              <span class="nav__gruppe-name">${esc(g.name || label('nav.gruppe', 'Gruppe'))}</span>
            </a>`).join('') : '') + `
            <a class="nav__gruppe nav__gruppe--neu" href="${esc(tab.getAttribute('href'))}?anlegen=1" data-gruppe-neu>
              <span class="nav__gruppe-zeichen" aria-hidden="true">+</span>
              <span class="nav__gruppe-name">${esc(label('nav.neueGruppe', 'Neue Gruppe'))}</span>
            </a>`;
        }
        if (!feld) return;
        if (!aktiv) {
          /* Ohne Gruppe bleibt die Rueckfallbeschriftung — der Tab fuehrt
             trotzdem hin, denn dort steht, wie man eine anlegt. */
          feld.textContent = label('nav.gruppe', 'Gruppe');
          feld.dataset.i18n = 'nav.gruppe';
          return;
        }
        /* Ein eigener Name wird nicht uebersetzt: data-i18n muss weg,
           sonst schreibt der naechste Sprachwechsel "Gruppe" darueber. */
        delete feld.dataset.i18n;
        feld.textContent = aktiv.name;
        tab.title = aktiv.name;
      };
      abo = groups.beobachteMeineGruppen(user.uid, liste => {
        gruppen = liste;
        /* Die Pille des Assistenten (ki-pille.js) nimmt dieselbe Liste —
           kein zweites Lesen, nur um einen Namen zu kennen. */
        window.__firnGruppen = liste;
        window.dispatchEvent(new CustomEvent('firn-gruppen'));
        zeichne();
      });
      liste?.addEventListener('click', event => {
        const zeile = event.target.closest('[data-gruppe-id]');
        if (!zeile) return;
        event.preventDefault();
        groups.aktiveGruppeSetzen(zeile.dataset.gruppeId);
        /* Auf der Gruppenseite schaltet firn-gruppe um; sonst dorthin. */
        if (activeTab() !== 'gruppe') zurGruppe(tab.href);
      });
      wechsel.onclick = async () => {
        const { gruppeWaehlen } = await import('./gruppenwahl.js');
        const gid = await gruppeWaehlen(gruppen, groups.waehleAktive(gruppen)?.id, {
          rolleWort: groups.wort, setzen: groups.aktiveGruppeSetzen,
        });
        /* Auf der Gruppenseite zeichnet die Seite selbst neu (sie hoert
           auf firn-gruppe); von anderswo fuehrt die Wahl dorthin. */
        if (gid && activeTab() !== 'gruppe') zurGruppe(tab.href);
      };
    } catch { /* siehe oben: der Tab bleibt, wie er ist */ }
  });
}

/* Der Assistent (v.35.53.0): eine Pille über jeder Seite — nur im
   obersten Dokument, nie in einem Rahmen des Routers, und nur, wenn es
   einen Worker gibt. Geladen erst hier, damit eine Seite ohne Assistent
   nichts davon mitschleppt. */
function pilleLaden() {
  if (imRahmen() || !(globalThis.FIRN_KI_BASIS || WORKER_BASIS)) return;
  import('./ki-pille.js').then(m => m.pilleZeigen()).catch(() => { /* ohne Pille geht alles weiter */ });
}

/* Zur Gruppe: über den Router, wenn er läuft — sonst lud der Wechsel
   aus der Leiste die ganze Seite neu (v.35.53.0). */
function zurGruppe(href) {
  if (!window.tvzaNavigate?.(href)) location.href = href;
}

/* Einstellungen muessen sich von jeder Seite oeffnen lassen. Bisher
   tat das nur nav.js — eine Seite mit mountShell und ohne nav.js
   (gruppe.html direkt geoeffnet) hatte ein Zahnrad, das nichts tat.
   Im Rahmen des Routers leitet router.js die Anfrage nach oben
   weiter; dort darf hier nichts ueberschrieben werden. */
function sichereEinstellungen() {
  if (typeof window.tvzaOpenSettings === 'function') return;
  const imRahmen = window.parent !== window &&
    new URLSearchParams(location.search).get('tvzaFrame') === '1';
  if (imRahmen) return;
  const ebene = mountSettingsLayer();
  window.tvzaOpenSettings = section => ebene.open(section || '');
}

/* ══ Das Konto ══════════════════════════════════════════════════════
   Ein Knopf mit einem Menue: Einstellungen und Abmelden. Er steht an
   zwei Stellen, aber nie zweimal sichtbar — 'kopf' nur am Handy,
   'leiste' nur am Laptop. Beide sind dasselbe Bauteil, damit sie nicht
   auseinanderlaufen. */
let konto = { name: '', mail: '', kuerzel: '·' };

export function kontoKnopf(ort) {
  const wrap = document.createElement('div');
  wrap.className = `acct acct--${ort}`;
  wrap.dataset.konto = ort;
  wrap.innerHTML = `
    <button class="${ort === 'leiste' ? 'nav__konto' : 'avatar'}" type="button"
            aria-haspopup="menu" aria-expanded="false"
            data-i18n-attr="title:a11y.konto" title="Konto">
      ${ort === 'leiste'
        ? `<span class="avatar avatar--leiste" data-konto-kuerzel>${esc(konto.kuerzel)}</span>
           <span class="nav__kontoText">
             <span class="nav__kontoName" data-konto-name>${esc(konto.name)}</span>
             <span class="nav__kontoSub" data-i18n="acct.einstellungen">Einstellungen</span>
           </span>`
        : `<span data-konto-kuerzel>${esc(konto.kuerzel)}</span>`}
    </button>
    <div class="acct__menu" role="menu" hidden>
      <div class="acct__head">
        <span class="acct__who" data-konto-name>${esc(konto.name)}</span>
        <span class="acct__mail" data-konto-mail>${esc(konto.mail)}</span>
      </div>
      <button class="acct__item" data-act="settings" type="button" role="menuitem">
        ${icon('gear', 17)}<span data-i18n="acct.einstellungen">Einstellungen</span></button>
      <button class="acct__item acct__item--danger" data-act="logout" type="button" role="menuitem">
        ${icon('abmelden', 17)}<span data-i18n="acct.abmelden">Abmelden</span></button>
    </div>`;

  const knopf = wrap.querySelector('button');
  const menu = wrap.querySelector('.acct__menu');
  const zu = () => { menu.hidden = true; knopf.setAttribute('aria-expanded', 'false'); };

  knopf.addEventListener('click', event => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
    knopf.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', event => { if (!wrap.contains(event.target)) zu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') zu(); });

  menu.addEventListener('click', async event => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    zu();
    if (act === 'settings') window.tvzaOpenSettings?.();
    if (act === 'logout' && await frage({
      titel: label('acct.abmeldenFrage', 'Abmelden?'),
      ja: label('acct.abmelden', 'Abmelden'),
    })) {
      try { localStorage.removeItem('tvza-name'); } catch {}
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signOut(auth);
      location.href = base() + 'login.html';
    }
  });
  return wrap;
}

/* Name und Kuerzel nachtragen, sobald das Profil da ist. Die Leiste
   steht vorher schon — sie wartet nicht auf Firestore. */
export function setzeKonto(profile, mail) {
  /* Kommt das Profil erst nach der Leiste, zieht die Marke nach. */
  if (profile && Object.keys(profile).length) {
    markeSetzen(imKreis(profile));
    seiteMarkieren(document);
    softwareZeigen(aktuelleMarke());
    /* Die Pille (ki-pille.js) entscheidet am Profil, ob es einen
       persönlichen Assistenten gibt — kein zweites Lesen dafür. */
    window.__firnProfil = profile;
    window.dispatchEvent(new CustomEvent('firn-profil'));
  }
  const name = String(profile?.displayName || profile?.name || '').trim()
    || (() => { try { return localStorage.getItem('tvza-name') || ''; } catch { return ''; } })();
  const adresse = mail || auth?.currentUser?.email || konto.mail || '';
  konto = { name, mail: adresse, kuerzel: initialsOf({ displayName: name || adresse }) };
  document.querySelectorAll('[data-konto-name]').forEach(el => { el.textContent = konto.name; });
  document.querySelectorAll('[data-konto-mail]').forEach(el => { el.textContent = konto.mail; });
  document.querySelectorAll('[data-konto-kuerzel]').forEach(el => { el.textContent = konto.kuerzel; });
}

/** Unread messages: a dot on the phone, a number in the laptop rail. */
/**
 * Die Ueberschrift der Leiste NACH dem Mounten aendern.
 *
 * mountShell loescht jede vorhandene .appbar und baut sie neu — eine
 * Seite kann ihren Titel also nicht in ihr eigenes Markup schreiben
 * und darauf hoffen. Genau daran ist der Gruppenname gescheitert: er
 * stand in pages/gruppe.html und war beim ersten Snapshot laengst
 * geloescht.
 */
export function setShellTitle(text) {
  const wert = String(text ?? '');
  /* Im Rahmen des Routers ist dieser Kopf versteckt; sichtbar ist der
     oben, und der erfährt den Titel über eine Nachricht (v.35.53.0 —
     seit die Gruppe im Rahmen läuft). Oben merkt ihn sich der Router,
     damit er nach dem Besuch einer anderen Seite wieder dasteht. */
  if (imRahmen()) {
    window.parent.postMessage({ type:'tvza-titel', text:wert }, location.origin);
    return;
  }
  basisTitel(wert);
  const el = document.querySelector('.appbar__title, .appbar__greet');
  if (el) el.textContent = wert;
}

const imRahmen = () => window.parent !== window &&
  new URLSearchParams(location.search).get('tvzaFrame') === '1';

/* Der Gruppenwechsel im Kopf, wenn die Seite im Rahmen läuft: oben wird
   getippt, hier gewählt. */
let titelWahl = null;
if (typeof window !== 'undefined' && imRahmen()) {
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.data?.type === 'tvza-titel-klick') titelWahl?.();
  });
}

/**
 * Macht den Titel im Kopf zu einem Knopf mit Winkel — die Gruppenseite
 * wechselt so ihre Gruppe (v.35.49.0). Bis dahin stand dafür eine eigene,
 * grosse Karte oben auf der Seite; Michel: "so eine grosse Zeile nur zum
 * Gruppenwechsel scheint mir zu umständlich". Ohne handler ist der Titel
 * wieder nur Text. Nach mountShell aufrufen — das baut den Kopf neu.
 */
export function setShellTitleWahl(handler, beschriftung = '') {
  titelWahl = handler || null;
  if (imRahmen()) {
    window.parent.postMessage({ type:'tvza-titel-wahl', an:!!handler, beschriftung }, location.origin);
    return;
  }
  /* Oben: der Router hält den Kopf — auch wenn gerade ein Rahmen ihn
     trägt, gilt die Wahl wieder, sobald man hierher zurückkommt. */
  basisTitelWahl(handler, beschriftung);
}

/**
 * Die zweite Zeile unter der Überschrift — der Fortschritt einer Einheit,
 * der Name eines Videos. Leer blendet sie aus.
 *
 * Aus demselben Grund wie setShellTitle: bis v.35.45.0 schrieben der
 * Einheiten-Player und die Videoanalyse in ein #kopfMeta aus ihrem eigenen
 * Markup, das mountShell längst gelöscht hatte. Das erste Schreiben warf —
 * der Player meldete "Der Plan liess sich nicht laden", die Videoanalyse
 * zeigte nach der Dateiwahl nie ihren Player.
 */
export function setShellMeta(text) {
  const spacer = document.querySelector('.appbar__spacer');
  if (!spacer) return;
  let el = spacer.querySelector('.appbar__date');
  if (!el) {
    el = document.createElement('div');
    el.className = 'appbar__date';
    spacer.append(el);
  }
  el.textContent = String(text ?? '');
  el.hidden = !el.textContent;
}

/* ── Ein- und Ausklappen ───────────────────────────────────────────
   Zugeklappt bleibt die Leiste als Symbolspalte stehen. Ganz
   verschwinden waere bequemer zu bauen und schlechter zu benutzen:
   der Weg zurueck muesste dann irgendwo anders aufgehen.

   Die Wahl haengt am GERAET. Wer am grossen Bildschirm aufgeklappt
   arbeitet und am kleinen Laptop zu, will genau das — darum
   localStorage und nicht das Profil. */

const LEISTE = 'firn.leiste';

function leisteSchmal() {
  try { return localStorage.getItem(LEISTE) === 'schmal'; } catch { return false; }
}

function setzeLeiste(schmal) {
  document.body.classList.toggle('nav-schmal', schmal);
  const knopf = document.getElementById('shellNavKlapp');
  if (knopf) {
    knopf.setAttribute('aria-expanded', schmal ? 'false' : 'true');
    const wort = schmal
      ? label('nav.ausklappen', 'Leiste ausklappen')
      : label('nav.einklappen', 'Leiste einklappen');
    knopf.title = wort;
    knopf.setAttribute('aria-label', wort);
    /* Der Schluessel wandert mit, sonst beschriftet der Katalog beim
       naechsten Anwenden wieder den anderen Zustand. */
    knopf.dataset.i18nAttr = schmal
      ? 'title:nav.ausklappen;aria-label:nav.ausklappen'
      : 'title:nav.einklappen;aria-label:nav.einklappen';
    const text = knopf.querySelector('.nav__wort');
    if (text) {
      text.textContent = wort;
      text.dataset.i18n = schmal ? 'nav.ausklappen' : 'nav.einklappen';
    }
  }
  try { localStorage.setItem(LEISTE, schmal ? 'schmal' : 'breit'); } catch {}
}

function verkabelLeiste() {
  setzeLeiste(leisteSchmal());
  const knopf = document.getElementById('shellNavKlapp');
  if (knopf) knopf.onclick = () => setzeLeiste(!document.body.classList.contains('nav-schmal'));
}

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
