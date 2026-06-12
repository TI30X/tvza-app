import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

// Auth with permanent local persistence (stays logged in offline)
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.warn);

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
