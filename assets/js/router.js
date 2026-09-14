/* Persistent TVZA app shell

   Header and navigation stay in the top document. Only the page content
   is loaded into a same-origin frame and exchanged after it is ready.
   This preserves the stable parts of the UI and avoids the white/skeleton
   flash caused by full-document navigation.

   Seit v.35.53.0 bleiben die Rahmen stehen (Michel: "man muss 1,5
   Sekunden warten, bis es von Start zu Kalender wechselt, und wenn man zu
   Gruppe wechselt, wird die ganze Seite neu geladen — dadurch gehen alle
   Animationen verloren"). Bis dahin baute jeder Wechsel einen neuen
   Rahmen, lud die Seite samt Firebase neu und wartete bis zu sechs
   Sekunden auf ihre Daten; die Gruppe lud der Router gar nicht und ging
   mit einer ganzen neuen Seite. Jetzt:
   - ein verlassener Rahmen wird GEPARKT (unsichtbar, lebt weiter) und
     beim nächsten Besuch sofort gezeigt, wie man ihn verlassen hat;
   - die Tabs werden nach dem Laden der Reihe nach im Hintergrund
     vorgeladen (nicht mit Datensparmodus), dazu jeder Link, auf den der
     Finger oder die Maus geht;
   - ein neuer Rahmen erscheint, sobald er fertig ist, spätestens 700 ms
     nach dem Laden — nicht erst nach sechs Sekunden;
   - die Gruppe läuft im Rahmen, ihr Titel und ihr Gruppenwechsel im Kopf
     kommen über 'tvza-titel' / 'tvza-titel-wahl' nach oben. */

import { aktuelleMarke, tvzaSymbol, tvzaTitel, TVZA } from './wechsel.js';

const FRAME_PARAM = 'tvzaFrame';
const APP_FILES = new Set([
  'index.html',
  'planner.html',
  'messages.html',
  'skitracker.html',
  'foodtracker.html',
  'watchlist.html',
  'weather.html',
  'maturaarbeit.html',
  'maturaarbeit-tracker.html',
  'training.html',
  'admin.html',
  'gruppe.html',
]);
/* Wie viele verlassene Seiten stehen bleiben. Jede ist ein Dokument mit
   eigenem Firebase — genug für die Tabs und zwei, drei Bereiche. */
const VORRAT_MAX = 5;
/* So lange darf eine neue Seite nach dem Laden auf ihre Daten warten,
   bevor sie trotzdem erscheint (dann mit ihrem eigenen Ladezustand). */
const HOECHSTENS_WARTEN = 700;
// Bereich preferences live in the one global Settings surface. A routed
// page therefore never adds a second, competing settings gear to the header.
const PAGE_ACTIONS = {};

const routeKey = url => `${url.pathname}${url.search}${url.hash}`;
const fileOf = url => url.pathname.split('/').pop() || 'index.html';
/* "/" und "/index.html" sind dieselbe Seite. Sonst lud der Router Start
   ein zweites Mal in einen Rahmen, obwohl Start schon oben stand. */
const pfadVon = url => url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
const zielVon = url => ({ key:`${pfadVon(url)}${url.search}`, pfad:pfadVon(url), search:url.search });
const isFramedContent = () =>
  window.parent !== window &&
  new URLSearchParams(location.search).get(FRAME_PARAM) === '1';

function appUrl(raw) {
  try {
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || !APP_FILES.has(fileOf(url))) return null;
    url.searchParams.delete(FRAME_PARAM);
    return url;
  } catch {
    return null;
  }
}

function frameUrl(publicUrl) {
  const url = new URL(publicUrl.href);
  url.searchParams.set(FRAME_PARAM, '1');
  return url;
}

