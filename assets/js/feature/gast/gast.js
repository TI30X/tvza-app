/* Die Gastseite (pages/guest.html).

   Ein Reiselink traegt ?trip= und ?token=. Wer ihn oeffnet, legt ein
   Gastkonto an (guestProfiles, nie users — Falle 6), bekommt damit
   Zugang zu genau dieser Reise (guestAccess, die Regel prueft das
   Token) und einen Chat mit der Person, die sie angelegt hat.

   Bis v.35.35.0 stand dieser Code als Inline-Modul in der Seite. Die
   Umschalter setzen jetzt `hidden` statt style.display — das Kit
   haelt [hidden] mit !important, und die Seite traegt kein style="…".

   Seit v.35.50.0 sind Reisen Termine einer Gruppe. Ein neuer Link
   traegt ?g=&termin=&token= und oeffnet genau diesen Termin (die Regel:
   terminGast). Ein alter Reiselink (?trip=) geht weiter: ist die Reise
   uebernommen, steht der Termin unter derselben Kennung, und der alte
   Zugang mit dem alten Token gilt auch fuer ihn. */

import { auth, db, escHtml } from '../../firebase-config.js';
import { punkteHtml, jetztFuer, sicheresHtml, sichereAdresse } from '../../programm.js';
import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
/* Beschriftungen, die der Code setzt, kommen per tOr: bis der Katalog
   da ist, steht Deutsch, nie der Schluessel. */
const T = (key, deutsch) => window.TVZAI18n ? window.TVZAI18n.tOr(key, deutsch) : deutsch;

/* Ziel und Token kommen beim ersten Oeffnen mit der Adresse und werden
   gemerkt, damit ein Gast spaeter ohne den ganzen Link zurueckfindet. */
const merke = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const gemerkt = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const ausAdresse = {
  trip: params.get('trip') || '',
  gid: params.get('g') || '',
  eid: params.get('termin') || '',
  token: params.get('token') || '',
};
const neuerLink = !!ausAdresse.token && (!!ausAdresse.trip || (!!ausAdresse.gid && !!ausAdresse.eid));
const tripId = neuerLink ? ausAdresse.trip : gemerkt('tvza.guestTrip');
const gid = neuerLink ? ausAdresse.gid : gemerkt('tvza.guestGruppe');
const eid = neuerLink ? ausAdresse.eid : gemerkt('tvza.guestTermin');
const token = neuerLink ? ausAdresse.token : gemerkt('tvza.guestToken');
if (neuerLink) {
  merke('tvza.guestTrip', tripId);
  merke('tvza.guestGruppe', gid);
  merke('tvza.guestTermin', eid);
  merke('tvza.guestToken', token);
}
const zielGueltig = () => !!token && (!!tripId || (!!gid && !!eid));

function show(id) {
  ['loading', 'requestForm', 'wrongAccount', 'invalidLink', 'dashboard']
    .forEach(x => { $(x).hidden = x !== id; });
}

async function ensureGuestAccess(user, name) {
  const profRef = doc(db, 'guestProfiles', user.uid);
  const profSnap = await getDoc(profRef);
  if (!profSnap.exists()) {
    await setDoc(profRef, {
      email: user.email || '',
      name: name || user.email || 'Gast',
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp()
    });
  } else {
    // Touch lastActiveAt on every return visit — this is what lets the
    // family spot guests inactive 30+ days in the Gast-Zugang list.
    await updateDoc(profRef, { lastActiveAt: serverTimestamp() }).catch(() => {});
  }
  /* Ein Termin (neuer Link) oder eine Reise (alter Link) — der Zugang
     heisst {uid}_{kennung}, und die Regel prueft das Token. */
  const kennung = eid || tripId;
  const accessRef = doc(db, 'guestAccess', `${user.uid}_${kennung}`);
  // Defensive: falls das get (z.B. durch alte Rules) scheitert, trotzdem
  // versuchen, den Zugang anzulegen — create validiert ohnehin das Token.
  const accessSnap = await getDoc(accessRef).catch(() => null);
  if (!accessSnap || !accessSnap.exists()) {
    await setDoc(accessRef, eid
      ? { uid: user.uid, gid, eid, token, createdAt: serverTimestamp() }
      : { uid: user.uid, tripId, token, createdAt: serverTimestamp() });
  }
}

/* Was die Seite zeigt — aus einem Termin oder einer (alten) Reise. */
function ausTermin(x) {
  return {
    titel: x.titel, ort: x.ort, notiz: x.notiz, punkte: x.programm || [],
    planHtml: x.planHtml, planUrl: x.planUrl, createdBy: x.createdBy, quelle: x,
  };
}
function ausReise(x) {
  return {
    titel: x.name, ort: x.destination, notiz: x.notes, punkte: x.itinerary || [],
    planHtml: x.planHtml, planUrl: x.planUrl, createdBy: x.createdBy, quelle: x,
  };
}

