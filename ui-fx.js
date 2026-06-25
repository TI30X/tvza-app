/* ─────────────────────────────────────────────────────────────
   TVZA UI FX — YouTube-style loading
   • Shows shimmering skeleton placeholders while data loads
   • Fades real content in once when it replaces the skeleton
   • Preserves scroll position across reloads
   • Gentle page fade on load + fade-out on internal navigation
   • Injects a consistent version footer on every page
   No build step, no dependencies. Safe to load in <head> or <body>.
   ───────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Single source of truth for the footer version shown on every page.
  const APP_VERSION = "v24";

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

  /* ── 2. Fade real content in once (no per-item jitter) ─────── */
  const LIST_IDS = [
    "listWrap", "publicFeedList", "adminUsers", "tripList", "actList",
    "skiList", "logList", "list", "projectList", "feedList",
  ];

  function fadeIn(el) {
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

  function watchContent() {
    const targets = LIST_IDS.map((id) => document.getElementById(id)).filter(
      Boolean
    );
    if (!targets.length) return;
    const obs = new MutationObserver((muts) => {
      const seen = new Set();
      muts.forEach((m) => {
        const t = m.target;
        if (seen.has(t)) return;
        seen.add(t);
        // App reset the container back to a "Lade…" spinner → re-skeleton it.
        upgradeSpinners(t);
        // Real data arrived → fade the whole container in a single time.
        if (hasRealContent(t)) fadeIn(t);
      });
    });
    targets.forEach((t) => obs.observe(t, { childList: true }));
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

  /* ── 4. Page fade-out on internal navigation ───────────────── */
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
      document.body.classList.add("fx-leaving");
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        location.href = dest;
      };
      document.body.addEventListener("transitionend", go, { once: true });
      setTimeout(go, 260);
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) document.body.classList.remove("fx-leaving");
    });
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function init() {
    injectVersion();
    setupScrollRestore();
    upgradeSpinners(document);
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
