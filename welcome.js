/* TVZA — Welcome screen
 * Plays on EVERY load while the app loads in the background (it's just an
 * overlay — nothing is blocked). Greets the user by name: the name is read
 * from localStorage instantly, and also updated live via the 'tvza-name'
 * event that index.html fires once the Firebase profile is loaded.
 * Tap / key / scroll skips. Respects prefers-reduced-motion.
 */
(() => {
  'use strict';

  const reduce = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const hour = new Date().getHours();
  const greetWord = hour < 5 ? 'Gute Nacht'
    : hour < 11 ? 'Guten Morgen'
    : hour < 17 ? 'Hallo'
    : hour < 22 ? 'Guten Abend'
    : 'Gute Nacht';

  function firstOf(n) { n = (n || '').trim(); return n ? n.split(/\s+/)[0] : ''; }
  function greetLine(n) { const f = firstOf(n); return f ? `${greetWord}, ${f}` : 'Willkommen'; }

  let cached = '';
  try { cached = localStorage.getItem('tvza-name') || ''; } catch (e) {}

  const css = `
  #tvza-welcome{
    position:fixed; inset:0; z-index:99999; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:linear-gradient(135deg,#1a1a2e,#16213e 55%,#0f3460);
    color:#fff; cursor:pointer; -webkit-tap-highlight-color:transparent;
    opacity:1; transition:opacity .55s ease, visibility .55s ease;
  }
  #tvza-welcome.tvza-closing{ opacity:0; visibility:hidden; }
  #tvza-welcome .tvza-grad{
    position:absolute; inset:-20%;
    background:radial-gradient(40% 40% at 30% 30%, rgba(99,140,225,.40), transparent 60%),
               radial-gradient(45% 45% at 72% 68%, rgba(15,52,96,.55), transparent 62%);
    animation:tvzaGrad 9s ease-in-out infinite alternate; filter:blur(6px);
  }
  #tvza-welcome .blob{
    position:absolute; width:46vmin; height:46vmin; filter:blur(14px); opacity:.55; mix-blend-mode:screen;
    will-change:border-radius, transform;
  }
  #tvza-welcome .b1{ background:radial-gradient(circle at 40% 40%, #5b7fe0, transparent 65%);
    top:8%; left:6%; animation:morph 8s ease-in-out infinite, drift1 14s ease-in-out infinite; }
  #tvza-welcome .b2{ background:radial-gradient(circle at 50% 50%, #2a6db5, transparent 65%);
    bottom:6%; right:4%; animation:morph 10s ease-in-out infinite reverse, drift2 17s ease-in-out infinite; }
  #tvza-welcome .b3{ background:radial-gradient(circle at 50% 50%, #7a5bd0, transparent 65%);
    top:40%; left:48%; width:38vmin; height:38vmin; animation:morph 12s ease-in-out infinite, drift3 20s ease-in-out infinite; }
  #tvza-welcome .tvza-inner{ position:relative; text-align:center; padding:24px; }
  #tvza-welcome .tvza-mark{
    font-family:Georgia,'Times New Roman',serif; font-weight:700; font-size:clamp(30px,8vw,54px);
    line-height:1; letter-spacing:.02em; color:rgba(255,255,255,.92); text-shadow:0 6px 30px rgba(0,0,0,.35);
    opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px);
    animation:tvzaReveal .85s cubic-bezier(.22,.61,.36,1) .05s forwards;
  }
  #tvza-welcome .tvza-line{
    margin-top:16px; font-family:'Hanken Grotesk',system-ui,sans-serif;
    font-size:clamp(26px,7vw,42px); font-weight:700; letter-spacing:-.01em;
    opacity:0; transform:translateY(14px); animation:tvzaUp .8s cubic-bezier(.22,.61,.36,1) .4s forwards;
  }
  #tvza-welcome .tvza-line.tvza-swap{ animation:tvzaSwap .5s cubic-bezier(.22,.61,.36,1); }
  #tvza-welcome .tvza-sub{
    margin-top:10px; font-family:'Hanken Grotesk',system-ui,sans-serif;
    font-size:clamp(11px,2.6vw,13px); letter-spacing:.3em; text-transform:uppercase;
    color:rgba(255,255,255,.6); opacity:0; animation:tvzaFade .8s ease .75s forwards;
  }
  #tvza-welcome .tvza-hint{
    position:absolute; bottom:max(26px,env(safe-area-inset-bottom)); left:0; right:0;
    text-align:center; font-family:'Hanken Grotesk',system-ui,sans-serif;
    font-size:9px; letter-spacing:.1em; color:rgba(255,255,255,.3); opacity:0;
    animation:tvzaFade 1s ease 1.5s forwards;
  }
  @keyframes tvzaReveal{ to{ opacity:1; transform:translateY(0) scale(1); filter:blur(0); } }
  @keyframes tvzaUp{ to{ opacity:1; transform:translateY(0); } }
  @keyframes tvzaSwap{ from{ opacity:.2; transform:translateY(8px); } to{ opacity:1; transform:translateY(0); } }
  @keyframes tvzaFade{ to{ opacity:1; } }
  @keyframes tvzaGrad{ 0%{ transform:translate(-3%,-2%) scale(1); } 100%{ transform:translate(3%,2%) scale(1.08); } }
  @keyframes morph{
    0%{ border-radius:42% 58% 63% 37% / 45% 38% 62% 55%; }
    50%{ border-radius:60% 40% 33% 67% / 55% 62% 38% 45%; }
    100%{ border-radius:42% 58% 63% 37% / 45% 38% 62% 55%; }
  }
  @keyframes drift1{ 0%,100%{ transform:translate(0,0) rotate(0deg); } 50%{ transform:translate(6vmin,4vmin) rotate(18deg); } }
  @keyframes drift2{ 0%,100%{ transform:translate(0,0) rotate(0deg); } 50%{ transform:translate(-7vmin,-3vmin) rotate(-22deg); } }
  @keyframes drift3{ 0%,100%{ transform:translate(-50%,-40%) rotate(0deg); } 50%{ transform:translate(-44%,-46%) rotate(25deg); } }
  @media (prefers-reduced-motion: reduce){
    #tvza-welcome .tvza-grad,#tvza-welcome .blob{ animation:none; }
    #tvza-welcome .tvza-mark,#tvza-welcome .tvza-line,#tvza-welcome .tvza-sub,#tvza-welcome .tvza-hint{
      animation:none !important; opacity:1 !important; transform:none !important; filter:none !important; }
  }`;

  const style = document.createElement('style');
  style.textContent = css;

  const el = document.createElement('div');
  el.id = 'tvza-welcome';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Willkommen bei TVZA');
  el.innerHTML = `
    <div class="tvza-grad"></div>
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="tvza-inner">
      <div class="tvza-mark">TvZ</div>
      <div class="tvza-line" id="tvzaLine">${greetLine(cached).replace(/</g,'&lt;')}</div>
      <div class="tvza-sub">Willkommen bei TVZA</div>
    </div>
    <div class="tvza-hint">Tippen zum Überspringen</div>`;

  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  let closed = false;
  function setName(n) {
    if (closed || !firstOf(n)) return;
    const lineEl = el.querySelector('#tvzaLine');
    if (!lineEl) return;
    const next = greetLine(n);
    if (lineEl.textContent === next) return;
    lineEl.textContent = next;
    if (!reduce) { lineEl.classList.remove('tvza-swap'); void lineEl.offsetWidth; lineEl.classList.add('tvza-swap'); }
  }
  window.addEventListener('tvza-name', (e) => setName(e && e.detail));
  window.tvzaWelcomeName = setName;

  function close() {
    if (closed) return;
    closed = true;
    document.documentElement.style.overflow = prevOverflow;
    el.classList.add('tvza-closing');
    cleanup();
    setTimeout(() => el.remove(), 560);
  }
  function onScroll() { close(); }
  function cleanup() {
    ['click', 'pointerdown', 'touchstart', 'keydown'].forEach(ev => el.removeEventListener(ev, close));
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

  const autoTimer = setTimeout(close, reduce ? 1200 : 2600);

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