function wireContentBridge() {
  if (document.documentElement.dataset.tvzaContentBridge) return;
  document.documentElement.dataset.tvzaContentBridge = '1';
  const requestRoute = raw => {
    const target = appUrl(raw);
    if (!target) return false;
    window.parent.postMessage({ type:'tvza-route-request', href:target.href }, location.origin);
    return true;
  };
  window.tvzaNavigate = requestRoute;
  window.tvzaOpenSettings = section => {
    window.parent.postMessage(
      { type:'tvza-open-settings', section:section || '' },
      location.origin
    );
  };
  addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    /* Geparkt oder wieder sichtbar (v.35.53.0). Ein unsichtbarer Rahmen
       ist für den Browser nicht "hidden" — der Chat hätte sonst weiter
       Nachrichten als gelesen markiert, während man woanders ist. */
    if (event.data?.type === 'tvza-sichtbar') {
      const sichtbar = event.data.sichtbar !== false;
      document.documentElement.toggleAttribute('data-tvza-geparkt', !sichtbar);
      dispatchEvent(new CustomEvent('tvza-sichtbar', { detail:{ sichtbar } }));
      return;
    }
    if (event.data?.type !== 'tvza-header-action') return;
    if (!['profileBtn', 'settingsBtn'].includes(event.data.targetId)) return;
    document.getElementById(event.data.targetId)?.click();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    /* data-kein-router: die Seite kümmert sich selbst (eine Einladung im Chat). */
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') ||
        anchor.hasAttribute('data-kein-router')) return;
    const target = appUrl(anchor.href);
    if (target) {
      event.preventDefault();
      requestRoute(target.href);
      return;
    }
    /* Eine Seite ausserhalb des Routers (Einheit, Video, Gast) öffnet
       oben, nicht im Rahmen. Sonst lud sie ohne tvzaFrame in den Rahmen
       und stand mit einer zweiten Leiste und einem zweiten Kopf darin. */
    const ganz = eigeneSeite(anchor.href);
    if (!ganz) return;
    event.preventDefault();
    window.top.location.href = ganz.href;
  }, { capture:true });
}

/* Eine Seite dieser App, die der Router nicht lädt. */
function eigeneSeite(raw) {
  try {
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || APP_FILES.has(fileOf(url))) return null;
    if (url.pathname === location.pathname && url.hash) return null;
    if (!/(\.html|\/)$/.test(url.pathname)) return null;
    url.searchParams.delete(FRAME_PARAM);
    return url;
  } catch {
    return null;
  }
}

/* Der Titel im Kopf als Knopf — die Gruppe wechselt so ihre Gruppe
   (setShellTitleWahl in shell.js). Hier, weil der Router denselben Kopf
   für die Seite im Rahmen umschaltet. Ohne handler ist er wieder Text. */
export function titelWahlSetzen(el, handler, beschriftung = '') {
  if (!el) return;
  el.classList.toggle('appbar__title--wahl', !!handler);
  if (handler) {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-haspopup', 'dialog');
    if (beschriftung) el.title = beschriftung;
  } else {
    for (const a of ['role', 'tabindex', 'aria-haspopup', 'title']) el.removeAttribute(a);
  }
  el.onclick = handler ? () => handler() : null;
  el.onkeydown = handler
    ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler(); } }
    : null;
}

/* Was die Seite OBEN selbst in ihren Kopf schreibt (setShellTitle,
   setShellTitleWahl). Zeigt der Router gerade einen Rahmen, gehört der
   Kopf dem Rahmen; kommt man zurück, gilt wieder das hier. */
const basisKopf = { titel:null, wahl:null, beschriftung:'' };
let basisSichtbar = true;
export function basisTitel(text) {
  basisKopf.titel = String(text ?? '');
  if (!basisSichtbar) return;
  const el = document.querySelector('.appbar__title, .appbar__greet');
  if (el) el.textContent = basisKopf.titel;
}
export function basisTitelWahl(handler, beschriftung = '') {
  basisKopf.wahl = handler || null;
  basisKopf.beschriftung = beschriftung;
  if (basisSichtbar) titelWahlSetzen(document.querySelector('.appbar__title'), handler, beschriftung);
}

/* ── Der Vorrat (rein, getestet) ─────────────────────────────────────
   Welcher stehende Rahmen passt zu einem Ziel? Genau dieselbe Adresse;
   oder, wenn das Ziel nur die Seite nennt (ein Tab: "gruppe.html"),
   irgendein Rahmen derselben Seite — ein Tab soll den Stand zeigen, den
   man verlassen hat, auch wenn der mit ?termin= geöffnet wurde. */
