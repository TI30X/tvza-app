import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBNOe75cdHgw0kqL6xHACaUm0EUt83-cbE",
  authDomain: "tvza-11d44.firebaseapp.com",
  projectId: "tvza-11d44",
  storageBucket: "tvza-11d44.firebasestorage.app",
  messagingSenderId: "214201333283",
  appId: "1:214201333283:web:08adcd69499ef4046e2396",
  measurementId: "G-RP54PM439B"
};

export const app = initializeApp(firebaseConfig);

// Firestore with offline persistence (modern API)
export const db = initializeFirestore(app, {
  /* Einstellungen können als zweite, gleichzeitige App-Ansicht über
     einer Bereichsseite offen sein. Multi-tab persistence hält beide
     Ansichten synchron; single-tab sperrte die Aktionen im Dialog. */
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Geteilter Finnhub-Key für die Watchlist (Aktien/ETF-Kurse + Markt-News).
// Eine kostenlose Lizenz für die ganze Familie — niemand muss sich selbst
// registrieren. Wer will, kann im ⚙️ der Watchlist einen eigenen Key
// hinterlegen (überschreibt diesen lokal). Gratis-Limit: 60 Abfragen/Minute.
// Liegt NICHT mehr im Quellcode (öffentliches Repo!), sondern in Firestore
// unter secrets/finnhub — lesbar nur für angemeldete Nutzer (firestore.rules).
let _finnhubKeyCache = null;
export async function getFinnhubKey() {
  if (_finnhubKeyCache !== null) return _finnhubKeyCache;
  try {
    const snap = await getDoc(doc(db, 'secrets', 'finnhub'));
    _finnhubKeyCache = snap.exists() ? (snap.data().key || '') : '';
  } catch (e) { _finnhubKeyCache = ''; }
  return _finnhubKeyCache;
}

// Auth with durable persistence — IndexedDB survives installed-PWA reopens
// better than localStorage (which Android can clear). Falls back if needed.
export const auth = getAuth(app);
setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence))
  .catch(error => reportClientError('auth-persistence', error));

/* ── Shared helpers ────────────────────────────── */

// Redirect to login if not authenticated. Returns a promise of the user.
export function requireAuth(loginPath = 'login.html') {
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (!user) { window.location.href = loginPath; return; }
      resolve(user);
    });
  });
}

// Wire up the standard offline banner (element with id="offlineBanner")
export function wireOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  const update = () => banner.classList.toggle('visible', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

export function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Keep backend details out of user-facing messages and avoid dumping full
// Firebase error objects (which may contain paths and request metadata) into
// the production console. Context + stable code is enough for diagnostics.
export function reportClientError(context, error) {
  const code = typeof error?.code === 'string' ? error.code : 'operation-failed';
  console.warn(`[${context}] ${code}`);
}

/* ── Module-Registry (erweiterbar) ─────────────────
   Neue Module hier ergänzen — Dashboard, Einstellungen
   und Teilen ziehen sich automatisch daraus.            */
export const MODULES = {
  ski:  { key:'ski',  name:'Ski Tracker',    sub:'Schliff & Wachs',        emoji:'🎿', page:'pages/skitracker.html',  perUser:true,  shareable:true  },
  food: { key:'food', name:'Food Tracker',   sub:'Kalorien & Nährstoffe',  emoji:'🍎', page:'pages/foodtracker.html', perUser:true,  shareable:true  },
  watch:{ key:'watch',name:'TVZA Watchlist', sub:'Kurse, Märkte & News',   emoji:'📈', page:'pages/watchlist.html',  perUser:true,  shareable:true  },
  trip: { key:'trip', name:'Kalender & Erinnerungen', sub:'Termine, Reisen & Erinnerungen', emoji:'🗓️', page:'pages/planner.html', perUser:false, shareable:false },
  weather:{ key:'weather', name:'Wetter',      sub:'Wetter & Bergprognose',  emoji:'⛅', page:'pages/weather.html',    perUser:false, shareable:false },
  dm:    { key:'dm',   name:'Nachrichten',     sub:'Direktnachrichten',      emoji:'💬', page:'pages/messages.html',   perUser:false, shareable:false },
  matura: { key:'matura', name:'Maturaarbeit', sub:'Status & Fortschritt', emoji:'📊', page:'pages/maturaarbeit.html', perUser:false, shareable:false },
  maturatracker: { key:'maturatracker', name:'Maturaarbeit-Tracker', sub:'To-dos & Countdown', emoji:'🧵', page:'pages/maturaarbeit-tracker.html', perUser:true, shareable:false },
  publicProjects: { key:'publicProjects', name:'Öffentliche Projekte', sub:'Von allen geteilt', emoji:'🌐', perUser:false, shareable:false },
};

// Neue Nutzer starten schlank: nur Familien-Planer, Watchlist und Food sind
// standardmässig an — alles andere muss angefragt / vom Admin freigeschaltet werden.
export const DEFAULT_MODULES = { ski:false, food:true, trip:true, matura:false, maturatracker:false, publicProjects:false, watch:true, weather:true, dm:true };
export const ALL_MODULES = Object.fromEntries(Object.keys(MODULES).map(key => [key, true]));

export async function getProfile(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() ? snap.data() : {};
  } catch (e) { reportClientError('profile', e); return {}; }
}

