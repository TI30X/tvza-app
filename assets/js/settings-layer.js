/* One settings surface for every signed-in page.

   The full implementation stays in index.html, where module sharing and
   admin tools already live. Other pages show that exact dialog in a
   same-origin layer, so opening settings never navigates away or destroys
   unsaved page state. */

const base = () => (location.pathname.includes('/pages/') ? '../' : './');

export function mountSettingsLayer() {
  let layer = document.getElementById('globalSettingsLayer');
  if (layer) return {
    open: () => layer.dispatchEvent(new CustomEvent('tvza-open-settings')),
  };

  layer = document.createElement('div');
  layer.id = 'globalSettingsLayer';
  layer.className = 'global-settings-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="global-settings-shell" role="dialog" aria-modal="true" aria-label="Einstellungen">
      <div class="global-settings-loading" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span>Einstellungen werden geladen</span>
      </div>
      <iframe class="global-settings-frame" title="Einstellungen" referrerpolicy="same-origin"></iframe>
      <button class="global-settings-close" type="button" aria-label="Einstellungen schliessen" title="Schliessen">&times;</button>
    </div>`;
  document.body.appendChild(layer);

  const shell = layer.querySelector('.global-settings-shell');
  const frame = layer.querySelector('.global-settings-frame');
  const closeButton = layer.querySelector('.global-settings-close');
  let returnFocus = null;

  const close = () => {
    if (layer.hidden) return;
    layer.hidden = true;
    document.body.classList.remove('settings-layer-open');
    returnFocus?.focus?.();
  };
  const open = () => {
    returnFocus = document.activeElement;
    layer.hidden = false;
    document.body.classList.add('settings-layer-open');
    if (!frame.getAttribute('src')) {
      frame.src = base() + 'index.html?embed=settings#settings';
    }
    closeButton.focus();
  };

  layer.addEventListener('tvza-open-settings', open);
  closeButton.addEventListener('click', close);
  layer.addEventListener('click', event => { if (event.target === layer) close(); });
  shell.addEventListener('click', event => event.stopPropagation());
  frame.addEventListener('load', () => layer.classList.add('is-loaded'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !layer.hidden) close();
  });
  window.addEventListener('message', event => {
    if (location.origin !== 'null' && event.origin !== location.origin) return;
    if (event.data?.type === 'tvza-settings-close') close();
    if (event.data?.type === 'tvza-settings-theme') {
      window.TVZATheme?.applyTheme(event.data.mode);
    }
    if (event.data?.type === 'tvza-settings-modules') {
      window.dispatchEvent(new CustomEvent('tvza-modules-change', { detail:event.data.modules || {} }));
    }
  });

  return { open, close };
}

export function openSettingsLayer() {
  mountSettingsLayer().open();
}