export function passenderRahmen(rahmen, ziel) {
  const liste = [...rahmen];
  const genau = liste.find(r => r.key === ziel.key);
  if (genau) return genau;
  if (ziel.search) return null;
  return liste.find(r => r.pfad === ziel.pfad) || null;
}

/* Welche geparkten Rahmen weg müssen: nie der gezeigte, nie einer, der
   gerade lädt; von den übrigen die am längsten nicht gesehenen, bis
   höchstens max stehen. */
export function zuVerdraengen(rahmen, max = VORRAT_MAX) {
  const geparkt = [...rahmen].filter(r => r.zustand === 'geparkt')
    .sort((a, b) => (a.zuletzt || 0) - (b.zuletzt || 0));
  return geparkt.slice(0, Math.max(0, geparkt.length - max));
}

/* Dieselbe Zuordnung wie activeTab() in shell.js. Hier stand noch die
   alte mit 'nachrichten' und 'bereiche' — Tabs, die es seit dem Umbau
   auf Start/Kalender/Gruppe/Chat nicht mehr gibt. Wer ueber den Router
   zur Gruppe oder zum Chat wechselte, sah danach KEINEN Tab leuchten.
   Eine Bereichsseite gehoert zu Start, wie in shell.js. */
function tabFor(url) {
  const file = fileOf(url);
  if (file === 'planner.html') return 'kalender';
  if (file === 'gruppe.html') return 'gruppe';
  if (file === 'messages.html') return 'chat';
  return 'start';
}

const TAB_ORDER = ['start', 'kalender', 'gruppe', 'chat'];
function routeDirection(from, to) {
  const fromIndex = TAB_ORDER.indexOf(tabFor(from));
  const toIndex = TAB_ORDER.indexOf(tabFor(to));
  return toIndex < fromIndex ? -1 : 1;
}

