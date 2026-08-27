import {
  auth, db, requireAuth, wireOfflineBanner, escHtml,
  MODULES, enabledModules, getProfile, sharesForEmail
} from '../../firebase-config.js';
import { collection, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { mountShell, icon, ICONS, areaModuleKeys } from '../../shell.js?v=7';
import { openSettingsLayer } from '../../settings-layer.js';

const $ = id => document.getElementById(id);

/* Same mapping the shell uses: a module key is not always a Bereich
   colour key, so it is spelled out rather than guessed. */
const BEREICH_OF = {
  ski: 'ski', food: 'food', watch: 'watch', weather: 'weather',
  trip: 'kalender', dm: 'msg', matura: 'matura', maturatracker: 'matura', admin: 'admin',
  training: 'training',
  publicProjects: 'kalender',
};

/* One row, built from the kit. Used by all three sections so they
   cannot drift apart the way the old five row classes did. */
function row({ href, bereich, iconKey, title, sub, end, onClick }) {
  const tag = href ? 'a' : 'button';
  const attrs = href ? `href="${escHtml(href)}"` : 'type="button"';
  return `
    <${tag} class="row" ${attrs} data-bereich="${escHtml(bereich || '')}">
      <span class="row__icon">${icon(ICONS[iconKey] ? iconKey : 'bereiche', 18)}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(title)}</span>
        ${sub ? `<span class="row__sub">${escHtml(sub)}</span>` : ''}
      </span>
      <span class="row__end">${end || `<svg class="ic row__chev" viewBox="0 0 24 24">${ICONS.chevron}</svg>`}</span>
    </${tag}>`;
}

requireAuth('../login.html').then(async user => {
  wireOfflineBanner();
  let profile = await getProfile(user);
  let mods = enabledModules(profile);

  mountShell({
    variant: 'bereich',
    title: 'Alle Bereiche',
    backHref: '../index.html',
    profile,
    onSettings: openSettingsLayer,
  });

  /* Genau dieselbe Quelle und Reihenfolge wie die Desktop-Seitenleiste.
     Kalender und Nachrichten besitzen eigene Tabs und werden daher
     nicht als Bereich dupliziert. */
  function renderMine() {
    mods = enabledModules(profile);
    const keys = areaModuleKeys(profile);
    $('listMine').innerHTML = keys.length
      ? keys.map(k => row({
          href: `../${MODULES[k].page}`,
          bereich: BEREICH_OF[k],
          iconKey: k,
          title: MODULES[k].name,
          sub: MODULES[k].sub,
        })).join('')
      : '<p class="empty-hint">Keine Bereiche eingeblendet.</p>';
  }
  renderMine();

  window.addEventListener('tvza-modules-change', event => {
    if (!event.detail || typeof event.detail !== 'object') return;
    profile = { ...profile, modules:event.detail };
    renderMine();
  });
  onSnapshot(doc(db, 'users', user.uid), snapshot => {
    if (!snapshot.exists()) return;
    profile = snapshot.data();
    renderMine();
  }, () => { /* the local settings event remains the immediate fallback */ });

  /* ── Mit mir geteilt ────────────────────────────────────────*/
  const shares = await sharesForEmail(user.email);
  if (shares.length) {
    const html = shares.map(s => {
      const m = MODULES[s.module];
      if (!m || !m.page) return '';
      return row({
        href: `../${m.page}?owner=${encodeURIComponent(s.ownerUid)}`,
        bereich: BEREICH_OF[s.module],
        iconKey: s.module,
        title: m.name + (s.ownerName ? ' · ' + s.ownerName : ''),
        sub: 'Geteilt mit dir',
        end: `<span class="row__status">${s.role === 'edit' ? 'Bearbeiten' : 'Ansehen'}</span>`,
      });
    }).join('');
    if (html.trim()) { $('listShared').innerHTML = html; $('secShared').hidden = false; }
  }

  /* ── Öffentliche Projekte ───────────────────────────────────*/
  if (mods.publicProjects) {
    onSnapshot(collection(db, 'publicProjects'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));
      if (!items.length) { $('secPublic').hidden = true; return; }
      $('secPublic').hidden = false;
      $('listPublic').innerHTML = items.map(p => row({
        bereich: 'kalender',
        iconKey: 'publicProjects',
        title: p.name || 'Projekt',
        sub: (p.ownerName ? p.ownerName + ' · ' : '') + 'Öffentlich',
      })).join('');
      // The project emoji is content the user typed, so it stays.
      [...$('listPublic').children].forEach((el, i) => {
        if (items[i]?.emoji) el.querySelector('.row__icon').textContent = items[i].emoji;
        el.onclick = () => {
          const url = items[i]?.url;
          if (url) window.open(url, '_blank', 'noopener');
        };
      });
    }, () => console.warn('[public-projects] listen-failed'));
  }

  $('manageBtn').onclick = openSettingsLayer;
});
