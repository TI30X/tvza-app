/* Die öffentliche Projektseite (public.html).

   Liest publicProjects — die Sammlung, in die index.html schreibt, wenn
   Timo ein Projekt freigibt — und zeigt sie ohne Anmeldung. Die
   Anmeldung fragt die Seite nur, um den Knopf oben zu beschriften.

   Bis v.35.35.0 stand dieser Code als Inline-Modul in der Seite. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, collection, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Standalone init — no auth, no offline persistence needed here
const app = initializeApp({
  apiKey: "AIzaSyBNOe75cdHgw0kqL6xHACaUm0EUt83-cbE",
  authDomain: "tvza-11d44.firebaseapp.com",
  projectId: "tvza-11d44",
  storageBucket: "tvza-11d44.firebasestorage.app",
  messagingSenderId: "214201333283",
  appId: "1:214201333283:web:08adcd69499ef4046e2396"
});
const db = getFirestore(app);
const auth = getAuth(app);

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Theme-Umschalter (#themeToggle) wird automatisch von theme.js verkabelt.

/* Was der Code beschriftet, kommt per tOr — bis der Katalog da ist,
   steht Deutsch, nie der Schluessel. */
const T = (key, deutsch) => window.TVZAI18n ? window.TVZAI18n.tOr(key, deutsch) : deutsch;

// Anmelden-Button: angemeldet → "Zur App", sonst → "Anmelden".
// Kein data-i18n am Knopf: den Zustand kennt nur der Code (Falle 5).
let angemeldet = false;
function beschrifteKnopf() {
  const btn = document.getElementById('authBtn');
  if (angemeldet) { btn.textContent = T('pub.zurApp', 'Zur App →'); btn.href = 'index.html'; }
  else            { btn.textContent = T('login.anmelden', 'Anmelden'); btn.href = 'login.html'; }
}
onAuthStateChanged(auth, u => { angemeldet = !!u; beschrifteKnopf(); });

/* Die Liste wird einmal geholt und bei jedem Sprachwechsel neu
   gezeichnet; die Projekte selbst (Name, Besitzer) sind Inhalt. */
let projekte = null;
let ladeFehler = false;
function zeichne() {
  const list = document.getElementById('list');
  if (ladeFehler) {
    list.innerHTML = `<div class="empty">${T('pub.fehler', 'Projekte konnten nicht geladen werden.')}</div>`;
    return;
  }
  if (!projekte) return;
  if (!projekte.length) {
    list.innerHTML = `<div class="empty">${T('pub.keine', 'Im Moment sind keine Projekte freigegeben.')}</div>`;
    return;
  }
  /* Der Besitzer steht nur, wenn die Liste mehrere hat. Sind alle
     Projekte von einer Person, stuende derselbe Name in jeder Zeile —
     und der Name gehoert einmal auf die Seite, in die Fusszeile. */
  const mehrere = new Set(projekte.map(p => p.ownerName || '')).size > 1;
  list.innerHTML = projekte.map(p => `
    <button class="proj" type="button" data-id="${esc(p.id)}">
      <span class="proj-emoji">${esc(p.emoji || '🔗')}</span>
      <span class="proj-name">${esc(p.name)}<small class="proj-meta">${mehrere && p.ownerName ? esc(p.ownerName) + ' · ' : ''}${T('pub.oeffentlich', 'Öffentlich')}</small></span>
      <span class="proj-arrow">↗</span>
    </button>`).join('');

  list.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const project = projekte.find(item => item.id === btn.dataset.id);
      if (!project) return;
      window.open(project.url, '_blank', 'noopener');
    });
  });
}

async function load() {
  try {
    // Gemeinsamer Feed: alle öffentlichen Projekte ALLER Nutzer (flache Sammlung).
    const snap = await getDocs(collection(db, 'publicProjects'));
    projekte = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));
  } catch (err) {
    console.warn('[public-projects] load-failed');
    ladeFehler = true;
  }
  zeichne();
}
load();

function neuBeschriften() { beschrifteKnopf(); zeichne(); }
if (window.TVZAI18n) window.TVZAI18n.ready.then(neuBeschriften, () => {});
window.addEventListener('tvza-lang-change', neuBeschriften);