function updateNavigation(nav, target) {
  const activeTab = tabFor(target);
  nav.querySelectorAll('[data-nav-tab]').forEach(link => {
    const active = link.dataset.navTab === activeTab;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  nav.querySelectorAll('.nav__bereich').forEach(link => {
    const linkUrl = appUrl(link.href);
    const active = !!linkUrl && linkUrl.pathname === target.pathname;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function routeLabel(nav, target) {
  const exact = [...nav.querySelectorAll('a[href]')]
    .find(link => appUrl(link.href)?.pathname === target.pathname);
  return exact?.querySelector('.nav__bereich-name')?.textContent?.trim() ||
    exact?.querySelector('span')?.textContent?.trim() ||
    ({
      'index.html':'Start',
      'planner.html':'Kalender',
      'messages.html':'Nachrichten',
      'skitracker.html':'Ski Tracker',
      'foodtracker.html':'Food Tracker',
      'watchlist.html':'Watchlist',
      'weather.html':'Wetter',
      'maturaarbeit.html':'Maturaarbeit',
      'maturaarbeit-tracker.html':'Maturaarbeit Tracker',
      'training.html':'Training',
      'admin.html':'Admin',
    })[fileOf(target)] ||
    document.title.split('—')[0].trim();
}

function generatedStartHeader(bar) {
  let name = String(bar?.dataset.profileName || '').trim();
  if (!name) {
    try { name = String(localStorage.getItem('tvza-name') || '').trim(); } catch {}
  }
  const now = new Date();
  const hour = now.getHours();
  const salutation = hour >= 5 && hour < 12 ? 'Guten Morgen'
    : hour >= 12 && hour < 18 ? 'Guten Tag'
    : hour >= 18 ? 'Guten Abend'
    : 'Gute Nacht';
  return {
    /* Der Vorname, wie auf Start selbst. */
    greeting: `${salutation}, ${name.split(/\s+/)[0] || 'du'}`,
    date: now.toLocaleDateString('de-CH', {
      weekday:'long',
      year:'numeric',
      month:'long',
      day:'numeric',
    }),
  };
}

export function headerController(runPageAction) {
  const bar = document.querySelector('.appbar');
  const title = bar?.querySelector('.appbar__title');
  let greeting = bar?.querySelector('.appbar__greet');
  let date = bar?.querySelector('.appbar__date');
  /* Der Kopf einer Unterseite hat nur einen Titel. Wurde die App dort
     geöffnet (neu geladen in der Gruppe, ein Link, das Homescreen-Symbol
     nach einem Wechsel) und man tippt auf Start, stand oben das Wort
     "Start" statt "Guten Abend, Michel" — Michel hat es am Handy gesehen.
     Also bekommt ein solcher Kopf Gruss und Datum dazu, versteckt, bis
     Start dran ist (v.35.45.0). */
  const eigenerGruss = !greeting && !!title;
  if (eigenerGruss) {
    greeting = document.createElement('div');
    greeting.className = 'appbar__greet';
    greeting.hidden = true;
    title.insertAdjacentElement('afterend', greeting);
  }
  if (!date && greeting) {
    date = document.createElement('div');
    date.className = 'appbar__date';
    date.hidden = true;
    greeting.insertAdjacentElement('afterend', date);
  }
  const sourceAction = bar?.querySelector('#profileBtn, #settingsBtn');
  const action = document.createElement('button');
  action.className = 'appbar__btn tvza-route-page-action';
  action.type = 'button';
  action.hidden = true;
  action.innerHTML = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"/></svg>';
  if (sourceAction) sourceAction.hidden = true;
  const actionHost = bar?.querySelector('.appbar__end') || bar?.querySelector('.appbar__inner');
  if (actionHost) {
    const before = actionHost.querySelector('.wx-pill, .acct');
    actionHost.insertBefore(action, before);
  }
  action.addEventListener('click', () => {
    if (action.dataset.targetId) runPageAction(action.dataset.targetId, sourceAction);
  });
  const original = {
    title: title?.textContent || '',
    greeting: greeting?.textContent || '',
    dateHidden: date?.hidden || false,
  };
  const initialStart = fileOf(new URL(location.href)) === 'index.html';
  const startHeader = {
    greeting: initialStart ? original.greeting : '',
    date: initialStart ? date?.textContent || '' : '',
  };
  let showingStart = initialStart;

  const show = (target, label) => {
    const start = fileOf(target) === 'index.html';
    if (showingStart && !start) {
      startHeader.greeting = greeting?.textContent?.trim() || startHeader.greeting;
      startHeader.date = date?.textContent?.trim() || startHeader.date;
    }
    window.tvzaReminderOverlay?.setContext(fileOf(target));
    bar?.classList.toggle('appbar--route-view', !start);
    if (title) title.textContent = start ? 'Start' : label;
    const generated = generatedStartHeader(bar);
    const savedGreeting = startHeader.greeting;
    const personalGreeting = !savedGreeting || savedGreeting === 'Willkommen' || savedGreeting === 'Start'
      ? generated.greeting
      : savedGreeting;
    if (greeting) greeting.textContent = start ? personalGreeting : label;
    if (eigenerGruss) {
      title.hidden = start;
      greeting.hidden = !start;
    }
    if (date) {
      if (start) date.textContent = startHeader.date || generated.date;
      date.hidden = !start;
    }
    showingStart = start;
    const pageAction = PAGE_ACTIONS[fileOf(target)];
    action.hidden = !pageAction;
    action.dataset.targetId = pageAction?.targetId || '';
    action.title = pageAction?.label || '';
    action.setAttribute('aria-label', pageAction?.label || 'Bereichseinstellungen');
  };
  return { show, bar };
}

/* Der Tab gehoert der Seite, die man sieht — Symbol und Titel.
   Der Router laedt die Bereiche in einen Rahmen; die Seite oben bleibt
   stehen und mit ihr ihr <link rel="icon"> und ihr <title>. Ohne das
   zeigte der Tab in der Maturaarbeit den Firn-Berg und "Firn" der
   Startseite (v.35.39.0: Symbol, v.35.40.0: Titel). Die Seite sagt beides
   selbst — es gibt keine Liste, die mit TVZA_BEREICHE auseinanderlaufen
   koennte. Ohne lesbaren Rahmen gilt das Eigene der Seite oben. */
export function tabFolgen(doc, rahmen, eigen) {
  let fremd = null;
  try { fremd = rahmen?.contentDocument || null; } catch {}
  let symbol = fremd?.querySelector('link[rel="icon"]')?.href || eigen.symbol;
  let titel = fremd?.title || eigen.titel;
  /* Die Marke hängt an der Person (wechsel.js, v.35.52.0): im TVZA-Kreis
     heisst auch die Seite im Rahmen TVZA — schon bevor sie ihr Profil
     geladen und sich selbst umbenannt hat. */
  if (fremd && aktuelleMarke() === TVZA) {
    symbol = tvzaSymbol(symbol);
    titel = tvzaTitel(titel);
  }
  const link = doc.querySelector('link[rel="icon"]');
  if (link && symbol && link.href !== symbol) link.href = symbol;
  if (titel && doc.title !== titel) doc.title = titel;
}

export function mountAppRouter(nav) {
  if (isFramedContent()) {
    wireContentBridge();
    return;
  }
  if (window.parent !== window || !nav || nav.dataset.tvzaRouter) return;
  nav.dataset.tvzaRouter = '1';

  /* Relative hrefs would otherwise change their meaning after pushState
     changes the address bar from /index.html to /pages/foo.html. */
  nav.querySelectorAll('a[href]').forEach(link => { link.href = link.href; });

  const initialUrl = new URL(location.href);
  const initialKey = routeKey(initialUrl);
  const istBasis = target => routeKey(target) === initialKey ||
    (!target.search && !target.hash && pfadVon(target) === pfadVon(initialUrl));
  let currentUrl = new URL(initialUrl.href);
  let currentFrame = null;
  let navigationId = 0;
  const header = headerController((targetId, sourceAction) => {
    if (!currentFrame && sourceAction?.id === targetId) {
      sourceAction.click();
      return;
    }
    currentFrame?.iframe?.contentWindow?.postMessage(
      { type:'tvza-header-action', targetId },
      location.origin
    );
  });
  header.show(initialUrl, routeLabel(nav, initialUrl));
  /* Was der Tab auf der Seite oben traegt. Gemerkt wird es jedes Mal,
     bevor man sie verlaesst — bis dahin kann der Katalog den Titel
     uebersetzt haben. */
  const eigen = { symbol: document.querySelector('link[rel="icon"]')?.href, titel: document.title };

  const progress = document.createElement('div');
  progress.className = 'tvza-route-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  const syncShellBounds = () => {
    const top = Math.max(0, header.bar?.getBoundingClientRect().bottom || 0);
    const bottom = matchMedia('(max-width:899px)').matches
      ? Math.max(0, nav.getBoundingClientRect().height || 0)
      : 0;
    document.documentElement.style.setProperty('--tvza-shell-top', `${top}px`);
    document.documentElement.style.setProperty('--tvza-shell-bottom', `${bottom}px`);
  };
  syncShellBounds();
  addEventListener('resize', syncShellBounds, { passive:true });
  if ('ResizeObserver' in window) {
    const shellBoundsObserver = new ResizeObserver(syncShellBounds);
    shellBoundsObserver.observe(nav);
    if (header.bar) shellBoundsObserver.observe(header.bar);
  }

  /* Alle Rahmen, die stehen: der gezeigte, die geparkten, die ladenden.
     Je Eintrag { key, pfad, search, url, wrap, iframe, zustand, zuletzt,
     geladen, bereit, kopf }. */
  const rahmen = new Set();
  const nachricht = (eintrag, daten) => {
    try { eintrag.iframe.contentWindow?.postMessage(daten, location.origin); } catch {}
  };
  const weg = eintrag => {
    rahmen.delete(eintrag);
    eintrag.wrap.remove();
  };
  const parken = eintrag => {
    eintrag.zustand = 'geparkt';
    eintrag.zuletzt = Date.now();
    eintrag.wrap.classList.remove('is-active', 'is-entering', 'is-leaving', 'from-left', 'from-right', 'to-left', 'to-right');
    eintrag.wrap.classList.add('is-parked');
    eintrag.wrap.setAttribute('aria-hidden', 'true');
    eintrag.wrap.inert = true;
    nachricht(eintrag, { type:'tvza-sichtbar', sichtbar:false });
    zuVerdraengen(rahmen).forEach(weg);
  };
  const wegfuehren = (eintrag, direction) => {
    eintrag.zustand = 'geht';
    eintrag.wrap.classList.add('is-leaving', direction < 0 ? 'to-right' : 'to-left');
    setTimeout(() => { if (eintrag.zustand === 'geht') parken(eintrag); }, 220);
  };

  /* Der Kopf gehört der Seite, die man sieht. Ein Rahmen meldet seinen
     Titel und seinen Gruppenwechsel (shell.js); hier wird er gezeigt,
     und ein Tipp darauf geht zurück in den Rahmen. */
  /* Auf Start trägt der Kopf keinen Titel, sondern den Gruss — der steht
     dann für die Seite im Rahmen (appbar--route-view). */
  const titelEl = () => header.bar?.querySelector('.appbar__title:not([hidden])') ||
    header.bar?.querySelector('.appbar__greet');
  const kopfVonRahmen = eintrag => {
    const el = titelEl();
    if (!el) return;
    if (eintrag.kopf.titel && fileOf(eintrag.url) !== 'index.html') el.textContent = eintrag.kopf.titel;
    titelWahlSetzen(el, eintrag.kopf.wahl ? () => nachricht(eintrag, { type:'tvza-titel-klick' }) : null,
      eintrag.kopf.beschriftung);
  };

  const revealBasePage = target => {
    navigationId++;
    progress.classList.remove('is-loading');
    if (currentFrame) wegfuehren(currentFrame, routeDirection(currentUrl, target));
    currentFrame = null;
    basisSichtbar = true;
    currentUrl = new URL(target.href);
    updateNavigation(nav, target);
    header.show(target, routeLabel(nav, target));
    if (basisKopf.titel !== null && fileOf(target) !== 'index.html') {
      const el = document.querySelector('.appbar__title');
      if (el) el.textContent = basisKopf.titel;
    }
    titelWahlSetzen(titelEl(), basisKopf.wahl, basisKopf.beschriftung);
    tabFolgen(document, null, eigen);
  };

  /* Einen Rahmen bauen — für einen Wechsel oder im Voraus. Er steht
     unsichtbar da, bis er gezeigt wird. */
  const rahmenBauen = (target, zustand) => {
    const label = routeLabel(nav, target);
    const wrap = document.createElement('div');
    wrap.className = 'tvza-route-frame is-parked';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.inert = true;
    const contentFrame = document.createElement('iframe');
    contentFrame.title = `${label} – Inhalt`;
    contentFrame.setAttribute('aria-label', contentFrame.title);
    wrap.appendChild(contentFrame);
    const eintrag = {
      ...zielVon(target),
      url: new URL(target.href),
      wrap, iframe: contentFrame, zustand, zuletzt: Date.now(),
      kopf: { titel:null, wahl:false, beschriftung:'' },
    };
    /* Eine Seite läuft nur einmal: ein älterer Rahmen derselben Seite
       (etwa die Gruppe ohne ?termin=) geht, statt doppelt zu lauschen. */
    [...rahmen].filter(r => r.pfad === eintrag.pfad && r !== currentFrame).forEach(weg);
    rahmen.add(eintrag);
    eintrag.geladen = new Promise(fertig => {
      contentFrame.addEventListener('load', () => fertig(performance.now()), { once:true });
    });
    /* Fertig ist eine Seite, wenn sie nicht mehr lädt und ihre Daten da
       sind (routeReady) — oder nach sechs Sekunden trotzdem. */
    eintrag.bereit = eintrag.geladen.then(loadedAt => new Promise(fertig => {
      const waitForCompleteContent = () => {
        let stillLoading = false;
        let waitingForRouteReady = false;
        try {
          stillLoading = contentFrame.contentDocument?.body?.classList.contains('fx-loading') || false;
          waitingForRouteReady =
            contentFrame.contentDocument?.documentElement?.dataset.routeReady === 'false';
        } catch {}
        if ((stillLoading || waitingForRouteReady) && performance.now() - loadedAt < 6000) {
          setTimeout(waitForCompleteContent, 60);
          return;
        }
        fertig();
      };
      waitForCompleteContent();
    }));
    contentFrame.src = frameUrl(target).href;
    document.body.appendChild(wrap);
    return eintrag;
  };

  const zeigen = (eintrag, target, direction, historyMode) => {
    const old = currentFrame;
    if (old === eintrag) return;
    if (!old) {
      /* Was der Tab oben trägt, bevor ein Rahmen ihn übernimmt. */
      eigen.symbol = document.querySelector('link[rel="icon"]')?.href || eigen.symbol;
      eigen.titel = document.title || eigen.titel;
    }
    basisSichtbar = false;
    currentFrame = eintrag;
    currentUrl = new URL(eintrag.url.href);
    eintrag.zustand = 'aktiv';
    eintrag.zuletzt = Date.now();
    updateNavigation(nav, target);
    header.show(target, routeLabel(nav, target));
    kopfVonRahmen(eintrag);
    tabFolgen(document, eintrag.iframe, eigen);
    nachricht(eintrag, { type:'tvza-sichtbar', sichtbar:true });
    const wrap = eintrag.wrap;
    /* Erst in die Ausgangslage (noch ohne Übergang, weil geparkt), dann
       sichtbar — sonst gleitet er zuerst an den Rand und dann zurück. */
    wrap.classList.remove('is-leaving', 'to-left', 'to-right');
    wrap.classList.add('is-entering', direction < 0 ? 'from-left' : 'from-right');
    void wrap.offsetWidth;
    wrap.classList.remove('is-parked');
    wrap.removeAttribute('aria-hidden');
    wrap.inert = false;
    /* Ein geparkter Rahmen steht mit seinem Stand da — er gleitet
       herein wie ein neuer, nur ohne Warten. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (currentFrame !== eintrag) return;
      wrap.classList.remove('is-entering', 'from-left', 'from-right');
      wrap.classList.add('is-active');
    }));
    if (old) wegfuehren(old, direction);
    if (historyMode === 'push') history.pushState({ tvzaRoute:eintrag.url.href }, '', routeKey(eintrag.url));
  };

  const navigate = (raw, historyMode = 'push') => {
    const target = appUrl(raw);
    if (!target || routeKey(target) === routeKey(currentUrl)) return;

    const ziel = zielVon(target);
    /* Die Seite oben selbst: genau ihre Adresse, oder ein Tab auf sie. */
    if (istBasis(target)) {
      const basis = routeKey(target) === initialKey ? target : new URL(initialUrl.href);
      if (routeKey(basis) === routeKey(currentUrl)) return;
      revealBasePage(basis);
      if (historyMode === 'push') history.pushState({ tvzaRoute:basis.href }, '', routeKey(basis));
      return;
    }

    const id = ++navigationId;
    const direction = routeDirection(currentUrl, target);
    /* Der Tab leuchtet sofort — der Finger soll sehen, dass es losgeht. */
    updateNavigation(nav, target);
    let eintrag = passenderRahmen([...rahmen].filter(r => r !== currentFrame), ziel);
    if (!eintrag) eintrag = rahmenBauen(target, 'laedt');
    else if (eintrag.zustand === 'geht') eintrag.zustand = 'geparkt';
    const zeigeTarget = eintrag.url;
    if (eintrag.zustand === 'geparkt') {
      zeigen(eintrag, zeigeTarget, direction, historyMode);
      return;
    }
    /* Neu oder noch im Voraus am Laden: warten, bis er fertig ist —
       höchstens HOECHSTENS_WARTEN nach dem Laden. */
    progress.classList.add('is-loading');
    eintrag.geladen
      .then(() => Promise.race([eintrag.bereit, new Promise(r => setTimeout(r, HOECHSTENS_WARTEN))]))
      .then(() => new Promise(r => setTimeout(r, 80)))
      .then(function revealTogether() {
        if (!rahmen.has(eintrag)) return;
        if (id !== navigationId) {
          /* Überholt: der Rahmen bleibt als Vorrat, wenn er fertig ist. */
          if (eintrag.zustand === 'laedt') parken(eintrag);
          return;
        }
        progress.classList.remove('is-loading');
        zeigen(eintrag, zeigeTarget, direction, historyMode);
      });
  };

  /* ── Im Voraus laden ──────────────────────────────────────────────
     Nach dem Laden die Tabs, einer nach dem anderen, damit sie nicht
     mit der Seite selbst um das Netz ringen. Nicht im Datensparmodus. */
  const sparen = () => {
    const netz = navigator.connection;
    return !!netz && (netz.saveData || /(^|-)2g$/.test(netz.effectiveType || ''));
  };
  const vorladen = raw => {
    const target = appUrl(raw);
    if (!target || sparen()) return null;
    if (istBasis(target)) return null;
    const da = passenderRahmen(rahmen, zielVon(target));
    if (da) return da;
    const eintrag = rahmenBauen(target, 'laedt');
    eintrag.bereit.then(() => { if (eintrag.zustand === 'laedt') parken(eintrag); });
    return eintrag;
  };
  const tabsVorladen = async () => {
    const tabs = [...nav.querySelectorAll('a[data-nav-tab]')].map(a => a.href);
    for (const href of tabs) {
      const eintrag = vorladen(href);
      if (eintrag?.geladen) await eintrag.geladen;
      await new Promise(r => setTimeout(r, 250));
    }
  };
  /* Nur von einem Tab oder Bereich aus. In einer Einheit oder Videoanalyse
     (Seiten ausserhalb des Routers) wird trainiert — dort lädt nichts
     vier Seiten im Hintergrund. */
  const nachDemLaden = () => APP_FILES.has(fileOf(initialUrl)) && setTimeout(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => tabsVorladen(), { timeout:2500 });
    else tabsVorladen();
  }, 1200);
  if (document.readyState === 'complete') nachDemLaden();
  else addEventListener('load', nachDemLaden, { once:true });
  /* Wohin der Finger geht, das lädt schon. */
  const absicht = event => {
    const link = event.target.closest?.('a[href]');
    if (link && nav.contains(link)) vorladen(link.href);
  };
  nav.addEventListener('pointerenter', absicht, { capture:true, passive:true });
  nav.addEventListener('touchstart', absicht, { capture:true, passive:true });

  const requestRoute = raw => {
    const target = appUrl(raw);
    if (!target) return false;
    navigate(target.href);
    return true;
  };
  window.tvzaNavigate = requestRoute;

  /* Capture before the legacy full-page fade handler. This includes
     dashboard cards and the weather chip, not only sidebar links. */
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download') ||
        link.hasAttribute('data-kein-router')) return;
    const target = appUrl(link.href);
    if (!target) return;
    event.preventDefault();
    navigate(target.href);
  }, { capture:true });

  addEventListener('popstate', () => {
    const target = appUrl(location.href);
    if (target) navigate(target.href, 'none');
  });
  addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const typ = event.data?.type;
    if (typ === 'tvza-titel' || typ === 'tvza-titel-wahl') {
      const eintrag = [...rahmen].find(r => r.iframe.contentWindow === event.source);
      if (!eintrag) return;
      if (typ === 'tvza-titel') eintrag.kopf.titel = String(event.data.text ?? '').slice(0, 120);
      else {
        eintrag.kopf.wahl = !!event.data.an;
        eintrag.kopf.beschriftung = String(event.data.beschriftung ?? '').slice(0, 80);
      }
      if (eintrag === currentFrame) kopfVonRahmen(eintrag);
      return;
    }
    /* Nur der gezeigte Rahmen darf einen Wechsel verlangen — ein
       geparkter, der im Hintergrund eine Weiterleitung auslöst, nicht. */
    if (typ === 'tvza-route-request') {
      const quelle = [...rahmen].find(r => r.iframe.contentWindow === event.source);
      if (quelle && quelle !== currentFrame) return;
      navigate(event.data.href);
    }
    if (event.data?.type === 'tvza-open-settings') {
      window.tvzaOpenSettings?.(event.data.section || '');
    }
  });
}
