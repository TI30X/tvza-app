/* "Heute" und die Tageszusammenfassung.

   Zweites Modul auf derselben Seite, mit eigenem requireAuth — das
   ist Absicht: es zeichnet unabhaengig vom Rest, damit ein Fehler im
   grossen Modul nicht den Tagesueberblick mitnimmt. Beide Module
   zeigen auf dasselbe Ziel, sonst waere die Weiterleitung ein
   Wettlauf. */

import { db, requireAuth, getFinnhubKey, getProfile, reportClientError } from '../../firebase-config.js';
import { weatherIcon } from '../../shell.js?v=7';
import { chooseHint, markShown, dismissHint } from '../../hints.js';
import {
  buildBriefing, renderBriefing, tagesfenster, ABEND_AB, VORSCHAU_TAGE,
} from '../../briefing.js';
import { meineGruppen, ladeTermine } from '../../groups.js';
import { alsBriefingTermine, alsVorschauTermine, isoTag } from '../../termine.js';
import { doc, getDoc, collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

(async () => {
  let user;
  /* Dasselbe Ziel wie das Modul oben: zwei Weiterleitungen auf
     verschiedene Seiten waeren ein Wettlauf, und wer ihn gewinnt,
     haengt am Netz. */
  try { user = await requireAuth('willkommen.html'); } catch (e) { return; }
  if (!user) return;
  const uid = user.uid;
  const profile = await getProfile(user);
  const $ = id => document.getElementById(id);
  const show = el => { if (el) el.hidden = false; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

  /* ── Heute (§6.1) ────────────────────────────────────────────────
     At most five rows, built from the data this module already loads
     for the tiles — nothing is fetched a second time. Order is fixed
     so the list does not reshuffle as the async sections land.

     Nachrichten is deliberately absent: it has its own tab, and §6.4
     says a thing with a tab does not also appear here. The unread
     count reaches you through the dot on the bar instead. */
  const HEUTE_ORDER = ['cal', 'food', 'matura', 'watch', 'ski'];
  const heuteRows = new Map();

  function pushHeute(key, row) {
    if (!row) return;
    heuteRows.set(key, row);
    renderHeute();
  }

  function renderHeute() {
    const list = $('heuteList'), sec = $('heuteSection');
    if (!list || !sec) return;
    const rows = HEUTE_ORDER.filter(k => heuteRows.has(k)).map(k => heuteRows.get(k)).slice(0, 5);
    // Rule §8.2 applies here too: nothing worth saying, nothing shown.
    if (!rows.length) { sec.hidden = true; return; }
    sec.hidden = false;
    list.innerHTML = rows.map(r => `
      <a class="row" href="${esc(r.href)}" data-bereich="${esc(r.bereich)}">
        <span class="row__icon">${r.icon}</span>
        <span class="row__body">
          <span class="row__title">${esc(r.title)}</span>
          ${r.bar != null
            ? `<span class="row__bar"><i style="width:${Math.max(0, Math.min(100, r.bar))}%"></i></span>`
            : r.sub ? `<span class="row__sub">${esc(r.sub)}</span>` : ''}
        </span>
        <span class="row__end">${r.end
          ? `<span class="row__num"${r.tone ? ` style="color:var(--kurs-${r.tone})"` : ''}>${esc(r.end)}</span>`
          : `<svg class="ic row__chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`}</span>
      </a>`).join('');
  }

  /* ── 1) Maturaarbeit: Fortschritt + Abgabe-Countdown (localStorage) ── */
  /* Jede Kachel spiegelt den Gesamtfortschritt ihres eigenen Moduls wider:
     tileMatura ← matura_v3 (Maturaarbeit-Modul), tileMaturaTracker ← matura_tracker (Tracker-Modul). */
  (function matura() {
    const paintTile = (idn, pct, days) => {
      if (pct == null) return;
      const el = $(idn); if (!el) return;
      const meta = (days == null) ? '' : `<span class="tl-meta">${days === 0 ? 'Abgabe heute' : days + ' Tage'}</span>`;
      el.innerHTML = `<div class="tl-head"><span class="tl-pct">${pct}%</span>${meta}</div><div class="tl-bar"><div class="tl-fill"></div></div>`;
      show(el);
      requestAnimationFrame(() => { const f = el.querySelector('.tl-fill'); if (f) f.style.width = pct + '%'; });
      // Only the Maturaarbeit module earns the Heute row; the Tracker
      // is the same work counted twice and would read as two entries.
      if (idn === 'tileMatura') {
        window.tvzaMaturaPct = pct;
        pushHeute('matura', {
          href: 'pages/maturaarbeit.html', bereich: 'matura',
          icon: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
          title: days == null ? 'Maturaarbeit'
               : days === 0 ? 'Maturaarbeit — Abgabe heute'
               : `Maturaarbeit — noch ${days} Tage`,
          bar: pct, end: pct + ' %',
        });
      }
    };

    // Tracker-Modul (pages/maturaarbeit-tracker.html) → matura_tracker_<uid>_summary
    let tPct = null, tDays = null;
    try {
      const sumRaw = localStorage.getItem('matura_tracker_' + uid + '_summary');
      if (sumRaw) {
        const s = JSON.parse(sumRaw);
        tPct = s.pct; tDays = (s.days == null ? null : s.days);
      } else {
        const raw = localStorage.getItem('matura_tracker_' + uid);
        if (raw) {
          const st = JSON.parse(raw || '{}');
          const IDS = ['p1a','p1b','p1c','p1d','p2a','p2b','p2c','p3a','p3b','p4a','p4b','p4c','p4d','p4e',
                       'vg1','vg2','vg3','vg4','vg5','vg6','vg7','vg8','meeting_1','meeting_2','meeting_3','meeting_4'];
          const done = IDS.filter(id => st[id]).length;
          tPct = Math.round(done / IDS.length * 100);
          if (st.deadline) { const t = new Date(); t.setHours(0,0,0,0); tDays = Math.max(0, Math.ceil((new Date(st.deadline) - t) / 86400000)); }
        }
      }
    } catch (e) {}

    // Maturaarbeit-Modul (pages/maturaarbeit.html) → matura_v3_summary,
    // Fallback auf den Tracker-Wert, falls das Modul noch nie geöffnet wurde.
    let mPct = null, mDays = null;
    try {
      const sumRaw = localStorage.getItem('matura_v3_summary');
      if (sumRaw) { const s = JSON.parse(sumRaw); mPct = s.pct; mDays = (s.days == null ? null : s.days); }
    } catch (e) {}
    if (mPct == null) { mPct = tPct; mDays = tDays; }

    // Beide Kacheln zeigen immer einen Fortschritt.
    paintTile('tileMatura', mPct, mDays);
    paintTile('tileMaturaTracker', (tPct != null ? tPct : mPct), (tPct != null ? tDays : mDays));
  })();

  /* ── 2) Wetter: aktuelle Bedingung + Regenwahrscheinlichkeit (keine Temperatur) ── */
  (async function weather() {
    const el = $('tileWeather'); if (!el) return;
    const EMOJI = c => weatherIcon(c, 15);
    const LABEL = c => c===0?'Klar':c===1?'Heiter':c===2?'Wolkig':c===3?'Bewölkt':(c===45||c===48)?'Nebel':(c>=51&&c<=57)?'Niesel':(c>=61&&c<=67)?'Regen':(c>=71&&c<=77)?'Schnee':(c>=80&&c<=82)?'Schauer':(c===85||c===86)?'Schnee':c>=95?'Gewitter':'Wechselnd';
    let loc = { latitude:47.141, longitude:9.521 };
    try { const v = JSON.parse(localStorage.getItem('tvza-weather-loc') || 'null'); if (v && v.latitude != null) loc = v; } catch (e) {}
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=weather_code&daily=precipitation_probability_max&timezone=auto&forecast_days=1`);
      if (!r.ok) return; const j = await r.json(); const code = j.current && j.current.weather_code; if (code == null) return;
      const pop = j.daily && Array.isArray(j.daily.precipitation_probability_max) ? j.daily.precipitation_probability_max[0] : null;
      const popHtml = (pop != null) ? `<span class="wxl-pop">💧 ${pop}%</span>` : '';
      el.innerHTML = `<span class="wxl-ic">${EMOJI(code)}</span><span class="wxl-lab">${LABEL(code)}</span>${popHtml}`;
      show(el);
    } catch (e) {}
  })();

  /* ── 3) Watchlist: rotierende Live-Kurse (Finnhub / CoinGecko / Yahoo) ── */
  (async function watchlist() {
    const el = $('tileWatch'); if (!el) return;
    let items = [];
    try { const snap = await getDocs(collection(db, 'watchlist', uid, 'items')); items = snap.docs.map(d => ({ id:d.id, ...d.data() })); } catch (e) { return; }
    if (!items.length) return;
    const sectionOf = i => { const s = i.symbol || ''; if (i.type==='crypto') return 'crypto'; if (i.type==='fx'||s.includes('=X')) return 'fx'; if (i.type==='index'||s.startsWith('^')) return 'index'; if (i.type==='etf') return 'etf'; return 'stock'; };
    const isYahoo = i => { const s = i.symbol || ''; const sec = sectionOf(i); return sec==='index'||sec==='fx'||s.startsWith('^')||s.includes('=X')||s.includes('.'); };
    const quotes = new Map();
    const CORS = ['', 'https://corsproxy.io/?url=', 'https://api.allorigins.win/raw?url='];
    const corsJson = async url => { for (const p of CORS) { try { const r = await fetch(p ? p + encodeURIComponent(url) : url); if (!r.ok) continue; const j = await r.json(); if (j) return j; } catch (e) {} } return null; };
    const CUR = { USD:'$', EUR:'€', GBP:'£', JPY:'¥', KRW:'₩', CHF:'CHF ', CNY:'¥', AUD:'A$' };
    const localKey = (() => { try { return (localStorage.getItem('tvza-finnhub-key') || '').trim(); } catch (e) { return ''; } })();
    const key = localKey || await getFinnhubKey();
    const yhFetch = async i => { const j = await corsJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(i.symbol)}?range=1d&interval=1d`); const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta; if (!m || typeof m.regularMarketPrice !== 'number') return; const price = m.regularMarketPrice; const prev = (typeof m.chartPreviousClose==='number') ? m.chartPreviousClose : (typeof m.previousClose==='number' ? m.previousClose : null); const dp = (prev && prev!==0) ? (price-prev)/prev*100 : null; const cur = sectionOf(i)==='fx' ? '' : (CUR[m.currency] || ''); quotes.set(i.id, { price, dp, cur }); };
    const cryptos = items.filter(i => i.type==='crypto' && i.coinId);
    const rest = items.filter(i => i.type!=='crypto');
    const yh = rest.filter(isYahoo); const fn = rest.filter(i => !isYahoo(i));
    const tasks = [];
    if (cryptos.length) tasks.push((async () => { try { const ids = [...new Set(cryptos.map(i => i.coinId))].join(','); const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids) + '&price_change_percentage=24h'); if (!r.ok) return; const d = await r.json(); const by = {}; d.forEach(x => by[x.id] = x); cryptos.forEach(i => { const x = by[i.coinId]; if (x) quotes.set(i.id, { price:x.current_price, dp:x.price_change_percentage_24h, cur:'$' }); }); } catch (e) {} })());
    fn.forEach(i => tasks.push((async () => { if (!key) return; try { const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(i.symbol)}&token=${key}`); if (!r.ok) return; const d = await r.json(); if (d && typeof d.c==='number' && d.c>0) quotes.set(i.id, { price:d.c, dp:d.dp, cur:'$' }); } catch (e) {} })()));
    yh.forEach(i => tasks.push((async () => { try { await yhFetch(i); } catch (e) {} })()));
    await Promise.all(tasks);
    const retry = fn.filter(i => !quotes.get(i.id));
    if (retry.length) await Promise.all(retry.map(i => yhFetch(i).catch(() => {})));
    const fmt = (n, cur) => { if (n == null || isNaN(n)) return '—'; const dec = Math.abs(n) < 10 ? 4 : 2; return (cur || '') + n.toLocaleString('de-CH', { minimumFractionDigits:dec, maximumFractionDigits:dec }); };
    const cleanSym = i => (i.symbol || '').replace(/^\^/, '').replace('=X', '');
    const list = items.map(i => { const q = quotes.get(i.id); if (!q || q.price == null) return null; return { sym:cleanSym(i), px:fmt(q.price, q.cur), dp:q.dp }; }).filter(Boolean);
    if (!list.length) return;
    const dpHtml = dp => dp == null ? '' : `<span class="tk-dp ${dp >= 0 ? 'up' : 'down'}">${dp >= 0 ? '▲' : '▼'}${Math.abs(dp).toFixed(2)}%</span>`;
    let idx = 0;
    const render = () => {
      const q = list[idx];
      el.innerHTML = `<div class="tk-quote"><div class="tk-top"><span class="tk-sym">${esc(q.sym)}</span>${dpHtml(q.dp)}</div><span class="tk-px">${q.px}</span></div>`;
    };
    render(); show(el);
    const moved = list.filter(q => q.dp != null);
    if (moved.length) {
      const lead = moved.reduce((a, b) => Math.abs(b.dp) > Math.abs(a.dp) ? b : a);
      pushHeute('watch', {
        href: 'pages/watchlist.html', bereich: 'watch',
        icon: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        title: lead.sym,
        sub: moved.length > 1 ? `${moved.length} Positionen` : 'Watchlist',
        end: `${lead.dp >= 0 ? '+' : ''}${lead.dp.toFixed(2)} %`,
        tone: lead.dp >= 0 ? 'up' : 'down',
      });
    }
    if (list.length > 1) setInterval(() => { el.classList.add('swap'); setTimeout(() => { idx = (idx + 1) % list.length; render(); el.classList.remove('swap'); }, 350); }, 3600);
  })();

  /* ── 4) Food: kcal heute (Firestore) ── */
  (async function food() {
    const el = $('tileFood'); if (!el) return;
    try {
      const snap = await getDocs(query(collection(db, 'foodlog', uid, 'entries'), where('date','==',todayStr)));
      let total = 0; snap.forEach(d => { total += (d.data().kcal || 0); });
      total = Math.round(total);
      let target = null;
      try { const ps = await getDoc(doc(db, 'foodlog', uid, 'meta', 'profile')); if (ps.exists()) { const p = ps.data(); if (p.weight) { let b = p.weight * 30; if (p.goal === 'abnehmen') b -= 300; if (p.goal === 'zunehmen') b += 300; target = Math.round(b / 10) * 10; } } } catch (e) {}
      const FOOD_ICON = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>';
      if (target) {
        const pct = Math.min(100, Math.round(total / target * 100));
        el.innerHTML = `<div class="tl-head"><span class="tl-pct">${total.toLocaleString('de-CH')}</span><span class="tl-meta">/ ${target.toLocaleString('de-CH')} kcal</span></div><div class="tl-bar"><div class="tl-fill"></div></div>`;
        show(el); requestAnimationFrame(() => { const f = el.querySelector('.tl-fill'); if (f) f.style.width = pct + '%'; });
        const left = target - total;
        pushHeute('food', {
          href: 'pages/foodtracker.html', bereich: 'food', icon: FOOD_ICON,
          title: left > 0 ? `Noch ${left.toLocaleString('de-CH')} kcal übrig` : 'Tagesziel erreicht',
          bar: pct,
          end: total.toLocaleString('de-CH'),
        });
      } else {
        el.innerHTML = `<div class="tile-status"><span class="st-main">${total.toLocaleString('de-CH')}</span><span class="st-sub">kcal heute</span></div>`;
        show(el);
        if (total > 0) pushHeute('food', {
          href: 'pages/foodtracker.html', bereich: 'food', icon: FOOD_ICON,
          title: 'Heute erfasst', sub: 'Kein Tagesziel hinterlegt',
          end: total.toLocaleString('de-CH'),
        });
      }
    } catch (e) {}
  })();

  /* ── 5) Kalender: nächster Eintrag — besondere Tage + Familienreisen (Firestore) ── */
  (async function cal() {
    const el = $('tileTrip'); if (!el) return;
    try {
      const candidates = [];
      const familySnap = await getDocs(query(collection(db, 'families'), where('members','array-contains',uid)));
      const familyIds = new Set(familySnap.docs.map(doc => doc.id));
      const daySnap = await getDocs(query(collection(db, 'calendarDays'), where('ownerUid','==',uid)));
      // Publish the raw entries for the Hinweis (§8). The birthday
      // pairing needs recurring ones; the data model has no such flag
      // yet, so nothing is inferred and that hint simply stays quiet
      // until one exists. Everything else here is a plain appointment.
      window.tvzaCalendarEntries = daySnap.docs.map(d => d.data());
      window.tvzaRecurringEvents = window.tvzaCalendarEntries.filter(x => x && x.recurring === true);
      daySnap.docs.forEach(d => { const x = d.data(); if (x.date && x.date >= todayStr) candidates.push({ date: x.date, title: x.title || 'Termin' }); });
      try {
        const reminderSnap = await getDocs(collection(db, 'users', uid, 'reminders'));
        reminderSnap.docs.forEach(d => {
          const x = d.data();
          if (x.completed || !x.date) return;
          candidates.push({
            date:x.date < todayStr ? todayStr : x.date,
            title:x.title || 'Erinnerung',
            reminder:true,
            overdue:x.date < todayStr
          });
        });
      } catch (e) { reportClientError('calendar-tile-reminders', e); }
      try {
        // Reisen werden pro Gruppe geladen. Eine Sammelabfrage über alle
        // Reisen lehnen die Firestore-Regeln ab, weil fremde Gruppen für
        // Nichtmitglieder unsichtbar sind.
        const tripSnaps = await Promise.all([...familyIds].map(familyId =>
          getDocs(query(collection(db, 'trips'), where('familyId','==',familyId)))
        ));
        tripSnaps.flatMap(snap => snap.docs).forEach(d => {
          const x = d.data(); if (!x.startDate) return;
          const mine = familyIds.has(x.familyId);
          if (!mine) return;
          // Bereits laufende Reisen (Start in der Vergangenheit, Ende noch nicht erreicht) zählen als "heute".
          const ongoing = x.startDate < todayStr && (!x.endDate || x.endDate >= todayStr);
          if (ongoing) candidates.push({ date: todayStr, title: x.name || 'Reise' });
          else if (x.startDate >= todayStr) candidates.push({ date: x.startDate, title: x.name || 'Reise' });
        });
      } catch (e) { reportClientError('calendar-tile-trips', e); }
      if (!candidates.length) return;
      candidates.sort((a, b) => a.date < b.date ? -1 : 1);
      /* Was heute ansteht, fuer die Tageszusammenfassung. Alle Quellen
         hier — Erinnerungen und Reisen — tragen ein Datum ohne
         Uhrzeit, darum ganztags: true. Ohne das behauptete die Karte
         "Heute um 00:00". */
      window.tvzaHeuteTermine = candidates
        .filter(c => c.date === todayStr)
        .map(c => ({ titel: c.title, start: new Date(c.date + 'T00:00:00'), ganztags: true }));
      const ev = candidates[0];
      const t = new Date(); t.setHours(0,0,0,0);
      const days = Math.ceil((new Date(ev.date + 'T00:00:00') - t) / 86400000);
      let when;
      if (ev.overdue) when = 'Überfällig';
      else if (days <= 0) when = ev.reminder ? 'Heute fällig' : 'Heute';
      else if (days === 1) when = 'Morgen';
      else if (days < 14) when = `in ${days} Tagen`;
      else if (days < 60) when = `in ${Math.round(days / 7)} Wochen`;
      else when = `in ${Math.round(days / 30)} Monaten`;
      el.innerHTML = `<span class="tp-when">${when}</span><span class="tp-what">${esc(ev.title)}</span>`;
      show(el);
      pushHeute('cal', {
        href: 'pages/planner.html', bereich: 'kalender',
        icon: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
        title: ev.title, sub: when,
      });
    } catch (e) { reportClientError('calendar-tile', e); }
  })();

  /* ── 6) Nachrichten: letzte Unterhaltung (Firestore) ── */
  (async function dm() {
    const el = $('tileDm'); if (!el) return;
    const toMs = t => (t && t.toMillis) ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : 0);
    try {
      const snap = await getDocs(query(collection(db, 'dms'), where('participants', 'array-contains', uid)));
      const convs = snap.docs.map(d => d.data()).filter(c => c.lastMessage).sort((a, b) => toMs(b.lastAt) - toMs(a.lastAt));
      if (!convs.length) return;
      const c = convs[0];
      const other = (c.participants || []).find(u => u !== uid);
      const name = (c.participantNames && c.participantNames[other]) || 'Unbekannt';
      const prev = (c.lastSender === uid ? 'Du: ' : '') + c.lastMessage;
      el.innerHTML = `<span class="dm-name">${esc(name)}</span><span class="dm-prev">${esc(prev)}</span>`;
      show(el);
    } catch (e) {}
  })();

  /* ── 7) Ski Tracker: Anzahl Skis + letzte Wartung (Firestore) ── */
  (async function ski() {
    const el = $('tileSki'); if (!el) return;
    const fmtDM = s => { const p = String(s).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.` : s; };
    try {
      const skiSnap = await getDocs(collection(db, 'skitracker', uid, 'skis'));
      const n = skiSnap.size;
      if (!n) return;
      let lastDate = null;
      try {
        const logSnap = await getDocs(collection(db, 'skitracker', uid, 'logs'));
        const logs = logSnap.docs.map(d => d.data()).filter(l => l.date).sort((a, b) => a.date < b.date ? 1 : -1);
        if (logs.length) lastDate = logs[0].date;
      } catch (e) {}
      const sub = lastDate ? `zuletzt ${fmtDM(lastDate)}` : 'Keine Wartung';
      el.innerHTML = `<span class="st-main">${n} Ski</span><span class="st-sub">${sub}</span>`;
      show(el);
      const days = lastDate
        ? Math.round((Date.now() - new Date(lastDate + 'T00:00:00')) / 86400000) : null;
      window.tvzaSkiServiceDays = days;
      pushHeute('ski', {
        href: 'pages/skitracker.html', bereich: 'ski',
        icon: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path d="M8 3l4 8 5-5 5 15H2L8 3z"/></svg>',
        title: n === 1 ? 'Ski-Service' : `Ski-Service (${n} Paar)`,
        sub: days == null ? 'Noch keine Wartung erfasst'
           : days === 0 ? 'Heute gewachst'
           : `Vor ${days} Tagen gewachst`,
      });
    } catch (e) {}
  })();

  /* ── Die Tageszusammenfassung (§8) ───────────────────────────────
     Läuft, nachdem die Abschnitte oben Gelegenheit hatten zu melden.

     Zwei Dinge stecken in einer Karte: was heute ansteht (ein Satz —
     die Liste steht schon darunter) und der Hinweis aus hints.js, der
     weiterhin zwei Quellen verlangt. Ist beides leer, erscheint gar
     nichts. Eine Karte, die "Heute ist nichts los" sagt, ist der
     Grund, warum man ab Tag drei wegschaut.

     markShown() zählt nur, wenn wirklich ein Hinweis drin war: Regel 1
     begrenzt die Hinweise, nicht den Tagesüberblick. */
  /* Die Projektseite ist ein Link, den man verschickt, und kein Ort
     in der App. Der Knopf ruft sie darum nicht auf, sondern legt ihre
     Adresse in die Zwischenablage. */
  $('publicPageLink')?.addEventListener('click', async () => {
    const adresse = new URL('public.html', location.href).href;
    const btn = $('publicPageLink');
    const feld = btn.querySelector('span[data-i18n]') || btn;
    const alt = feld.textContent;
    try {
      await navigator.clipboard.writeText(adresse);
      feld.textContent = 'Kopiert';
      setTimeout(() => { feld.textContent = alt; }, 1600);
    } catch {
      /* Ohne Zwischenablage — älteres iOS, kein sicherer Kontext —
         bleibt die Adresse wenigstens lesbar. */
      prompt('Link zur Projektseite:', adresse);
    }
  });

  /* Was heute in einer Gruppe läuft, gehört in die Zusammenfassung —
     ein Training um 14:00 ist Teil deines Tages, auch wenn es der
     Trainer eingetragen hat.

     Läuft früh los, damit es bis zur Karte da ist, und liegt
     vollständig in einem catch: die Gruppenabfrage ist das Einzige
     auf dieser Seite, das den COLLECTION_GROUP-Index braucht. Fehlt
     er, bleibt die Zusammenfassung bei den eigenen Terminen, statt
     ganz auszufallen. */
  /* Dieselbe Abfrage liefert beides: was am Stichtag laeuft, und was
     in den zwei Wochen danach kommt. Zweimal zu laden waere derselbe
     Weg fuer dieselben Daten. */
  const gruppenTermine = (async () => {
    try {
      const gruppen = await meineGruppen(uid);
      const listen = await Promise.all(gruppen.map(async g => {
        try { return await ladeTermine(g.id); } catch { return []; }
      }));
      return listen.flat();
    } catch { return []; }
  })();

  setTimeout(async () => {
    try {
      const slot = $('hintSlot'); if (!slot) return;
      const cal = heuteRows.get('cal');
      const sources = {
        // Kalender × Wetter needs the hourly forecast, which only the
        // Wetter page fetches; until that is shared this pair stays
        // quiet rather than guessing.
        nextEvent: null, forecast: null,
        snow: window.tvzaMountainSnow || null,
        daysSinceService: window.tvzaSkiServiceDays,
        events: window.tvzaRecurringEvents || null,
        matura: window.tvzaMaturaSummary || null,
        maturaDue: window.tvzaMaturaDue || null,
      };
      const hint = chooseHint(sources, uid);

      /* Auf die Gruppentermine wird gewartet, aber nicht ewig: eine
         langsame Verbindung darf die Karte nicht verschlucken.
         Kommen sie zu spät, steht der eigene Tag trotzdem da. */
      const roh = await Promise.race([
        gruppenTermine,
        new Promise(fertig => setTimeout(() => fertig([]), 900)),
      ]);

      /* Der Stichtag folgt dem Fenster: am Abend zeigt die Karte
         morgen, also muss auch der Tagesteil von morgen kommen. */
      const jetzt = new Date();
      const fenster = tagesfenster(jetzt, ABEND_AB);
      const stichtag = isoTag(fenster.tag);

      const bis = new Date(fenster.tag);
      bis.setDate(bis.getDate() + VORSCHAU_TAGE);
      const abMorgen = new Date(fenster.tag);
      abMorgen.setDate(abMorgen.getDate() + 1);

      const briefing = buildBriefing({
        termine: [
          ...(window.tvzaHeuteTermine || []),
          ...alsBriefingTermine(roh, stichtag),
          ...alsVorschauTermine(roh, isoTag(abMorgen), isoTag(bis)),
        ],
        hint,
        now: jetzt,
        abendAb: ABEND_AB,
      });
      if (!briefing) return;

      slot.appendChild(renderBriefing(briefing, {
        onDismiss: typ => { if (typ) dismissHint(uid, typ, 'today'); },
        onLater:   typ => { if (typ) dismissHint(uid, typ, 'later'); },
      }));
      if (briefing.hinweisTyp) markShown(uid);
    } catch (e) { reportClientError('briefing', e); }
  }, 1200);
})();