/* Der Termin wird einmal geholt und bei jedem Sprachwechsel neu
   gezeichnet — ohne erneutes Lesen und ohne neuen tripViews-Eintrag. */
let geladeneReise = null;
function zeichneReise(anzeige) {
  $('tripCard').innerHTML = `
    <p class="form-title">${escHtml(anzeige.titel || T('gast.reise', 'Reise'))}</p>
    ${anzeige.ort ? `<p class="gast-ziel">${escHtml(anzeige.ort)}</p>` : ''}
    ${anzeige.notiz ? `<p class="gast-notiz">${escHtml(anzeige.notiz)}</p>` : ''}
    ${(anzeige.planHtml || anzeige.planUrl) ? `<button class="btn btn-primary btn-block gast-original" id="gViewOriginal">${T('gast.original', 'Original-Design ansehen')}</button>` : ''}
  `;
  if ($('gViewOriginal')) $('gViewOriginal').onclick = () => {
    /* Bereinigt wie im Kalender (programm.js): keine Skripte, keine
       fremden Adressen ausser http(s). */
    const f = $('gViewerFrame');
    const adresse = sichereAdresse(anzeige.planUrl);
    if (adresse) { f.removeAttribute('srcdoc'); f.src = adresse; }
    else { f.removeAttribute('src'); f.srcdoc = sicheresHtml(anzeige.planHtml); }
    $('gViewer').classList.add('visible');
  };

  /* Nach Tagen, wie in der Gruppe; was vorbei ist, blendet sich ab. */
  $('itinList').innerHTML = anzeige.punkte.length
    ? punkteHtml(anzeige.punkte, { jetzt: jetztFuer(new Date()) })
    : `<p class="empty-hint gast-leer">${T('gast.keinProgramm', 'Noch kein Programm hinterlegt.')}</p>`;
}

async function ladeAnzeige() {
  if (eid) {
    const snap = await getDoc(doc(db, 'groups', gid, 'events', eid));
    return snap.exists() ? ausTermin(snap.data()) : null;
  }
  const tripSnap = await getDoc(doc(db, 'trips', tripId));
  if (!tripSnap.exists()) return null;
  const trip = tripSnap.data();
  /* Eine uebernommene Reise zeigt ihren Termin — der alte Zugang gilt
     dort, weil der Termin Kennung und Token der Reise traegt. */
  if (trip.uebernommen && trip.familyId) {
    const termin = await getDoc(doc(db, 'groups', trip.familyId, 'events', tripId)).catch(() => null);
    if (termin?.exists()) return ausTermin(termin.data());
  }
  return ausReise(trip);
}

async function loadDashboard(user) {
  const anzeige = await ladeAnzeige();
  if (!anzeige) { show('invalidLink'); return; }
  geladeneReise = anzeige;
  zeichneReise(anzeige);

  // Log that this guest viewed the trip — family can see this, guest can't.
  addDoc(collection(db, 'tripViews'), { tripId: eid || tripId, guestUid: user.uid, viewedAt: serverTimestamp() }).catch(() => {});

  if (anzeige.createdBy) {
    $('chatCard').hidden = false;
    wireChat(user.uid, anzeige.createdBy);
  }
  show('dashboard');
}

function convId(a, b) { return [a, b].sort().join('__'); }
function wireChat(me, other) {
  const cid = convId(me, other);
  onSnapshot(query(collection(db, 'dms', cid, 'messages'), orderBy('createdAt', 'asc')), snap => {
    const box = $('msgs');
    box.innerHTML = snap.docs.length ? snap.docs.map(d => {
      const m = d.data(); const mine = m.sender === me;
      return `<div class="g-bubble ${mine ? 'me' : 'them'}">${escHtml(m.text)}</div>`;
    }).join('') : `<p class="empty-hint">${T('gast.keineNachrichten', 'Noch keine Nachrichten — sag Hallo.')}</p>`;
    box.scrollTop = box.scrollHeight;
  }, () => {});

  $('sendBtn').onclick = async () => {
    const text = $('msgInput').value.trim();
    if (!text) return;
    $('msgInput').value = '';
    const convRef = doc(db, 'dms', cid);
    const guestName = localStorage.getItem('tvza.guestName') || 'Gast';
    await setDoc(convRef, {
      participants: [me, other].sort(),
      participantNames: { [me]: guestName },
      lastMessage: text.slice(0, 140),
      lastAt: serverTimestamp(),
      lastSender: me,
      unread: { [other]: increment(1), [me]: 0 }
    }, { merge: true });
    await addDoc(collection(convRef, 'messages'), { text, sender: me, createdAt: serverTimestamp() });
  };
  $('msgInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('sendBtn').click(); }
  });
}

