/* TVZA — Notification panel (shared across all pages)
 * "What you missed": collects four kinds of events from data the app already
 * has — no push, no backend. Runs client-side wherever it's included:
 *   1. Shared with me        (Firestore: shares)
 *   2. Missed food logging   (Firestore: foodlog — only for active loggers)
 *   3. Maturaarbeit deadline (localStorage: matura_tracker_<uid>)
 *   4. Watchlist big movers  (Finnhub + CoinGecko, cached 5 min)
 *
 * Mounts a bell into the page header (or floats it if there's no header),
 * is fully self-styled, and tracks read-state per device in localStorage.
 */
import { auth, db, MODULES, escHtml, sharesForEmail, getFinnhubKey, reportClientError } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

(() => {
  'use strict';
  const BASE  = location.pathname.includes('/pages/') ? '../' : './';
  const READ  = 'tvza-notif-read';
  const MOVERS_CACHE = 'tvza-notif-movers';

  const dstr = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),x=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${x}`; };
  const getRead = () => { try { return new Set(JSON.parse(localStorage.getItem(READ) || '[]')); } catch(e){ return new Set(); } };
  const setRead = s => { try { localStorage.setItem(READ, JSON.stringify([...s].slice(-300))); } catch(e){} };
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  function rel(ts){
    const d = new Date(ts);
    const a = new Date(d); a.setHours(0,0,0,0);
    const b = new Date();  b.setHours(0,0,0,0);
    const diff = Math.round((b - a) / 86400000);
    if (diff <= 0) return 'heute';
    if (diff === 1) return 'gestern';
    if (diff < 7) return `vor ${diff} Tagen`;
    return d.toLocaleDateString('de-CH', { day:'numeric', month:'short' });
  }

  /* ── Styles (self-contained; falls back when app vars are absent) ── */
  const css = `
  .tvzn-bell{ position:relative; cursor:pointer; background:none; border:0; padding:0; width:40px; height:44px;
    display:inline-flex; align-items:center; justify-content:center; color:var(--ink-soft,#5b6472); }
  .tvzn-bell svg{ width:21px; height:21px; }
  .tvzn-bell.tvzn-float{ position:fixed; top:max(10px,env(safe-area-inset-top)); right:14px; z-index:9000;
    width:42px; height:42px; border-radius:50%; background:#0f3460; color:#fff; box-shadow:0 4px 14px rgba(0,0,0,.25); }
  .tvzn-badge{ position:absolute; top:5px; right:4px; min-width:16px; height:16px; padding:0 4px; border-radius:9px;
    background:#e03131; color:#fff; font:700 10px/16px system-ui,sans-serif; text-align:center; pointer-events:none; }
  .tvzn-bell.tvzn-float .tvzn-badge{ top:-3px; right:-3px; }
  .tvzn-badge.tvzn-hide{ display:none; }

  .tvzn-backdrop{ position:fixed; inset:0; z-index:9500; background:transparent; }
  .tvzn-panel{ position:fixed; z-index:9600; top:58px; right:12px; width:min(360px,94vw); max-height:74vh;
    display:flex; flex-direction:column; border-radius:16px; overflow:hidden;
    background:#fff; color:#1a1a2e; border:1px solid #e6e8ec; box-shadow:0 16px 48px rgba(0,0,0,.22);
    font-family:'Hanken Grotesk',system-ui,-apple-system,sans-serif; transform-origin:top right;
    animation:tvznPop .16s cubic-bezier(.2,.8,.3,1); }
  .tvzn-panel.tvzn-dark{ background:#1c2333; color:#eef1f6; border-color:#33405c; box-shadow:0 16px 48px rgba(0,0,0,.5); }
  @keyframes tvznPop{ from{ opacity:0; transform:translateY(-6px) scale(.98); } to{ opacity:1; transform:none; } }
  .tvzn-head{ display:flex; align-items:center; gap:8px; padding:14px 16px; border-bottom:1px solid #eef0f3; }
  .tvzn-dark .tvzn-head{ border-color:#2c374f; }
  .tvzn-head h3{ margin:0; font-size:15px; font-weight:700; }
  .tvzn-head .tvzn-x{ margin-left:auto; cursor:pointer; border:0; background:none; color:inherit; font-size:20px; line-height:1; opacity:.6; padding:4px; }
  .tvzn-list{ overflow-y:auto; padding:6px; }
  .tvzn-item{ display:flex; gap:11px; padding:11px 10px; border-radius:11px; text-decoration:none; color:inherit; cursor:pointer; }
  .tvzn-item:hover{ background:rgba(0,0,0,.05); } .tvzn-dark .tvzn-item:hover{ background:rgba(255,255,255,.06); }
  .tvzn-item.unread{ background:rgba(15,52,96,.07); } .tvzn-dark .tvzn-item.unread{ background:rgba(94,230,163,.10); }
  .tvzn-ic{ flex-shrink:0; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; font-size:17px;
    background:rgba(0,0,0,.05); } .tvzn-dark .tvzn-ic{ background:rgba(255,255,255,.08); }
  .tvzn-body{ min-width:0; flex:1; }
  .tvzn-title{ font-size:13.5px; font-weight:700; line-height:1.35; }
  .tvzn-sub{ font-size:12px; opacity:.7; margin-top:2px; line-height:1.35; }
  .tvzn-time{ font-size:10.5px; opacity:.55; margin-top:3px; text-transform:uppercase; letter-spacing:.03em; }
  .tvzn-dot{ flex-shrink:0; width:8px; height:8px; border-radius:50%; background:#2f9e44; margin-top:6px; }
  .tvzn-item:not(.unread) .tvzn-dot{ visibility:hidden; }
  .tvzn-empty{ padding:34px 20px; text-align:center; opacity:.65; font-size:13.5px; }
  .tvzn-empty .e{ font-size:30px; display:block; margin-bottom:8px; }
  .tvzn-foot{ padding:9px 14px; border-top:1px solid #eef0f3; font-size:11px; opacity:.6; text-align:center; }
  .tvzn-dark .tvzn-foot{ border-color:#2c374f; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;

  const BELL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

  /* ── Notification builders ── */
  async function buildShares(user){
    const out = [];
    try {
      const shares = await sharesForEmail(user.email);
      shares.forEach(s => {
        const m = MODULES[s.module] || {};
        out.push({
          id: 'share-' + (s.id || s.module),
          ts: s.createdAt?.toMillis?.() || Date.now(),
          icon: m.emoji || '🔗',
          title: `${s.ownerName || 'Jemand'} hat „${m.name || s.module}" mit dir geteilt`,
          body: s.role === 'edit' ? 'Du kannst bearbeiten' : 'Nur ansehen',
          href: m.page ? BASE + m.page + '?owner=' + encodeURIComponent(s.ownerUid) : BASE + 'index.html'
        });
      });
    } catch(e){ reportClientError('notif-shares', e); }
    return out;
  }

  async function buildFood(user){
    const out = [];
    try {
      const today = dstr(new Date());
      const weekAgo = dstr(new Date(Date.now() - 7 * 86400000));
      const qs = await getDocs(query(collection(db, 'foodlog', user.uid, 'entries'), where('date', '>=', weekAgo)));
      let todayCount = 0, weekCount = 0;
      qs.forEach(d => { weekCount++; if (d.data().date === today) todayCount++; });
      if (weekCount > 0 && todayCount === 0 && new Date().getHours() >= 18) {
        const t = new Date(); t.setHours(18, 0, 0, 0);
        out.push({ id: 'food-nolog-' + today, ts: t.getTime(), icon: '🍎',
          title: 'Heute noch keine Mahlzeit erfasst',
          body: 'Tippe, um deine Mahlzeiten nachzutragen.',
          href: BASE + 'pages/foodtracker.html' });
      }
    } catch(e){ reportClientError('notif-food', e); }
    return out;
  }

  async function buildReminders(user){
    const out = [];
    try {
      const today = dstr(new Date());
      const tomorrow = dstr(new Date(Date.now() + 86400000));
      const qs = await getDocs(collection(db, 'users', user.uid, 'reminders'));
      qs.forEach(snapshot => {
        const item = snapshot.data();
        if (item.completed || !item.date || item.date > tomorrow) return;
        const due = new Date(`${item.date}T${item.time || '09:00'}:00`);
        out.push({
          id: 'reminder-' + snapshot.id + '-' + item.date,
          ts: Number.isNaN(due.getTime()) ? Date.now() : due.getTime(),
          icon: '⏰',
          title: escHtml(item.title || 'Erinnerung'),
          body: item.date < today ? 'Überfällig' : item.date === today ? 'Heute fällig' : 'Morgen fällig',
          href: BASE + 'pages/planner.html#reminders'
        });
      });
    } catch(e){ reportClientError('notif-reminders', e); }
    return out;
  }

  function buildMatura(user){
    const out = [];
    try {
      const raw = localStorage.getItem('matura_tracker_' + user.uid);
      if (!raw) return out;
      const st = JSON.parse(raw);
      if (!st || !st.deadline) return out;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.ceil((new Date(st.deadline) - today) / 86400000);
      if (days < 0) {
        out.push({ id: 'matura-overdue', ts: today.getTime(), icon: '⏰',
          title: `Maturaarbeit: Abgabe war vor ${Math.abs(days)} Tag(en)`,
          body: 'Das Abgabedatum im Tracker ist überschritten.',
          href: BASE + 'pages/maturaarbeit-tracker.html' });
      } else if (days <= 60) {
        const bucket = days <= 7 ? '7' : days <= 30 ? '30' : '60';
        out.push({ id: 'matura-deadline-' + bucket, ts: today.getTime(), icon: '⏳',
          title: `Maturaarbeit: noch ${days} Tag(e) bis zur Abgabe`,
          body: days <= 7 ? 'Endspurt – die Abgabe steht kurz bevor.' : 'Behalte den Zeitplan im Blick.',
          href: BASE + 'pages/maturaarbeit-tracker.html' });
      }
    } catch(e){ reportClientError('notif-matura', e); }
    return out;
  }

  function moverNote(sym, dp, price, cur, today){
    const up = dp > 0;
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    return { id: 'mover-' + sym + '-' + today, ts: t0.getTime(), icon: up ? '📈' : '📉',
      title: `${escHtml(sym)} ${up ? '▲' : '▼'} ${Math.abs(dp).toFixed(1)}% heute`,
      body: `Kurs: ${cur}${Number(price).toLocaleString('de-CH', { maximumFractionDigits: 2 })}`,
      href: BASE + 'pages/watchlist.html' };
  }

  async function buildMovers(user){
    try {
      const c = JSON.parse(localStorage.getItem(MOVERS_CACHE) || 'null');
      if (c && Date.now() - c.ts < 5 * 60000) return c.items;
    } catch(e){}
    const items = [];
    let wl = [];
    try {
      const qs = await getDocs(collection(db, 'watchlist', user.uid, 'items'));
      wl = qs.docs.map(d => d.data());
    } catch(e){ return items; }
    if (!wl.length) { try { localStorage.setItem(MOVERS_CACHE, JSON.stringify({ ts: Date.now(), items: [] })); } catch(e){} return items; }

    const thr = Number(localStorage.getItem('tvza-wl-alertpct')) || 5;
    const today = dstr(new Date());

    const cryptos = wl.filter(i => i.type === 'crypto' && i.coinId);
    if (cryptos.length) {
      try {
        const ids = [...new Set(cryptos.map(i => i.coinId))].join(',');
        const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids) + '&price_change_percentage=24h');
        if (r.ok) {
          const data = await r.json(); const by = {}; data.forEach(d => by[d.id] = d);
          cryptos.forEach(i => { const d = by[i.coinId]; if (!d) return; const dp = d.price_change_percentage_24h;
            if (dp != null && Math.abs(dp) >= thr) items.push(moverNote(i.symbol, dp, d.current_price, '$', today)); });
        }
      } catch(e){ reportClientError('notif-crypto', e); }
    }

    const key = (localStorage.getItem('tvza-finnhub-key') || '').trim() || await getFinnhubKey();
    const stocks = wl.filter(i => i.type !== 'crypto');
    if (key && stocks.length) {
      await Promise.all(stocks.map(async i => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(i.symbol)}&token=${key}`);
          if (!r.ok) return; const d = await r.json();
          if (typeof d.dp === 'number' && Math.abs(d.dp) >= thr) items.push(moverNote(i.symbol, d.dp, d.c, '', today));
        } catch(e){}
      }));
    }
    try { localStorage.setItem(MOVERS_CACHE, JSON.stringify({ ts: Date.now(), items })); } catch(e){}
    return items;
  }

  async function buildAll(user){
    const groups = await Promise.all([ buildShares(user), buildFood(user), buildMovers(user), buildReminders(user) ]);
    const out = [].concat(...groups, buildMatura(user));
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }

  /* ── UI ── */
  function mountBell(){
    const bell = document.createElement('button');
    bell.className = 'tvzn-bell';
    bell.type = 'button';
    bell.title = 'Benachrichtigungen';
    bell.innerHTML = BELL_SVG + `<span class="tvzn-badge tvzn-hide">0</span>`;

    const actions = document.querySelector('.header-actions');
    const themeT  = document.getElementById('themeToggle');
    if (actions) actions.insertBefore(bell, actions.firstChild);
    else if (themeT) themeT.insertAdjacentElement('afterend', bell);
    else { bell.classList.add('tvzn-float'); document.body.appendChild(bell); }
    return bell;
  }

  function render(panel, notifs, read){
    const list = panel.querySelector('.tvzn-list');
    if (!notifs.length) {
      list.innerHTML = `<div class="tvzn-empty"><span class="e">🎉</span>Keine Benachrichtigungen.<br>Du bist auf dem neuesten Stand.</div>`;
      return;
    }
    list.innerHTML = notifs.map(n => {
      const unread = !read.has(n.id);
      return `<a class="tvzn-item ${unread ? 'unread' : ''}" href="${escHtml(n.href)}">
        <span class="tvzn-ic">${n.icon}</span>
        <span class="tvzn-body">
          <span class="tvzn-title">${n.title}</span>
          <span class="tvzn-sub">${escHtml(n.body)}</span>
          <span class="tvzn-time">${rel(n.ts)}</span>
        </span>
        <span class="tvzn-dot"></span>
      </a>`;
    }).join('');
  }

  function updateBadge(bell, count){
    const b = bell.querySelector('.tvzn-badge');
    if (count > 0) { b.textContent = count > 99 ? '99+' : String(count); b.classList.remove('tvzn-hide'); }
    else b.classList.add('tvzn-hide');
  }

  async function init(user){
    document.head.appendChild(styleEl);
    const bell = mountBell();

    let notifs = [];
    async function refresh(){
      try {
        notifs = await buildAll(user);
        updateBadge(bell, notifs.filter(n => !getRead().has(n.id)).length);
      } catch(e){ reportClientError('notif-refresh', e); }
    }
    await refresh();

    let panel = null, backdrop = null;
    function close(){ panel?.remove(); backdrop?.remove(); panel = backdrop = null; }
    function open(){
      if (panel) { close(); return; }
      backdrop = document.createElement('div');
      backdrop.className = 'tvzn-backdrop';
      backdrop.addEventListener('click', close);
      panel = document.createElement('div');
      panel.className = 'tvzn-panel' + (isDark() ? ' tvzn-dark' : '');
      panel.innerHTML = `
        <div class="tvzn-head"><h3>Benachrichtigungen</h3><button class="tvzn-x" title="Schliessen">&times;</button></div>
        <div class="tvzn-list"></div>
        <div class="tvzn-foot">Erinnerungen, Termine, Märkte, Food, Maturaarbeit &amp; Freigaben</div>`;
      const read = getRead();
      render(panel, notifs, read);
      panel.querySelector('.tvzn-x').addEventListener('click', close);
      panel.querySelectorAll('.tvzn-item').forEach(a =>
        a.addEventListener('click', () => { /* navigation proceeds via href */ }));
      document.body.appendChild(backdrop);
      document.body.appendChild(panel);
      // Mark everything currently shown as read
      notifs.forEach(n => read.add(n.id));
      setRead(read);
      updateBadge(bell, 0);
    }
    bell.addEventListener('click', open);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    // Refresh when the tab regains focus (cheap; movers are cached 5 min)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  /* ── Boot: wait for a signed-in user (auth persists across the origin) ── */
  function boot(){
    let done = false;
    auth.onAuthStateChanged(user => {
      if (done || !user) return;
      done = true;
      init(user).catch(e => reportClientError('notif-init', e));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
