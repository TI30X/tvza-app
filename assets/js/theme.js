(() => {
  const KEY = 'tvza-theme';
  const MODES = ['auto', 'dark', 'light'];
  const MEDIA = window.matchMedia('(prefers-color-scheme: dark)');

  function storedMode() {
    const saved = localStorage.getItem(KEY);
    return MODES.includes(saved) ? saved : 'auto';
  }

  function effectiveTheme(mode = storedMode()) {
    return mode === 'auto' ? (MEDIA.matches ? 'dark' : 'light') : mode;
  }

  function applyTheme(mode = storedMode()) {
    const theme = effectiveTheme(mode);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = '#1A1A2E';
    window.dispatchEvent(new CustomEvent('tvza-theme-change', { detail: { mode, theme } }));
  }

  window.TVZATheme = {
    getMode: storedMode,
    toggleMode() {
      const mode = storedMode();
      const next = mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto';
      localStorage.setItem(KEY, next);
      applyTheme(next);
    },
    applyTheme
  };

  MEDIA.addEventListener?.('change', () => {
    if (storedMode() === 'auto') applyTheme('auto');
  });

  // Auto-wire any toggle button on the page (id="themeToggle" or [data-theme-toggle]).
  function wireToggle(btn) {
    if (!btn || btn.dataset.tvzaWired) return;
    btn.dataset.tvzaWired = '1';
    // SVG, not emoji (§4.5). ◐ ☾ ☀ rendered differently on every device
    // and could not take the header's colour; these inherit currentColor
    // like every other icon in the app.
    const GLYPH = {
      auto:  '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
      dark:  '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
      light: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    };
    const update = () => {
      const mode = storedMode();
      const theme = effectiveTheme(mode);
      const which = mode === 'auto' ? 'auto' : theme === 'dark' ? 'dark' : 'light';
      btn.innerHTML =
        '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        GLYPH[which] + '</svg>';
      btn.title = mode === 'auto'
        ? 'Theme: automatisch'
        : theme === 'dark'
          ? 'Theme: dunkel'
          : 'Theme: hell';
      btn.setAttribute('aria-label', btn.title);
    };
    btn.addEventListener('click', () => window.TVZATheme.toggleMode());
    window.addEventListener('tvza-theme-change', update);
    update();
  }

  function wireAll() {
    document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach(wireToggle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAll);
  } else {
    wireAll();
  }

  applyTheme();
})();
