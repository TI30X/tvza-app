/* ─────────────────────────────────────────────────────────────
   TVZA UI FX — YouTube-style loading
   • Shows shimmering skeleton placeholders while data loads
   • Fades real content in once when it replaces the skeleton (any section)
   • Preserves scroll position across reloads
   • Fades only the content on navigation, so the header stays put
   • Injects a consistent version footer on every page
   No build step, no dependencies. Safe to load in <head> or <body>.
   ───────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Single source of truth for the footer version shown on every page.
  // Bei Änderung auch CACHE in sw.js gleichziehen — sonst bleibt das
  // alte Stylesheet im Cache liegen.
  const APP_VERSION = "v.35.7.0";

  function contentEl() {
    return document.querySelector("main, .main") || document.body;
  }

  function injectVersion() {
    if (document.querySelector(".fx-version")) return;
    const host = document.querySelector(".app") || document.body;
    if (!host) return;
    const el = document.createElement("div");
    el.className = "fx-version";
    el.textContent = "TVZA · " + APP_VERSION;
    host.appendChild(el);
  }

  /* ── 1. Skeleton placeholders ──────────────────────────────── */
  function skeletonMarkup(rows) {
    let html = "";
    for (let i = 0; i < rows; i++) {
      html +=
        '<div class="fx-skel-row">' +
        '<div class="fx-skel fx-skel-avatar"></div>' +
        '<div class="fx-skel-lines">' +
        '<div class="fx-skel fx-skel-line"></div>' +
        '<div class="fx-skel fx-skel-line short"></div>' +
        "</div>" +
        '<div class="fx-skel fx-skel-pill"></div>' +
        "</div>";
    }
    return html;
  }

  function upgradeSpinners(root) {
    (root || document)
      .querySelectorAll(".spinner:not([data-fx-skel])")
      .forEach((sp) => {
        sp.dataset.fxSkel = "1";
        const rows = Math.max(1, parseInt(sp.dataset.fxRows || "3", 10) || 3);
        sp.classList.add("fx-skeleton-host");
        sp.innerHTML = skeletonMarkup(rows);
      });
  }

  /* ── 2. Fade real content in once, for EVERY loading section ─ */
  function fadeIn(el) {
    if (el.dataset.fxRevealed) return;
    el.dataset.fxRevealed = "1";
    if (reduceMotion || el.dataset.fxFading) return;
    el.dataset.fxFading = "1";
    el.classList.add("fx-fade-in");
    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("fx-fade-in");
        delete el.dataset.fxFading;
      },
      { once: true }
    );
  }

  function hasRealContent(container) {
    return Array.from(container.children).some(
      (c) =>
        c.nodeType === 1 &&
        !c.classList.contains("spinner") &&
        !c.classList.contains("fx-skeleton-host")
    );
  }

  // Reflect "anything still loading?" on <body> so the header shows a
  // clean indeterminate bar (CSS) and hides it the moment data arrives.
  // Only VISIBLE spinners count — placeholders inside closed modals
  // (display:none → offsetParent null) must not keep the bar running.
  function updateLoading() {
    let loading = false;
    document.querySelectorAll(".spinner, .fx-skeleton-host").forEach((el) => {
      if (el.offsetParent !== null) loading = true;
    });
    document.body.classList.toggle("fx-loading", loading);
  }

  // Watch any container that ever shows a spinner/skeleton — no hard-coded
  // list of IDs — so all sections across all pages get the same treatment.
  function watchContent() {
    const observed = new WeakSet();
    const obs = new MutationObserver((muts) => {
      const seen = new Set();
      muts.forEach((m) => {
        const t = m.target;
        if (seen.has(t)) return;
        seen.add(t);
        upgradeSpinners(t);
        register(t);
        if (hasRealContent(t)) fadeIn(t);
      });
      updateLoading();
    });
    function register(scope) {
      (scope || document)
        .querySelectorAll(".spinner, .fx-skeleton-host")
        .forEach((sp) => {
          const c = sp.parentElement;
          if (c && !observed.has(c)) {
            observed.add(c);
            obs.observe(c, { childList: true });
          }
        });
    }
    register(document);
  }

  /* ── 3. Preserve scroll position across reloads ────────────── */
  function setupScrollRestore() {
    if (!("sessionStorage" in window)) return;
    let key;
    try {
      key = "fx-scroll:" + location.pathname;
    } catch (e) {
      return;
    }
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const save = () => {
      try {
        sessionStorage.setItem(
          key,
          String(window.scrollY || window.pageYOffset || 0)
        );
      } catch (e) {}
    };
    let t;
    window.addEventListener(
      "scroll",
      () => {
        clearTimeout(t);
        t = setTimeout(save, 150);
      },
      { passive: true }
    );
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);

    const saved = parseInt(sessionStorage.getItem(key) || "0", 10);
    if (!saved || saved < 4) return;

    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((ev) =>
      window.addEventListener(ev, stop, { passive: true, once: true })
    );
    const start = Date.now();
    const tryRestore = () => {
      if (cancelled) return;
      window.scrollTo(0, saved);
      if ((window.scrollY || 0) >= saved - 2 || Date.now() - start > 2500)
        return;
      requestAnimationFrame(tryRestore);
    };
    requestAnimationFrame(tryRestore);
  }

  /* ── 4. Fade content (not header) out on internal navigation ─ */
  function isInternalLink(a) {
    if (!a) return false;
    if (a.target && a.target !== "" && a.target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    if ("noFx" in a.dataset) return false;
    const href = a.getAttribute("href");
    if (!href) return false;
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    )
      return false;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch (e) {
      return false;
    }
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.hash) return false;
    return true;
  }

  function wireNavFade() {
    if (reduceMotion) return;
    document.addEventListener("click", (e) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!isInternalLink(a)) return;
      e.preventDefault();
      const dest = a.href;
      const c = contentEl();
      c.classList.add("fx-leaving");
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        location.href = dest;
      };
      c.addEventListener("transitionend", go, { once: true });
      setTimeout(go, 260);
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) contentEl().classList.remove("fx-leaving");
    });
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function init() {
    injectVersion();
    setupScrollRestore();
    upgradeSpinners(document);
    updateLoading();
    watchContent();
    wireNavFade();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.TVZAFx = {
    skeleton: skeletonMarkup,
    upgrade: upgradeSpinners,
  };
})();
