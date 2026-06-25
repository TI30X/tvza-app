/* ─────────────────────────────────────────────────────────────
   TVZA UI FX — runtime glue for ui-fx.css
   • Upgrades every existing ".spinner" into a shimmering skeleton
   • Reveals main content blocks with a unified staggered flow-in
   • Preserves scroll position across page reloads
   • Fades the page out before navigating to another internal page
   No build step, no dependencies. Safe to load in <head> or <body>.
   ───────────────────────────────────────────────────────────── */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ── 1. Skeletons ──────────────────────────────────────────── */
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

  /* ── 2. Staggered reveal of async-loaded list items ────────── */
  const LIST_IDS = [
    "listWrap", "publicFeedList", "adminUsers", "tripList", "actList",
    "skiList", "logList", "list", "projectList", "feedList",
  ];

  function revealItem(el, delay) {
    el.dataset.fxSeen = "1";
    el.style.animationDelay = delay + "ms";
    el.classList.add("fx-item-in");
    el.addEventListener(
      "animationend",
      () => {
        el.style.animationDelay = "";
        el.classList.remove("fx-item-in");
      },
      { once: true }
    );
  }

  function staggerChildren(container) {
    if (reduceMotion) return;
    const kids = Array.from(container.children).filter(
      (c) =>
        c.nodeType === 1 &&
        !c.classList.contains("spinner") &&
        !c.classList.contains("fx-skeleton-host") &&
        !c.dataset.fxSeen
    );
    kids.forEach((c, i) => revealItem(c, Math.min(i * 45, 360)));
  }

  function watchLists() {
    const targets = LIST_IDS.map((id) => document.getElementById(id)).filter(
      Boolean
    );
    if (!targets.length) return;
    const obs = new MutationObserver((muts) => {
      const seen = new Set();
      muts.forEach((m) => {
        if (m.addedNodes && m.addedNodes.length && !seen.has(m.target)) {
          seen.add(m.target);
          upgradeSpinners(m.target);
          staggerChildren(m.target);
        }
      });
    });
    targets.forEach((t) => obs.observe(t, { childList: true }));
  }

  /* ── 2b. Unified flow-in: reveal content blocks (load + late) ─ */
  function isHidden(el) {
    const cs = window.getComputedStyle ? getComputedStyle(el) : null;
    if (cs && (cs.display === "none" || cs.visibility === "hidden")) return true;
    if (el.style && el.style.display === "none") return true;
    return false;
  }

  function revealOnLoad() {
    if (reduceMotion) return;
    const root =
      document.querySelector("main, .main") ||
      document.querySelector(".app") ||
      document.body;
    if (!root) return;
    let cands = Array.from(
      root.querySelectorAll(".section, .settings-section, .card")
    );
    if (!cands.length) {
      cands = Array.from(root.children).filter(
        (c) => c.nodeType === 1 && !/^(SCRIPT|STYLE|HEADER)$/.test(c.tagName)
      );
    }
    // Keep only the innermost block when blocks are nested.
    cands = cands.filter((el) => !cands.some((o) => o !== el && el.contains(o)));
    let i = 0;
    cands.forEach((el) => {
      if (el.dataset.fxSeen) return;
      if (el.closest(".fx-skeleton-host")) return;
      if (isHidden(el)) return; // catch it on a later pass once shown
      revealItem(el, Math.min(i * 55, 440));
      i++;
    });
  }

  /* ── 2c. Preserve scroll position across reloads ───────────── */
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

  /* ── 3. Page fade-out on internal navigation ───────────────── */
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
    setupScrollRestore();
    upgradeSpinners(document);
    revealOnLoad();
    watchLists();
    wireNavFade();
    // Modules/tiles are shown after the Firebase profile loads, so sweep
    // again to flow in anything that became visible after first paint.
    setTimeout(revealOnLoad, 350);
    setTimeout(revealOnLoad, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.TVZAFx = {
    skeleton: skeletonMarkup,
    upgrade: upgradeSpinners,
    stagger: staggerChildren,
  };
})();