// Admin-Freigabe eines Nutzers.
export function allowedModules(profile) {
  if (profile?.isTimo === true) return { ...ALL_MODULES };
  return { ...DEFAULT_MODULES, ...(profile?.allowedModules || {}) };
}

// Effektive Modul-Auswahl: Admin-Freigabe UND persönliche Sichtbarkeit.
export function enabledModules(profile) {
  const allowed = allowedModules(profile);
  const visible = { ...allowed, ...(profile?.modules || {}) };
  return Object.fromEntries(Object.keys(MODULES).map(key => [key, !!allowed[key] && !!visible[key]]));
}

/* ── Teilen (Module mit anderen Nutzern) ──────────── */

// Freigaben für das aktuell angemeldete Konto. Der Funktionsname bleibt aus
// Kompatibilitätsgründen; die UID ist die sichere, eindeutige Identität.
export async function sharesForEmail(email) {
  const uid = auth.currentUser?.uid;
  if (!email || !uid) return [];
  try {
    const qs = await getDocs(query(collection(db, 'shares'), where('targetUid', '==', uid)));
    return qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { reportClientError('shares-received', e); return []; }
}

// Freigaben, die ICH (als Eigentümer) erstellt habe.
export async function sharesByOwner(uid) {
  try {
    const qs = await getDocs(query(collection(db, 'shares'), where('ownerUid', '==', uid)));
    const shares = qs.docs.map(d => ({ id: d.id, ...d.data() }));

    // v.30.4: Firestore can enforce view/edit only when a share has a
    // deterministic id. Owners transparently migrate their older random-id
    // shares the next time they open Einstellungen.
    for (const share of shares) {
      if (!share.targetUid || !share.module) continue;
      const canonicalId = `${uid}__${share.targetUid}__${share.module}`;
      if (share.id === canonicalId) continue;
      const {
        ownerUid, ownerName = '', module, targetUid,
        targetEmail = '', targetName = '', role = 'view', createdAt = null
      } = share;
      await setDoc(doc(db, 'shares', canonicalId), {
        ownerUid, ownerName, module, targetUid,
        targetEmail, targetName, role, createdAt
      });
      await deleteDoc(doc(db, 'shares', share.id));
      share.id = canonicalId;
    }

    return [...new Map(shares.map(s => [s.id, s])).values()];
  } catch (e) { reportClientError('shares-owned', e); return []; }
}

// Welche Daten soll eine Tracker-Seite für `moduleKey` zeigen?
// Beachtet ?owner=<uid>; fällt sonst auf eigene Daten zurück.
// Liefert { dataUid, role:'owner'|'edit'|'view', ownerName }.
export async function resolveAccess(user, moduleKey) {
  const owner = new URLSearchParams(location.search).get('owner');
  if (!owner || owner === user.uid) return { dataUid: user.uid, role: 'owner', ownerName: '' };
  const shares = await sharesForEmail(user.email);
  const s = shares.find(x => x.ownerUid === owner && x.module === moduleKey);
  if (!s) return { dataUid: user.uid, role: 'owner', ownerName: '', denied: true };
  return { dataUid: owner, role: s.role === 'edit' ? 'edit' : 'view', ownerName: s.ownerName || '' };
}
