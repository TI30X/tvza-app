/* ─────────────────────────────────────────────────────────────
   TVZA UI FX — runtime glue for ui-fx.css
   • Upgrades every existing ".spinner" into a shimmering skeleton
   • Fades the page out before navigating to another internal page
   • Staggers freshly-rendered list items into view
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
        const rows = Math.max(
          1,
          parseInt(sp.dataset.fxRows || "3", 10) || 3
        );
        sp.classList.add("fx-skeleton-host");
        sp.innerHTML = skeletonMarkup(rows);
      });
  }

  /* ── 2. Staggered reveal of real content ───────────────────── */
  // Containers that hold async-loaded lists across the site.
  const LIST_IDS = [
    "listWrap", "publicFeedList", "adminUsers", "tripList", "actList",
    "skiList", "logList", "list", "projectList", "feedList",
  ];

  function staggerChildren(container) {
    if (reduceMotion) return;
    const kids = Array.from(container.children).filter(
      (c) =>
        c.nodeType === 1 &&
        !c.classList.contains("spinner") &&
        !c.classList.contains("fx-skeleton-host") &&
        !c.dataset.fxSeen
    );
    kids.forEach((c, i) => {
      c.dataset.fxSeen = "1";
      c.style.animationDelay = Math.min(i * 45, 360) + "ms";
      c.classList.add("fx-item-in");
      c.addEventListener(
        "animationend",
        () => {
          c.style.animationDelay = "";
          c.classList.remove("fx-item-in");
        },
        { once: true }
      );
    });
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
          // Re-skeleton if the app reset a container to a fresh ".spinner".
          upgradeSpinners(m.target);
          staggerChildren(m.target);
        }
      });
    });
    targets.forEach((t) => obs.observe(t, { childList: true }));
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
    // In-page anchor on the same document.
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
      // Fallback in case transitionend never fires.
      setTimeout(go, 260);
    });
    // Clear the leaving state if the page is restored from bfcache.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) document.body.classList.remove("fx-leaving");
    });
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function init() {
    upgradeSpinners(document);
    watchLists();
    wireNavFade();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose a tiny helper for pages that build their own loaders.
  window.TVZAFx = {
    skeleton: skeletonMarkup,
    upgrade: upgradeSpinners,
    stagger: staggerChildren,
  };
})();
