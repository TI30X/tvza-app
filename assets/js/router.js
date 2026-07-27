/* Persistent TVZA app shell

   Header and navigation stay in the top document. Only the page content
   is loaded into a same-origin frame and exchanged after it is ready.
   This preserves the stable parts of the UI and avoids the white/skeleton
   flash caused by full-document navigation.
*/

const FRAME_PARAM = 'tvzaFrame';
const APP_FILES = new Set([
  'index.html',
  'bereiche.html',
  'planner.html',
  'messages.html',
  'skitracker.html',
  'foodtracker.html',
  'watchlist.html',
  'weather.html',
  'maturaarbeit.html',
  'maturaarbeit-tracker.html',
]);
const PAGE_ACTIONS = {
  'foodtracker.html': { targetId:'profileBtn', label:'Food-Einstellungen' },
  'watchlist.html': { targetId:'settingsBtn', label:'Watchlist-Einstellungen' },
};

const routeKey = url => `${url.pathname}${url.search}${url.hash}`;
const fileOf = url => url.pathname.split('/').pop() || 'index.html';
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
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'tvza-header-action') return;
    if (!['profileBtn', 'settingsBtn'].includes(event.data.targetId)) return;
    document.getElementById(event.data.targetId)?.click();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const target = appUrl(anchor.href);
    if (!target) return;
    event.preventDefault();
    requestRoute(target.href);
  }, { capture:true });
}

function tabFor(url) {
  const file = fileOf(url);
  if (file === 'index.html') return 'start';
  if (file === 'planner.html') return 'kalender';
  if (file === 'messages.html') return 'nachrichten';
  return 'bereiche';
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
      'bereiche.html':'Bereiche',
      'skitracker.html':'Ski Tracker',
      'foodtracker.html':'Food Tracker',
      'watchlist.html':'TVZA Watchlist',
      'weather.html':'Wetter',
      'maturaarbeit.html':'Maturaarbeit',
      'maturaarbeit-tracker.html':'Maturaarbeit Tracker',
    })[fileOf(target)] ||
    document.title.split('—')[0].trim();
}

function headerController(runPageAction) {
  const bar = document.querySelector('.appbar');
  const title = bar?.querySelector('.appbar__title');
  const greeting = bar?.querySelector('.appbar__greet');
  const date = bar?.querySelector('.appbar__date');
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

  const show = (target, label) => {
    const start = fileOf(target) === 'index.html';
    const reminderFab = document.querySelector('.global-reminder-fab');
    if (reminderFab) reminderFab.hidden = fileOf(target) === 'planner.html';
    bar?.classList.toggle('appbar--route-view', !start);
    if (title) title.textContent = start ? 'Start' : label;
    if (greeting) greeting.textContent = start
      ? (initialStart ? original.greeting : 'Start')
      : label;
    if (date) date.hidden = start ? original.dateHidden : true;
    const pageAction = PAGE_ACTIONS[fileOf(target)];
    action.hidden = !pageAction;
    action.dataset.targetId = pageAction?.targetId || '';
    action.title = pageAction?.label || '';
    action.setAttribute('aria-label', pageAction?.label || 'Bereichseinstellungen');
  };
  return { show, bar };
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
  let currentUrl = new URL(initialUrl.href);
  let currentFrame = null;
  let navigationId = 0;
  const header = headerController((targetId, sourceAction) => {
    if (!currentFrame && sourceAction?.id === targetId) {
      sourceAction.click();
      return;
    }
    currentFrame?.querySelector('iframe')?.contentWindow?.postMessage(
      { type:'tvza-header-action', targetId },
      location.origin
    );
  });
  header.show(initialUrl, routeLabel(nav, initialUrl));

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

  const revealBasePage = target => {
    navigationId++;
    progress.classList.remove('is-loading');
    if (currentFrame) {
      const old = currentFrame;
      currentFrame = null;
      old.classList.add('is-leaving');
      setTimeout(() => old.remove(), 220);
    }
    currentUrl = new URL(target.href);
    updateNavigation(nav, target);
    header.show(target, routeLabel(nav, target));
  };

  const navigate = (raw, historyMode = 'push') => {
    const target = appUrl(raw);
    if (!target || routeKey(target) === routeKey(currentUrl)) return;

    if (routeKey(target) === initialKey) {
      revealBasePage(target);
      if (historyMode === 'push') history.pushState({ tvzaRoute:target.href }, '', routeKey(target));
      return;
    }

    const id = ++navigationId;
    const label = routeLabel(nav, target);
    const incoming = document.createElement('div');
    incoming.className = 'tvza-route-frame is-entering';
    const contentFrame = document.createElement('iframe');
    contentFrame.title = `${label} – Inhalt`;
    contentFrame.src = frameUrl(target).href;
    contentFrame.setAttribute('aria-label', contentFrame.title);
    incoming.appendChild(contentFrame);
    progress.classList.add('is-loading');
    document.body.appendChild(incoming);

    contentFrame.addEventListener('load', () => {
      if (id !== navigationId) {
        incoming.remove();
        return;
      }
      const old = currentFrame;
      currentFrame = incoming;
      currentUrl = new URL(target.href);
      updateNavigation(nav, target);
      header.show(target, label);
      progress.classList.remove('is-loading');
      requestAnimationFrame(() => {
        incoming.classList.remove('is-entering');
        incoming.classList.add('is-active');
        if (old) old.classList.add('is-leaving');
      });
      if (old) setTimeout(() => old.remove(), 220);
      if (historyMode === 'push') history.pushState({ tvzaRoute:target.href }, '', routeKey(target));
    }, { once:true });
  };

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
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
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
    if (event.origin !== location.origin || event.data?.type !== 'tvza-route-request') return;
    navigate(event.data.href);
  });
}
