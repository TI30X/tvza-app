/* ══════════════════════════════════════════════════════════════════
   TVZA i18n — eine Oberfläche, mehrere Sprachen.

   Bewusst ein klassisches Skript, kein Modul: es läuft im <head>,
   direkt neben theme.js, damit die Sprache steht, bevor die Seite
   gezeichnet wird.

   Die Regel ist additiv. Übersetzt wird ausschliesslich, was ein
   data-i18n-Attribut trägt. Eine Seite ohne diese Attribute
   funktioniert unverändert weiter und zeigt ihr deutsches Markup —
   deshalb kann diese Datei nichts kaputt machen, auch mitten in der
   Umstellung nicht.

   Gegen das Flackern: der zuletzt benutzte Katalog liegt in
   localStorage. Beim zweiten Besuch steht die Sprache also synchron
   zur Verfügung, ganz ohne Netz. Beim allerersten Mal in einer neuen
   Sprache wird einmal geladen; Deutsch braucht das nie, weil das
   Markup selbst schon deutsch ist.
   ══════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const KEY   = 'tvza-lang';
  const CACHE = 'tvza-lang-cache';
  const BASE  = 'de';

  const LANGUAGES = [
    { id:'de', locale:'de-CH', native:'Deutsch',    english:'German'  },
    { id:'en', locale:'en-GB', native:'English',    english:'English' },
    { id:'fr', locale:'fr-CH', native:'Français',   english:'French'  },
    { id:'it', locale:'it-CH', native:'Italiano',   english:'Italian' },
    { id:'pl', locale:'pl-PL', native:'Polski',     english:'Polish'  },
    { id:'nl', locale:'nl-NL', native:'Nederlands', english:'Dutch'   },
    { id:'es', locale:'es-ES', native:'Español',    english:'Spanish' },
  ];
  const IDS = LANGUAGES.map(l => l.id);

  /* Pfad zum Wurzelverzeichnis — Seiten liegen entweder oben oder in /pages/. */
  const base = () => (location.pathname.includes('/pages/') ? '../' : './');

  /* ── Welche Sprache? ──────────────────────────────────────────────
     Gespeicherte Wahl schlägt Gerätesprache schlägt Deutsch. Ohne
     eigene Wahl folgt die App dem Gerät, wie man es erwartet. */
  function systemLanguage() {
    const wanted = navigator.languages || [navigator.language || ''];
    for (const tag of wanted) {
      const short = String(tag).slice(0, 2).toLowerCase();
      if (IDS.includes(short)) return short;
    }
    return BASE;
  }
  function storedLanguage() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    return IDS.includes(saved) ? saved : null;
  }

  let lang    = storedLanguage() || systemLanguage();
  let catalog = {};
  let baseCatalog = {};

  function readCache(id) {
    try {
      const raw = localStorage.getItem(CACHE + '-' + id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function writeCache(id, data) {
    try { localStorage.setItem(CACHE + '-' + id, JSON.stringify(data)); } catch {}
  }

  async function load(id) {
    if (id === BASE) return {};            // Basis steht im Markup
    const cached = readCache(id);
    if (cached) {
      /* Im Hintergrund auffrischen, damit ein neuer Katalog spätestens
         beim nächsten Aufruf ankommt — aber nie den Start aufhalten. */
      fetch(base() + 'assets/i18n/' + id + '.json')
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) writeCache(id, data); })
        .catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(base() + 'assets/i18n/' + id + '.json');
      if (!response.ok) throw new Error(response.status);
      const data = await response.json();
      writeCache(id, data);
      return data;
    } catch {
      return {};                            // offline: deutsches Markup bleibt
    }
  }

  /* ── Nachschlagen ────────────────────────────────────────────────
     Kette: gewählte Sprache → Deutsch → Schlüssel. Ein fehlender
     Schlüssel kann die Seite also nie leeren. */
  function t(key, vars) {
    let value = catalog[key];
    if (value === undefined) value = baseCatalog[key];
    if (value === undefined) return key;
    if (vars) {
      value = String(value).replace(/\{(\w+)\}/g, (whole, name) =>
        (vars[name] === undefined ? whole : vars[name]));
    }
    return value;
  }

  /**
   * Wie t(), aber mit einer ehrlichen Rueckfallebene.
   *
   * t() gibt bei einem unbekannten Schluessel den SCHLUESSEL zurueck,
   * nie undefined. Darum greift `t(k) ?? deutsch` nie — der Aufrufer
   * bekommt "nav.gruppe" auf den Bildschirm statt "Gruppe". Genau das
   * ist in sechs Modulen passiert, sichtbar aber nur solange der
   * Katalog noch laedt: er wird asynchron geholt, und wer vorher
   * zeichnet, zeichnet den Schluessel.
   *
   * tOr macht daraus die additive Regel aus CLAUDE.md: was fehlt,
   * bleibt deutsch.
   */
  function tOr(key, fallback) {
    const wert = t(key);
    return wert === key ? fallback : wert;
  }

  /* ── Auf das Markup anwenden ───────────────────────────────────── */
  function applyTo(root) {
    const scope = root || document;
    if (lang === BASE && !Object.keys(baseCatalog).length) return;

    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const value = t(el.dataset.i18n, varsOf(el));
      if (value !== el.dataset.i18n) el.textContent = value;
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      const value = t(el.dataset.i18nHtml, varsOf(el));
      if (value !== el.dataset.i18nHtml) el.innerHTML = value;
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':');
        if (!attr || !key) return;
        const value = t(key.trim(), varsOf(el));
        if (value !== key.trim()) el.setAttribute(attr.trim(), value);
      });
    });
  }

  /* Das lang-Attribut muss die Sprache beschreiben, die tatsaechlich auf
     dem Bildschirm steht. Fehlt der Katalog — offline, Datei nicht da —,
     bleibt deutsches Markup stehen; dann waere <html lang="es"> eine
     Falschaussage gegenueber Screenreader und Browser. */
  function activeLang() {
    return Object.keys(catalog).length ? lang : BASE;
  }
  function syncDocumentLang() {
    document.documentElement.lang = activeLang();
  }

  function varsOf(el) {
    if (!el.dataset.i18nVars) return null;
    try { return JSON.parse(el.dataset.i18nVars); } catch { return null; }
  }

  /* ── Formate ─────────────────────────────────────────────────────
     Datum, Zahl und Plural kommen aus Intl, nicht aus Strings. Ohne
     das wäre eine Sprache wie Polnisch mit drei Pluralformen gar
     nicht sauber abzubilden. */
  const localeOf = id => (LANGUAGES.find(l => l.id === id) || LANGUAGES[0]).locale;

  const format = {
    date:   (value, options) => new Intl.DateTimeFormat(localeOf(lang), options || { dateStyle:'long' }).format(value),
    time:   (value, options) => new Intl.DateTimeFormat(localeOf(lang), options || { timeStyle:'short' }).format(value),
    number: (value, options) => new Intl.NumberFormat(localeOf(lang), options).format(value),
    relative(value, unit) {
      return new Intl.RelativeTimeFormat(localeOf(lang), { numeric:'auto' }).format(value, unit);
    },
    /* plural('msg.unread', 3) sucht msg.unread.one / .few / .many / .other */
    plural(key, count, vars) {
      const rule = new Intl.PluralRules(localeOf(lang)).select(count);
      const merged = Object.assign({ n:format.number(count) }, vars || {});
      const specific = catalog[key + '.' + rule] !== undefined ||
                       baseCatalog[key + '.' + rule] !== undefined;
      return t(key + '.' + (specific ? rule : 'other'), merged);
    },
  };

  /* ── Umschalten ──────────────────────────────────────────────────
     Kein Neuladen: der Katalog wird getauscht und das Markup neu
     beschriftet. Eingebettete Modulseiten hören auf dasselbe Ereignis. */
  async function setLanguage(id, options) {
    if (!IDS.includes(id)) return;
    lang = id;
    try { localStorage.setItem(KEY, id); } catch {}
    catalog = await load(id);
    syncDocumentLang();
    applyTo(document);
    window.dispatchEvent(new CustomEvent('tvza-lang-change', { detail:{ lang:id, locale:localeOf(id) } }));
    if (!options || options.broadcast !== false) broadcast(id);
  }

  /* Die Einstellungen laufen in einem Rahmen; Bereichsseiten ebenfalls.
     Eine Sprachwahl muss darum in beide Richtungen wandern. */
  function targetOrigin() {
    return location.origin === 'null' ? '*' : location.origin;
  }
  function broadcastUp(id) {
    if (window.parent === window) return;
    try { window.parent.postMessage({ type:'tvza-lang', lang:id, dir:'up' }, targetOrigin()); } catch {}
  }
  function broadcastDown(id) {
    document.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow?.postMessage({ type:'tvza-lang', lang:id, dir:'down' }, targetOrigin()); } catch {}
    });
  }
  function broadcast(id) { broadcastUp(id); broadcastDown(id); }

  window.addEventListener('message', event => {
    if (location.origin !== 'null' && event.origin !== location.origin) return;
    if (event.data?.type !== 'tvza-lang') return;
    const incoming = event.data.lang;
    if (incoming === lang) return;
    /* Eine Meldung von unten wird nach unten weitergereicht, eine von
       oben nur noch tiefer — so laeuft nichts im Kreis. */
    setLanguage(incoming, { broadcast:false }).then(() => {
      broadcastDown(incoming);
      if (event.data.dir === 'up') broadcastUp(incoming);
    });
  });

  /* Ein neu eingehaengter Inhaltsrahmen kennt die Sprache noch nicht.
     Beim Laden bekommt er sie nachgereicht. */
  document.addEventListener('load', event => {
    if (event.target?.tagName !== 'IFRAME') return;
    try { event.target.contentWindow?.postMessage({ type:'tvza-lang', lang, dir:'down' }, targetOrigin()); } catch {}
  }, true);

  /* ── Start ───────────────────────────────────────────────────────
     Der Katalog wird sofort aus dem Cache gesetzt, damit schon der
     erste Anstrich stimmt. Nur wenn nichts im Cache liegt, wartet die
     Beschriftung auf einen Ladevorgang. */
  const cachedNow = lang === BASE ? {} : readCache(lang);
  if (cachedNow) catalog = cachedNow;
  syncDocumentLang();

  const ready = (async () => {
    if (!cachedNow) catalog = await load(lang);
    syncDocumentLang();
    const paint = () => applyTo(document);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', paint);
    } else {
      paint();
    }
  })();

  window.TVZAI18n = {
    LANGUAGES,
    get lang() { return lang; },
    get activeLang() { return activeLang(); },
    get locale() { return localeOf(lang); },
    systemLanguage,
    hasStoredChoice: () => storedLanguage() !== null,
    t, tOr, applyTo, setLanguage, format, ready,
  };
})();