let mode = 'register'; // or 'login'
/* Diese fuenf Elemente beschriftet nur der Code — darum tragen sie
   kein data-i18n (Falle 5 in CLAUDE.md). */
function beschrifte() {
  const neu = mode === 'register';
  $('authTitle').textContent = neu ? T('gast.willkommen', 'Willkommen!') : T('gast.willkommenZurueck', 'Willkommen zurück!');
  $('authSub').textContent = neu
    ? T('gast.subNeu', 'Erstelle ein Konto mit E-Mail und Passwort, um den Reiseplan zu sehen.')
    : T('gast.subLogin', 'Melde dich mit E-Mail und Passwort an.');
  $('requestBtn').textContent = neu ? T('gast.kontoErstellen', 'Konto erstellen') : T('login.anmelden', 'Anmelden');
  $('switchText').textContent = (neu ? T('login.schonKonto', 'Schon ein Konto?') : T('login.keinKonto', 'Noch kein Konto?')) + ' ';
  $('switchLink').textContent = neu ? T('login.anmelden', 'Anmelden') : T('login.registrieren', 'Registrieren');
}
function applyMode() {
  $('gNameField').hidden = mode !== 'register';
  beschrifte();
  $('authErr').hidden = true;
}
function neuBeschriften() {
  beschrifte();
  if (geladeneReise) zeichneReise(geladeneReise);
}
if (window.TVZAI18n) window.TVZAI18n.ready.then(neuBeschriften, () => {});
window.addEventListener('tvza-lang-change', neuBeschriften);
$('switchLink').addEventListener('click', () => { mode = mode === 'register' ? 'login' : 'register'; applyMode(); });

function translateAuthError(code) {
  if (code === 'auth/network-request-failed' || code === 'unavailable') {
    return T('login.fehler.netz', 'Keine Internetverbindung. Bitte versuche es erneut.');
  }
  if (code === 'auth/weak-password') {
    return T('login.fehler.schwach', 'Bitte verwende ein Passwort mit mindestens 6 Zeichen.');
  }
  if (mode === 'register') {
    return T('gast.fehlerRegistrieren', 'Gastkonto konnte nicht erstellt werden. Prüfe E-Mail und Passwort.');
  }
  return T('login.fehler.anmelden', 'Anmeldung nicht möglich. Prüfe E-Mail und Passwort.');
}

// A family account has a users/{uid} profile created through an invitation.
// A Firebase Auth login without that profile is not a family member.
async function isFamilyAccount(uid) {
  try { return await getDoc(doc(db, 'users', uid)).then(s => s.exists()); }
  catch (e) { return false; }
}

let guestAuthInProgress = false;
async function init() {
  if (!zielGueltig()) { show('invalidLink'); return; }
  applyMode();

  onAuthStateChanged(auth, async user => {
    if (guestAuthInProgress) return;
    if (!user) { show('requestForm'); return; }
    if (await isFamilyAccount(user.uid)) { show('wrongAccount'); return; }

    try {
      const name = $('gName').value.trim() || localStorage.getItem('tvza.guestName') || '';
      await ensureGuestAccess(user, name);
      await loadDashboard(user);
    } catch (e) {
      show('requestForm');
    }
  });
}

$('signOutBtn').addEventListener('click', async () => { await signOut(auth); location.reload(); });
$('gViewerClose').addEventListener('click', () => {
  $('gViewer').classList.remove('visible');
  const f = $('gViewerFrame'); f.removeAttribute('src'); f.removeAttribute('srcdoc');
});

$('requestBtn').addEventListener('click', async () => {
  const name = $('gName').value.trim();
  const email = $('gEmail').value.trim();
  const pass = $('gPass').value;
  if (!email || !pass) { $('authErr').textContent = T('login.fehler.leer', 'Bitte E-Mail und Passwort eingeben.'); $('authErr').hidden = false; return; }
  if (mode === 'register' && !name) { $('authErr').textContent = T('login.fehler.name', 'Bitte deinen Namen eingeben.'); $('authErr').hidden = false; return; }
  $('requestBtn').disabled = true;
  guestAuthInProgress = true;
  try {
    localStorage.setItem('tvza.guestName', name);
    const cred = mode === 'register'
      ? await createUserWithEmailAndPassword(auth, email, pass)
      : await signInWithEmailAndPassword(auth, email, pass);
    // Same guard as the auto-login path above — never tag a real family
    // account as a guest, even if someone types their real credentials
    // into this form.
    if (await isFamilyAccount(cred.user.uid)) { show('wrongAccount'); return; }
    await ensureGuestAccess(cred.user, name);
    await loadDashboard(cred.user);
  } catch (e) {
    $('authErr').textContent = translateAuthError(e.code);
    $('authErr').hidden = false;
    $('requestBtn').disabled = false;
  } finally {
    guestAuthInProgress = false;
  }
});

init();
