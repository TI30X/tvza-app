/* TVZA — Welcome-Animation (Elegant Reveal)
 *
 * Zeigt beim Öffnen eine edle Begrüssung mit der TvZ-Wortmarke.
 * - Spielt nach frischem Login (sessionStorage-Flag aus login.html)
 *   ODER beim ersten Öffnen pro Tag (localStorage-Datumsschlüssel).
 * - Klick / Tippen / beliebige Taste / Scrollen bricht sofort ab (Zeitsparen).
 * - Respektiert prefers-reduced-motion.
 *
 * Einbinden: <script src="welcome.js?v=1"></script> direkt nach <body>.
 */
(() => {
  'use strict';

  const DAY_KEY     = 'tvza-welcome-day';     // letztes Anzeige-Datum (YYYY-MM-DD)
  const LOGIN_FLAG  = 'tvza-just-logged-in';  // von login.html gesetzt
  const today       = new Date().toISOString().slice(0, 10);

  const justLoggedIn = sessionStorage.getItem(LOGIN_FLAG) === '1';
  const firstToday   = localStorage.getItem(DAY_KEY) !== today;

  // Nichts tun, wenn weder frischer Login noch erster Aufruf des Tages.
  if (!justLoggedIn && !firstToday) return;

  // Flags direkt verbrauchen, damit es nicht mehrfach auslöst.
  sessionStorage.removeItem(LOGIN_FLAG);
  localStorage.setItem(DAY_KEY, today);

  const reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- Styles ---------------------------------------------------------------
  const css = `
  #tvza-welcome{
    position:fixed; inset:0; z-index:99999;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:
      radial-gradient(120% 90% at 50% 38%, rgba(15,52,96,.55), transparent 60%),
      linear-gradient(135deg,#1a1a2e,#16213e 55%,#0f3460);
    color:#fff; overflow:hidden; cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    opacity:1; transition:opacity .5s ease, visibility .5s ease;
  }
  #tvza-welcome.tvza-closing{ opacity:0; visibility:hidden; }
  #tvza-welcome .tvza-glow{
    position:absolute; width:62vmin; height:62vmin; border-radius:50%;
    background:radial-gradient(circle, rgba(120,160,230,.30), transparent 65%);
    filter:blur(8px); opacity:0; transform:scale(.7);
    animation:tvzaGlow 2.6s ease forwards;
  }
  #tvza-welcome .tvza-ring{
    position:absolute; width:48vmin; height:48vmin; border-radius:50%;
    border:1px solid rgba(255,255,255,.10);
    opacity:0; transform:scale(.6);
    animation:tvzaRing 2.4s cubic-bezier(.22,.61,.36,1) forwards;
  }
  #tvza-welcome .tvza-mark{
    position:relative; font-family:Georgia,'Times New Roman',serif;
    font-weight:700; line-height:1; letter-spacing:.01em;
    font-size:clamp(64px,17vw,148px);
    display:flex; gap:.02em;
    text-shadow:0 6px 30px rgba(0,0,0,.35);
  }
  #tvza-welcome .tvza-mark span{
    display:inline-block; opacity:0;
    transform:translateY(22px); filter:blur(8px);
    animation:tvzaLetter .8s cubic-bezier(.22,.61,.36,1) forwards;
  }
  #tvza-welcome .tvza-mark span:nth-child(1){ animation-delay:.15s; }
  #tvza-welcome .tvza-mark span:nth-child(2){ animation-delay:.30s; }
  #tvza-welcome .tvza-mark span:nth-child(3){ animation-delay:.45s; }
  #tvza-welcome .tvza-line{
    width:0; height:1px; margin-top:22px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);
    animation:tvzaLine .9s ease .7s forwards;
  }
  #tvza-welcome .tvza-sub{
    margin-top:18px; font-family:'Hanken Grotesk',system-ui,sans-serif;
    font-size:clamp(12px,2.4vw,15px); letter-spacing:.34em; text-transform:uppercase;
    color:rgba(255,255,255,.72); opacity:0;
    animation:tvzaFade .8s ease 1.05s forwards;
  }
  #tvza-welcome .tvza-hint{
    position:absolute; bottom:max(26px,env(safe-area-inset-bottom));
    font-family:'Hanken Grotesk',system-ui,sans-serif;
    font-size:9px; letter-spacing:.1em; color:rgba(255,255,255,.32);
    opacity:0; animation:tvzaFade 1s ease 1.6s forwards;
  }
  @keyframes tvzaLetter{ to{ opacity:1; transform:translateY(0); filter:blur(0); } }
  @keyframes tvzaLine{ to{ width:min(240px,52vw); } }
  @keyframes tvzaFade{ to{ opacity:1; } }
  @keyframes tvzaGlow{
    35%{ opacity:1; transform:scale(1); }
    100%{ opacity:.55; transform:scale(1.04); }
  }
  @keyframes tvzaRing{
    40%{ opacity:1; transform:scale(1); }
    100%{ opacity:.35; transform:scale(1.12); }
  }
  @media (prefers-reduced-motion: reduce){
    #tvza-welcome .tvza-glow,#tvza-welcome .tvza-ring,
    #tvza-welcome .tvza-mark span,#tvza-welcome .tvza-line,
    #tvza-welcome .tvza-sub,#tvza-welcome .tvza-hint{
      animation:none !important; opacity:1 !important;
      transform:none !important; filter:none !important; width:auto;
    }
    #tvza-welcome .tvza-line{ width:min(240px,52vw); }
  }`;

  const style = document.createElement('style');
  style.textContent = css;

  // ---- Overlay --------------------------------------------------------------
  const el = document.createElement('div');
  el.id = 'tvza-welcome';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Willkommen bei TVZA');
  el.innerHTML = `
    <div class="tvza-glow"></div>
    <div class="tvza-ring"></div>
    <div class="tvza-mark"><span>T</span><span>v</span><span>Z</span></div>
    <div class="tvza-line"></div>
    <div class="tvza-sub">Willkommen</div>
    <div class="tvza-hint">Tippen zum Überspringen</div>`;

  // Verhindert Scrollen des Hintergrunds während der Animation.
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.documentElement.style.overflow = prevOverflow;
    el.classList.add('tvza-closing');
    cleanup();
    setTimeout(() => el.remove(), 520);
  }

  function onScroll() { close(); }
  function cleanup() {
    ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(
      ev => el.removeEventListener(ev, close)
    );
    window.removeEventListener('keydown', close);
    window.removeEventListener('wheel', onScroll);
    window.removeEventListener('touchmove', onScroll);
    clearTimeout(autoTimer);
  }

  function mount() {
    document.head.appendChild(style);
    document.body.appendChild(el);
    el.addEventListener('click', close);
    el.addEventListener('pointerdown', close);
    el.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('keydown', close);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
  }

  // Automatisches Schliessen nach Ablauf.
  const autoTimer = setTimeout(close, reduce ? 1100 : 2900);

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
