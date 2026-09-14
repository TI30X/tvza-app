/* ══════════════════════════════════════════════════════════════════
   Der Kalender — Daten, Blätter und Verdrahtung.

   Bis v.35.48.0 stand das alles als Inline-Modul in pages/planner.html:
   2500 Zeilen in einer Datei, dazu ein Stilblock von 220 Zeilen. Beim
   Umzug hierher (v.35.49.0) sind die Ansichten neu gebaut worden
   (eintraege.js rechnet, ansicht.js zeichnet); was Daten lädt, Gruppen
   übernimmt und die Blätter (Termin, Erinnerung, Reise, Programm,
   Dateien, Gäste, ICS) bedient, ist umgezogen, nicht umgeschrieben.

   Was sich für die Leute geändert hat, steht in ansicht.js und
   eintraege.js; hier nur so viel:
   - keine Frage "Google oder Outlook?" mehr beim ersten Öffnen,
   - am Handy: Liste, Tag, 3 Tage, Monat — am Laptop Tag, Woche, Monat,
     Liste; welche Ansicht man zuletzt hatte, merkt sich das Gerät,
   - Erinnerungen hinter der Glocke oben (und am Laptop in der
     Seitenleiste), statt als breiter Knopf über dem Inhalt.
   ══════════════════════════════════════════════════════════════════ */

import { db, requireAuth, wireOfflineBanner, escHtml, getProfile, reportClientError } from '../../firebase-config.js';
import { parseItineraryHtml, groupByDay } from '../../itinerary.js';
import { buildCalendarIcs, parseCalendarIcs } from '../../calendar-interop.js';
import {
  CALENDAR_COLORS, DEFAULT_CALENDAR_COLOR, addCalendarDays, startOfCalendarWeek,
  datesForCalendarView, moveCalendarAnchor,
  normalizeCalendarColor, normalizeCalendarPreference,
} from '../../calendar-view.js';
import {
  collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
/* EIN Gruppenmodell: groups/{gid}. Die alten Kalendergruppen
   (families) werden beim Oeffnen vom Kopf uebernommen (uebernahme.js)
   und stehen bis dahin als Quelle mit ihren Reisen daneben. */
import {
  beobachteMeineGruppen, beobachteTermine, aktiveGruppeSetzen, aktiveGruppeId, VORGABE_BEREICHE, leitet, wort,
} from '../../groups.js';
import { gruppenOptionen } from '../../gruppenwahl.js';
import { teamTerminText, teamFarben } from '../../kalender-teams.js';
import { familieUebernehmen, sollUebernehmen, vereinigeGruppen } from '../../uebernahme.js';
import { frage, waehle } from '../../dialog.js';
import { isoTag } from '../../termine.js';
import { sammeln, agenda, monatsWochen, zeitRaster } from './eintraege.js';
import {
  agendaHtml, monatHtml, tagesListeHtml, zeitHtml, verdrahten, monatJahr, rasterTitel,
} from './ansicht.js';
/* Die Hülle: Leiste, Router, Konto, Namenskarte. Früher ein zweites
   <script type="module"> in der Seite — die Seiten-Invariante erlaubt
   eins. */
import '../../nav.js?v=16';

const tt = (key, deutsch, vars) => (window.TVZAI18n ? window.TVZAI18n.tOr(key, deutsch, vars)
  : String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz)));

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,'0');
const keyOf = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
/* Heute wird bei jedem Zeichnen neu bestimmt — wer den Kalender über
   Mitternacht offen hat, sieht sonst "heute" beim gestrigen Tag. */
let todayKey = isoTag();
/* Die Hülle hält die Seite verborgen, bis der Kalender zum ersten Mal
   gezeichnet und die Liste auf heute gestellt ist. */
document.documentElement.dataset.routeReady = 'false';
const fmtDateKey = k => { if(!k) return ''; const [y,m,d]=k.split('-').map(Number); const dt=new Date(y,m-1,d); return `${WD[dt.getDay()].slice(0,2)}, ${d}. ${MONTHS[m-1]}`; };
const esc = s => escHtml(s);
const isMobileCalendar = () => matchMedia('(max-width:899px)').matches;

/* ── Dateien auf dem Gratis-Tarif: in Firestore, nicht in Cloud Storage.
   Bilder werden verkleinert, bis sie passen; Grosses gehört in den Link. */
const MAX_FILE = 900 * 1024;
function readAsDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result||'')); r.onerror=rej; r.readAsDataURL(file); }); }
function compressImage(file, maxDim, quality){ return new Promise(resolve=>{ const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{ let w=img.width,h=img.height; const sc=Math.min(1,maxDim/Math.max(w,h)); w=Math.round(w*sc); h=Math.round(h*sc);
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
    try{ resolve(c.toDataURL('image/jpeg',quality)); }catch(e){ resolve(null); } };
  img.onerror=()=>{ URL.revokeObjectURL(url); resolve(null); }; img.src=url; }); }
async function fileToStored(file){
  if(/^image\//.test(file.type)){ let q=0.82, d=await compressImage(file,1400,q);
    while(d && d.length>MAX_FILE && q>0.4){ q-=0.15; d=await compressImage(file,1200,q); }
    if(d && d.length<=MAX_FILE) return {name:file.name, type:'image/jpeg', size:d.length, dataUrl:d}; return null; }
  const d=await readAsDataURL(file); return d.length<=MAX_FILE ? {name:file.name, type:file.type||'', size:d.length, dataUrl:d} : null;
}
function dataUrlToBlob(d){ const [h,b]=d.split(','); const mime=(h.match(/:(.*?);/)||[])[1]||'application/octet-stream'; const bin=atob(b); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
function openStored(f){ if(!f)return; try{ const u=URL.createObjectURL(dataUrlToBlob(f.dataUrl)); window.open(u,'_blank','noopener'); }catch(e){ reportClientError('attachment-open', e); } }
async function loadAttachments(parentId){ try{ const s=await getDocs(query(collection(db,'attachments'), where('parent','==',parentId))); return s.docs.map(d=>({id:d.id,...d.data()})); }catch(e){ reportClientError('attachments-load', e); return []; } }
async function saveAttachment(parentId, scope, st){ return addDoc(collection(db,'attachments'), {parent:parentId, scope, name:st.name, type:st.type, size:st.size, dataUrl:st.dataUrl, by:user.uid, at:Date.now()}); }
async function delAttachment(id){ return deleteDoc(doc(db,'attachments',id)); }

const GROUP_COLORS = CALENDAR_COLORS.map(color => color.value);
let user, group = null, groups = [], groupsUnsub = null, reminderUnsub = null, tripUnsubs = [];
let trips = [], allTrips = [], days = [], reminders = [];
let visibleGroupIds = new Set(), showPersonal = true;
/* Teams: gespeichert werden die AUSGESCHALTETEN. Wer einem neuen Team
   beitritt, sieht dessen Termine sofort, statt sie erst suchen und
   einschalten zu muessen. */
let teams = [], teamTermine = new Map(), teamAbos = new Map(), versteckteTeams = new Set();
/* familien: die alten Kalendergruppen, in denen man steht. groups ist
   die Vereinigung: alle Gruppen, dazu jede Familie, die (noch) keine
   Gruppe ist. Beide Quellen kommen getrennt an; erst wenn beide da
   sind, wird vereinigt. */
let familien = [], teamsGeladen = false, familienGeladen = false, gruppenFarben = new Map();
let anchorKey = todayKey, curView = 'month';
let calendarPreference = normalizeCalendarPreference({});
let editTripId = null, editDayId = null, editReminderId = null, dayPane = 'paste', dayUploadHtml = '', sheetKey = null;
let pendingDayFiles = [], dayFiles = [], openPlanTripId = null, agendaShouldFocusToday = true;
let calendarEntryFocusPending = true, initialGroupsLoaded = false, initialRemindersLoaded = false, daysLoaded = false;
/* Die Einträge des letzten Zeichnens — ein Klick findet über sie seinen Eintrag. */
let aktuelleEintraege = new Map();

init();

async function init() {
  user = await requireAuth('../login.html');
  wireOfflineBanner();
  /* Die Fläche steht sofort — am Handy als App mit fester Leiste —, auch
     wenn die Gruppen noch laden. Bis v.35.48.0 blieb die Seite leer,
     bis alles da war. */
  document.body.dataset.calendarWorkspace = 'true';
  await getProfile(user);
  loadCalendarPreference();
  titelSetzen();
  wireUI();
  watchReminders();
  watchTeams();
  await resolveGroups();
  const requestedAction = new URLSearchParams(location.search).get('open');
  if (requestedAction === 'reminder-new') {
    setTimeout(() => openReminderForm(null,todayKey), 100);
  } else if (requestedAction === 'reminders' || location.hash === '#reminders') {
    setTimeout(openReminderHub, 100);
  }
}

/* ── Ansicht und Farbe ────────────────────────────────────────────
   Die Ansicht hängt am Gerät: am Handy liest man die Liste, am Laptop
   den Monat. Beide merken sich, was man zuletzt gewählt hat — getrennt,
   weil ein Monat am Handy und eine Liste am Laptop selten gewollt sind.
   "3 Tage" gibt es nur am Handy (dort ist eine Woche zu schmal), die
   Woche nur am Laptop; die Arbeitswoche früherer Versionen wird Woche. */
const preferenceKey = () => `tvza-calendar-preference-${user.uid}`;
const mobileViewKey = () => `tvza-mobile-calendar-view-${user.uid}`;
const sourceKey = () => `tvza-calendar-sources-${user.uid}`;
const ANSICHTEN_HANDY = ['agenda', 'day', '3day', 'month'];
const ANSICHTEN_LAPTOP = ['day', 'week', 'month', 'agenda'];
function passendeAnsicht(view) {
  const handy = isMobileCalendar();
  if (view === 'workweek') view = 'week';
  if (handy && view === 'week') view = '3day';
  if (!handy && view === '3day') view = 'week';
  const erlaubt = handy ? ANSICHTEN_HANDY : ANSICHTEN_LAPTOP;
  return erlaubt.includes(view) ? view : (handy ? 'agenda' : 'month');
}
function loadCalendarPreference() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(preferenceKey()) || '{}') || {}; } catch {}
  calendarPreference = normalizeCalendarPreference(raw);
  let mobileView = '';
  try { mobileView = localStorage.getItem(mobileViewKey()) || ''; } catch {}
  curView = passendeAnsicht(isMobileCalendar() ? mobileView : calendarPreference.view);
  renderPersonalColorOptions();
}
function saveCalendarPreference() {
  calendarPreference = normalizeCalendarPreference({
    ...calendarPreference,
    view: isMobileCalendar() ? calendarPreference.view : curView,
  });
  try { localStorage.setItem(preferenceKey(), JSON.stringify(calendarPreference)); } catch {}
}
function renderPersonalColorOptions() {
  const box = $('personalCalendarColors');
  if (!box) return;
  const gewaehlt = calendarPreference.personalColor;
  box.innerHTML = CALENDAR_COLORS.map(color => `
    <button class="calendar-color${color.value===gewaehlt?' is-selected':''}" type="button"
      data-personal-color="${color.value}" style="--choice-color:${color.value};--choice-ink:${color.ink}"
      aria-pressed="${color.value===gewaehlt}" aria-label="${esc(color.label)}" title="${esc(color.label)}"></button>`).join('');
  box.querySelectorAll('[data-personal-color]').forEach(button => button.onclick = () => {
    calendarPreference.personalColor = normalizeCalendarColor(button.dataset.personalColor);
    saveCalendarPreference();
    renderPersonalColorOptions();
    renderCalendarSources();
    renderCurrentView();
  });
}
function openCalendarSetup() {
  $('calendarSetupBackdrop').classList.add('visible');
  $('calendarSetupSheet').classList.add('visible');
}
function closeCalendarSetup() {
  $('calendarSetupBackdrop').classList.remove('visible');
  $('calendarSetupSheet').classList.remove('visible');
}

/* ── Gruppen ──
   Eine Farbe je Gruppe, aus teamFarben: dieselbe wie im Wechsler und
   fuer Reisen und Termine derselben Gruppe, und zwei Gruppen einer
   Person nie gleich. Gerechnet wird in vereinige(), nicht je Eintrag. */
const groupColor = id => gruppenFarben.get(id) || GROUP_COLORS[0];
const groupName = id => groups.find(item => item.id === id)?.name || tt('nav.gruppe','Gruppe');
const personalCalendarColor = () => normalizeCalendarColor(calendarPreference.personalColor || DEFAULT_CALENDAR_COLOR);

/* Die alten Einladungslinks (?invite=&token=) trugen in eine
   Kalendergruppe hinein. Die gibt es als eigenes Modell nicht mehr —
   eingeladen wird im Gruppe-Tab mit einem Code. Ein alter Link
   fuehrt darum dorthin, statt still in families zu schreiben. */
async function resolveGroups() {
  const params = new URLSearchParams(location.search);
  if (params.get('invite') && params.get('token')) {
    history.replaceState({}, '', location.pathname);
    const hin = await frage({
      titel:tt('cal.alterLinkTitel','Dieser Einladungslink ist veraltet'),
      text:tt('cal.alterLink','Kalendergruppen sind jetzt Gruppen. Bitte um einen neuen Einladungscode und tritt im Gruppe-Tab bei.'),
      ja:tt('kal.zurGruppe','Zur Gruppe'),
      nein:tt('a11y.schliessen','Schliessen'),
    });
    if (hin) { location.href = './gruppe.html'; return; }
  }
  watchGroups();
}

/* Sichtbar ist jede Gruppe, die nicht ausgeschaltet ist. Gemerkt
   werden die AUSGESCHALTETEN — eine neue Gruppe ist sofort zu sehen. */
function loadVisibleSources() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(sourceKey()) || 'null'); } catch {}
  versteckteTeams = new Set(Array.isArray(saved?.teamsAus) ? saved.teamsAus : []);
  showPersonal = saved?.personal !== false;
  visibleGroupIds = new Set(groups.map(item => item.id).filter(id => !versteckteTeams.has(id)));
}
function saveVisibleSources() {
  try {
    localStorage.setItem(sourceKey(), JSON.stringify({ personal:showPersonal, teamsAus:[...versteckteTeams] }));
  } catch {}
}

/* ── Teams: die Gruppen mit ihren Terminen ──
   Eine Quelle je Gruppe, live: wer im Gruppe-Tab einen Termin
   eintraegt, sieht ihn hier ohne Neuladen. Die Abos werden je Gruppe
   gefuehrt, damit ein Beitritt oder Austritt nur die eine Gruppe
   an- oder abmeldet. */
function watchTeams() {
  loadVisibleSources();
  beobachteMeineGruppen(user.uid, liste => {
    teams = liste;
    teamsGeladen = true;
    const ids = new Set(liste.map(item => item.id));
    for (const gid of [...teamAbos.keys()]) {
      if (ids.has(gid)) continue;
      teamAbos.get(gid)();
      teamAbos.delete(gid);
      teamTermine.delete(gid);
    }
    for (const gid of ids) {
      if (teamAbos.has(gid)) continue;
      teamAbos.set(gid, beobachteTermine(gid, termine => {
        teamTermine.set(gid, termine);
        renderCurrentView();
      }));
    }
    vereinige();
  });
}
async function zeigeTeamTermin(eintrag) {
  const zurGruppe = await frage({
    titel:eintrag.titel,
    /* teamTerminText kennt die Form aus kalender-teams.js: art ist dort
       das Wort ("Training"), nicht die Sorte des Eintrags. */
    text:teamTerminText({ art:eintrag.typ, ref:eintrag.ref, abgesagt:eintrag.abgesagt }),
    ja:tt('kal.zurGruppe','Zur Gruppe'),
    nein:tt('a11y.schliessen','Schliessen'),
  });
  if (!zurGruppe) return;
  aktiveGruppeSetzen(eintrag.ref.gid);
  location.href = './gruppe.html';
}
/* Die alten Kalendergruppen, in denen man steht. Sie werden nicht mehr
   verwaltet — nur noch gelesen, bis der Kopf sie uebernommen hat. */
function watchGroups() {
  if (groupsUnsub) groupsUnsub();
  groupsUnsub = onSnapshot(
    query(collection(db,'families'), where('members','array-contains',user.uid)),
    snap => {
      familien = snap.docs.map(item => ({ id:item.id, ...item.data() }));
      familienGeladen = true;
      vereinige();
    },
    error => {
      reportClientError('calendar-groups-load', error);
      familien = [];
      familienGeladen = true;
      vereinige();
    }
  );
}

/* Gruppen und noch nicht uebernommene Familien zu EINER Liste. Eine
   Familie, die schon eine Gruppe ist (gleiche Kennung), erscheint nur
   als Gruppe — ihre Reisen haengen an derselben Kennung und bleiben
   damit sichtbar. */
let letzteGruppenIds = null;
async function vereinige() {
  if (!teamsGeladen || !familienGeladen) return;
  const teamIds = new Set(teams.map(item => item.id));
  uebernimmFamilien(teamIds);
  groups = vereinigeGruppen(teams, familien);
  gruppenFarben = teamFarben(groups, GROUP_COLORS);
  visibleGroupIds = new Set(groups.map(item => item.id).filter(id => !versteckteTeams.has(id)));
  /* Neue Reisen gehen in die aktive Gruppe — derselbe Merker wie im
     Gruppe-Tab und in der Leiste, kein zweiter "Standardkalender". */
  group = groups.find(item => item.id === aktiveGruppeId()) || groups[0] || null;

  $('kalender').hidden = false;
  document.body.dataset.calendarWorkspace = 'true';
  $('manageGroupsBtn').hidden = !groups.length;
  renderCalendarSources();

  const ids = groups.map(item => item.id).join('|');
  if (ids !== letzteGruppenIds) {
    letzteGruppenIds = ids;
    await reload();
    watchTrips();
  } else {
    trips = allTrips.filter(item => visibleGroupIds.has(item.familyId));
    renderCurrentView();
  }
  initialGroupsLoaded = true;
  focusCalendarEntryWhenReady();
}

/* Der Kopf einer Familie uebernimmt sie beim Oeffnen des Kalenders
   (uebernahme.js). Einmal je Sitzung versucht: scheitert es, laeuft es
   beim naechsten Oeffnen wieder — jeder Schritt ist wiederholbar. */
const inUebernahme = new Set();
function uebernimmFamilien(teamIds) {
  for (const familie of familien) {
    if (!sollUebernehmen(familie, user.uid) || inUebernahme.has(familie.id)) continue;
    inUebernahme.add(familie.id);
    familieUebernehmen({
      db,
      fs:{ doc, collection, getDocs, writeBatch, updateDoc, serverTimestamp },
      familie,
      uid:user.uid,
      istGruppe:teamIds.has(familie.id),
      bereiche:VORGABE_BEREICHE.familie,
      token:randToken(),
      palette:GROUP_COLORS,
    }).catch(error => reportClientError('calendar-uebernahme', error));
  }
}

/* Die Quellen: am Laptop als Liste in der Seitenleiste, am Handy als
   Knöpfe unter der Befehlsleiste — nur, wenn es mehr als eine gibt. */
function renderCalendarSources() {
  const personalColor = personalCalendarColor();
  const quellen = [
    { attr:'data-source-personal', an:showPersonal, farbe:personalColor, name:tt('kal.persoenlichUndErinnerungen','Persönlich & Erinnerungen'), kurz:tt('kal.persoenlich','Persönlich') },
    ...groups.map(item => ({
      attr:`data-source-team="${esc(item.id)}"`, an:!versteckteTeams.has(item.id), farbe:groupColor(item.id),
      name:item.name || tt('nav.gruppe','Gruppe'), kurz:item.name || tt('nav.gruppe','Gruppe'),
    })),
  ];
  $('calendarSources').innerHTML = quellen.map(q => `
    <button class="kal-quelle${q.an?' is-an':''}" type="button" ${q.attr} aria-pressed="${q.an}" style="--farbe:${q.farbe}">
      <span class="kal-quelle__punkt"></span><span>${esc(q.name)}</span>
    </button>`).join('');
  $('calendarMobileSources').innerHTML = quellen.length > 1 ? quellen.map(q => `
    <button class="kal-chip${q.an?' is-an':''}" type="button" ${q.attr} aria-pressed="${q.an}" style="--farbe:${q.farbe}">
      <span class="kal-quelle__punkt"></span>${esc(q.kurz)}
    </button>`).join('') : '';
  $('calendarMobileSources').hidden = quellen.length <= 1;

  document.querySelectorAll('[data-source-personal]').forEach(button => button.onclick = () => {
    showPersonal = !showPersonal;
    saveVisibleSources();
    renderCalendarSources();
    renderReminders();
    renderCurrentView();
  });
  /* Ausschalten blendet beides aus: die Termine der Gruppe UND ihre
     Reisen. Eine Gruppe ist eine Quelle, nicht zwei. */
  document.querySelectorAll('[data-source-team]').forEach(button => button.onclick = () => {
    const id = button.dataset.sourceTeam;
    if (versteckteTeams.has(id)) versteckteTeams.delete(id); else versteckteTeams.add(id);
    visibleGroupIds = new Set(groups.map(item => item.id).filter(gid => !versteckteTeams.has(gid)));
    trips = allTrips.filter(item => visibleGroupIds.has(item.familyId));
    saveVisibleSources();
    renderCalendarSources();
    renderCurrentView();
  });
}

/* Gruppen werden an EINER Stelle angelegt, betreten und verwaltet: im
   Gruppe-Tab. Bis v.35.31.0 hatte der Kalender eine zweite Verwaltung
   fuer seine Kalendergruppen — Mitglieder, Rollen, Beitrittsanfragen,
   Einladungslink, Farbe —, alles doppelt und alles auf families. */
function zurGruppenseite() { location.href = './gruppe.html'; }

/* ── Wer darf in eine Gruppe eintragen? ───────────────────────────
   Die Leitung: Kopf und Trainer (v.35.49.0). Mitglieder lesen, sagen zu,
   haken Programmpunkte ab — sie tragen nichts in die Gruppe ein. Bis
   dahin bot der Kalender jedem Mitglied "Gruppentermin" an, für jede
   seiner Gruppen, und die Regel liess es zu. Eine alte Familie, die
   ihr Kopf noch nicht übernommen hat, leitet ihr Kopf oder ihre
   Verwaltung — wie vorher. */
function darfLeiten(gid) {
  const team = teams.find(g => g.id === gid);
  if (team) return leitet(team.meineRolle);
  const familie = familien.find(f => f.id === gid);
  return !!familie && (familie.headUid === user.uid || (familie.managers || []).includes(user.uid));
}
const geleiteteGruppen = () => groups.filter(g => darfLeiten(g.id));
const geleiteteTeams = () => teams.filter(g => leitet(g.meineRolle));

/* Wer mehrere Gruppen leitet, wählt; wer eine leitet, nicht. Die aktive
   Gruppe steht vorne — meist ist sie gemeint. */
async function gruppeZumEintragen(liste) {
  if (liste.length <= 1) return liste[0]?.id || null;
  const aktiv = liste.some(g => g.id === aktiveGruppeId()) ? aktiveGruppeId() : liste[0].id;
  return waehle({
    titel:tt('kal.inWelcheGruppe','In welche Gruppe?'),
    optionen:gruppenOptionen(liste, aktiv, wort),
  });
}

/* Ein Termin der Gruppe wird dort angelegt, wo die Gruppe ihn führt:
   im Gruppe-Tab, mit Art, Zusagen und Absage. Bis v.35.48.0 schrieb der
   Kalender stattdessen eine "Reise", die im Gruppe-Tab nie auftauchte. */
async function gruppenterminAnlegen(tag) {
  const gid = await gruppeZumEintragen(geleiteteTeams());
  if (!gid) return;
  aktiveGruppeSetzen(gid);
  location.href = `./gruppe.html?g=${encodeURIComponent(gid)}&neu=${encodeURIComponent(tag)}`;
}
/* Wechselt jemand die aktive Gruppe (Leiste, Gruppe-Tab), wandert der
   "Standard" fuer neue Reisen mit. */
window.addEventListener('firn-gruppe', () => vereinige());

/* ── Daten laden ── */
async function reload() {
  const t1 = Promise.all(groups.map(item =>
    getDocs(query(collection(db,'trips'), where('familyId','==',item.id)))
      .then(snapshot => snapshot.docs.map(entry => ({id:entry.id,...entry.data()})))
      .catch(error => { reportClientError('calendar-trips-load',error); return []; })
  )).then(result => {
    allTrips = result.flat();
    trips = allTrips.filter(item => visibleGroupIds.has(item.familyId));
  });
  const t2 = getDocs(query(collection(db,'calendarDays'), where('ownerUid','==',user.uid)))
    .then(s=>{ days = s.docs.map(d=>({id:d.id,...d.data()})); })
    .catch(e=>{ reportClientError('calendar-days-load',e); days=[]; })
    .finally(() => { daysLoaded = true; });
  await Promise.all([t1,t2]);
  renderCurrentView();
}

/* Reisen sind geteilte Daten der Gruppe. Ein einmaliges getDocs zeigte
   die Änderungen und Häkchen der anderen erst nach dem nächsten Öffnen.
   Ein Zuhörer je Gruppe hält Liste und offenes Programm gleich. */
function watchTrips() {
  tripUnsubs.forEach(unsubscribe => unsubscribe());
  tripUnsubs = [];
  const buckets = new Map(groups.map(item => [item.id, allTrips.filter(trip => trip.familyId === item.id)]));
  const sync = () => {
    allTrips = groups.flatMap(item => buckets.get(item.id) || []);
    trips = allTrips.filter(item => visibleGroupIds.has(item.familyId));
    renderCurrentView();
    if (openPlanTripId && $('viewer').classList.contains('visible') && !$('viewerPlan').hidden) {
      const current = allTrips.find(item => item.id === openPlanTripId);
      if (current) renderPlanViewer(current);
    }
  };
  groups.forEach(item => {
    tripUnsubs.push(onSnapshot(
      query(collection(db,'trips'), where('familyId','==',item.id)),
      snapshot => {
        buckets.set(item.id, snapshot.docs.map(entry => ({ id:entry.id, ...entry.data() })));
        sync();
      },
      error => reportClientError('calendar-trips-live', error)
    ));
  });
}

/* ── Erinnerungen ── */
const reminderCollection = () => collection(db, 'users', user.uid, 'reminders');
function markCalendarRouteReady() {
  document.documentElement.dataset.routeReady = 'true';
}
function focusCalendarEntryWhenReady() {
  if (!calendarEntryFocusPending || !initialGroupsLoaded || !initialRemindersLoaded) return;
  calendarEntryFocusPending = false;
  anchorKey = todayKey;
  agendaShouldFocusToday = true;
  renderCurrentView();
  if (curView !== 'agenda') markCalendarRouteReady();
}
function watchReminders() {
  if (reminderUnsub) reminderUnsub();
  reminderUnsub = onSnapshot(reminderCollection(), snap => {
    reminders = snap.docs.map(item => ({ id:item.id, ...item.data() }))
      .sort((a,b) =>
        Number(!!a.completed) - Number(!!b.completed) ||
        `${a.date||'9999'} ${a.time||''}`.localeCompare(`${b.date||'9999'} ${b.time||''}`)
      );
    initialRemindersLoaded = true;
    renderReminders();
    renderCurrentView();
    focusCalendarEntryWhenReady();
  }, () => {
    initialRemindersLoaded = true;
    $('reminderList').innerHTML = `<p class="empty-hint">${esc(tt('kal.erinnerungenFehler','Erinnerungen konnten nicht geladen werden.'))}</p>`;
    focusCalendarEntryWhenReady();
  });
}
function reminderWhen(reminder) {
  if (!reminder.date) return tt('kal.ohneDatum','Ohne Datum');
  const day = reminder.date === todayKey ? tt('home.heute','Heute') : fmtDateKey(reminder.date);
  return `${day}${reminder.time ? ' · ' + reminder.time : ''}`;
}
/* Offen zuerst, Erledigtes darunter. In der Seitenleiste nur die
   offenen — dort ist kein Platz für ein Archiv. */
function reminderListHtml({ nurOffene = false, hoechstens = Infinity } = {}) {
  const liste = (nurOffene ? reminders.filter(item => !item.completed) : reminders).slice(0, hoechstens);
  if (!liste.length) {
    return `<p class="empty-hint">${esc(reminders.length
      ? tt('kal.allesErledigt','Alles erledigt.')
      : tt('kal.nochKeineErinnerungen','Noch keine Erinnerungen.'))}</p>`;
  }
  return liste.map(item => `
    <div class="reminder-row${item.completed?' is-done':''}${!item.completed&&item.date&&item.date<todayKey?' is-overdue':''}">
      <button class="kal-haken${item.completed?' is-an':''}" type="button"
        data-reminder-check="${esc(item.id)}" aria-pressed="${!!item.completed}"
        aria-label="${esc(item.completed?tt('kal.wiederOffen','Wieder öffnen'):tt('kal.abhaken','Abhaken'))}"></button>
      <button class="reminder-row__body" type="button" data-reminder-edit="${esc(item.id)}">
        <span class="reminder-row__title">${esc(item.title||tt('kal.erinnerung','Erinnerung'))}</span>
        <span class="reminder-row__meta">${esc(reminderWhen(item))}</span>
      </button>
    </div>`).join('');
}
function bindReminderList(box) {
  box.querySelectorAll('[data-reminder-check]').forEach(button => button.onclick = async () => {
    const item = reminders.find(entry => entry.id === button.dataset.reminderCheck);
    if (item) await setReminderCompletion(item, !item.completed);
  });
  box.querySelectorAll('[data-reminder-edit]').forEach(button => button.onclick = () => {
    const item = reminders.find(entry => entry.id === button.dataset.reminderEdit);
    if (item) {
      closeReminderHub();
      openReminderForm(item);
    }
  });
}
function renderReminders() {
  const hub = $('reminderHubList'), seite = $('reminderList');
  if (hub) { hub.innerHTML = reminderListHtml(); bindReminderList(hub); }
  if (seite) {
    const offen = reminders.filter(item => !item.completed).length;
    seite.innerHTML = reminderListHtml({ nurOffene:true, hoechstens:6 })
      + (offen > 6 ? `<button class="kal-link" type="button" id="alleErinnerungen">${esc(tt('kal.alleErinnerungen','Alle {n} anzeigen', { n:offen }))}</button>` : '');
    bindReminderList(seite);
    if ($('alleErinnerungen')) $('alleErinnerungen').onclick = openReminderHub;
  }
  const open = reminders.filter(item => !item.completed);
  const overdue = open.filter(item => item.date && item.date < todayKey);
  const knopf = $('mobileRemindersBtn'), zahl = $('mobileReminderCount');
  if (knopf && zahl) {
    const label = open.length
      ? (open.length === 1 ? tt('kal.eineOffene','1 offene Erinnerung') : tt('kal.offeneErinnerungen','{n} offene Erinnerungen', { n:open.length }))
        + (overdue.length ? `, ${tt('kal.ueberfaellig','{n} überfällig', { n:overdue.length })}` : '')
      : tt('kal.keineOffenen','Keine offenen Erinnerungen');
    knopf.setAttribute('aria-label', label);
    knopf.title = label;
    zahl.hidden = !open.length;
    zahl.textContent = open.length>9 ? '9+' : String(open.length);
    zahl.classList.toggle('is-ueberfaellig', overdue.length > 0);
  }
}
function openReminderHub() {
  renderReminders();
  $('reminderHubBackdrop').classList.add('visible');
  $('reminderHubSheet').classList.add('visible');
}
function closeReminderHub() {
  $('reminderHubBackdrop').classList.remove('visible');
  $('reminderHubSheet').classList.remove('visible');
}
/* Wohin Neues geht: an den Tag, den man zuletzt angetippt hat — sonst
   an den gewählten Tag, nie in die Vergangenheit. */
let neuAm = null;
const neuerTag = () => neuAm || (anchorKey < todayKey ? todayKey : anchorKey);
function openCreateSheet(tag = null) {
  neuAm = tag;
  $('createSheetTitle').textContent = tag
    ? tt('kal.erstellenAm','Eintragen am {tag}', { tag:fmtDateKey(tag) })
    : tt('cal.erstellen','Erstellen');
  $('createGroupEventOption').hidden = !geleiteteTeams().length;
  $('createTripOption').hidden = !geleiteteGruppen().length;
  $('createBackdrop').classList.add('visible');
  $('createSheet').classList.add('visible');
}
function closeCreateSheet() {
  $('createBackdrop').classList.remove('visible');
  $('createSheet').classList.remove('visible');
}
function openReminderForm(existing = null, date = '') {
  editReminderId = existing?.id || null;
  $('reminderFormTitle').textContent = existing ? tt('kal.erinnerungBearbeiten','Erinnerung bearbeiten') : tt('cal.neueErinnerung','Neue Erinnerung');
  $('rTitle').value = existing?.title || '';
  $('rDate').value = existing?.date || date || todayKey;
  $('rTime').value = existing?.time || '';
  $('rNotes').value = existing?.notes || '';
  $('reminderComplete').hidden = !existing;
  $('reminderComplete').classList.toggle('is-completed', existing?.completed === true);
  $('reminderCompleteLabel').textContent = existing?.completed
    ? tt('kal.wiederOffenMarkieren','Wieder als offen markieren')
    : tt('cal.erledigt','Als erledigt markieren');
  $('reminderDelete').hidden = !existing;
  $('reminderBackdrop').classList.add('visible');
  $('reminderSheet').classList.add('visible');
  setTimeout(() => $('rTitle').focus(), 50);
}
function closeReminderForm() {
  $('reminderBackdrop').classList.remove('visible');
  $('reminderSheet').classList.remove('visible');
}
async function setReminderCompletion(item, completed) {
  if (!item?.id) return false;
  const previousCompleted = !!item.completed;
  item.completed = completed;
  renderReminders();
  renderCurrentView();
  try {
    await updateDoc(doc(reminderCollection(), item.id), {
      completed,
      completedAt: completed ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    item.completed = previousCompleted;
    renderReminders();
    renderCurrentView();
    reportClientError('reminder-completion', error);
    alert('Erinnerung konnte nicht aktualisiert werden.');
    return false;
  }
}

const itineraryItemDone = (trip, item) => {
  if (item?.id && Object.prototype.hasOwnProperty.call(trip?.itineraryDone||{},item.id)) {
    return !!trip.itineraryDone[item.id];
  }
  return !!item?.done;
};
async function toggleItineraryItem(trip, item) {
  if (!trip?.id || !item?.id) return;
  const before = itineraryItemDone(trip, item);
  const next = !before;
  trip.itineraryDone = { ...(trip.itineraryDone || {}), [item.id]:next };
  renderCurrentView();
  if (openPlanTripId === trip.id && !$('viewerPlan').hidden) renderPlanViewer(trip);
  try {
    await updateDoc(doc(db,'trips',trip.id), {
      [`itineraryDone.${item.id}`]:next,
      itineraryUpdatedAt:serverTimestamp()
    });
  } catch (error) {
    reportClientError('calendar-itinerary-toggle', error);
    trip.itineraryDone = { ...(trip.itineraryDone || {}), [item.id]:before };
    renderCurrentView();
    if (openPlanTripId === trip.id && !$('viewerPlan').hidden) renderPlanViewer(trip);
    alert('Der Programmpunkt konnte nicht aktualisiert werden.');
  }
}

/* ══ Zeichnen ══════════════════════════════════════════════════════
   Alle Ansichten aus DERSELBEN Liste von Einträgen (eintraege.js). */

function eintraegeJetzt() {
  return sammeln({
    tage:days,
    erinnerungen:reminders,
    reisen:trips,
    teams:groups.filter(item => !versteckteTeams.has(item.id))
      .map(gruppe => ({ gruppe, termine:teamTermine.get(gruppe.id) || [] })),
    persoenlich:showPersonal,
    farbePersoenlich:personalCalendarColor(),
    farbeVon:groupColor,
    nameVon:groupName,
    persoenlichName:tt('kal.persoenlich','Persönlich'),
  });
}

const erledigtVon = (eintrag, stop) => itineraryItemDone(eintrag.ref, stop);
const buehne = () => $('kalBuehne');

function titelSetzen() {
  if (curView === 'month') $('monthTitle').textContent = monatJahr(anchorKey);
  else if (curView === 'agenda') $('monthTitle').textContent = monatJahr(anchorKey);
  else $('monthTitle').textContent = rasterTitel(datesForCalendarView(anchorKey, curView), todayKey);
}

function renderCurrentView() {
  const el = buehne();
  if (!el || $('kalender').hidden) return;
  todayKey = isoTag();
  document.body.dataset.calendarView = curView;
  const liste = eintraegeJetzt();
  aktuelleEintraege = new Map(liste.map(e => [e.id, e]));
  titelSetzen();
  document.querySelectorAll('[data-calendar-view]').forEach(button => {
    const an = button.dataset.calendarView === curView;
    button.classList.toggle('is-an', an);
    button.setAttribute('aria-pressed', String(an));
  });
  renderMiniCalendars();
  el.dataset.ansicht = curView;
  /* Solange nicht alles geladen ist, zeichnen wir unsichtbar — die
     Liste soll nicht erst oben stehen und dann auf heute springen. */
  if (calendarEntryFocusPending) el.dataset.bereit = 'nein';
  else delete el.dataset.bereit;
  if (curView === 'agenda') renderListe(el, liste);
  else if (curView === 'month') renderMonat(el, liste);
  else renderZeit(el, liste);
}

/* Die Liste beginnt am Ersten des gewählten Monats und steht beim
   Öffnen auf heute; darüber liegt, was in diesem Monat schon war. */
function renderListe(el, liste) {
  const ab = `${anchorKey.slice(0,7)}-01`;
  const tage = agenda(liste, { ab, heute:todayKey });
  const behalten = !agendaShouldFocusToday ? el.scrollTop : null;
  el.innerHTML = `<div class="kal-liste">${agendaHtml(tage, { erledigtVon })}</div><div class="kal-auslauf" aria-hidden="true"></div>`;
  if (behalten !== null) { el.scrollTop = behalten; titelNachScroll(el); return; }
  if (calendarEntryFocusPending) return;
  agendaShouldFocusToday = false;
  const ziel = el.querySelector('.kal-tag.is-heute')
    || (ab.slice(0,7) === todayKey.slice(0,7) ? null : el.querySelector('.kal-tag'));
  const stellen = () => {
    /* Hat ein Zuhörer die Liste inzwischen neu gezeichnet, ist ziel
       nicht mehr im Dokument — dann misst es 0 und risse die Liste
       nach oben. Das neue Zeichnen hat die Stelle schon behalten. */
    if (ziel && !ziel.isConnected) return;
    const auslauf = el.querySelector('.kal-auslauf');
    if (!ziel) { el.scrollTop = 0; markCalendarRouteReady(); return; }
    /* Heute soll oben stehen, auch wenn danach wenig kommt — sonst
       klemmt der Browser das Scrollen, und oben steht Vergangenes. */
    const rest = el.scrollHeight - auslauf.offsetHeight - (ziel.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop);
    auslauf.style.height = `${Math.max(0, el.clientHeight - rest - 8)}px`;
    /* Steht heute gleich unter einer Monatsüberschrift, kommt sie mit;
       sonst steht heute unter der klebenden Überschrift, nicht dahinter. */
    const direkt = ziel.previousElementSibling?.classList.contains('kal-monat');
    const oben = direkt ? ziel.previousElementSibling : ziel;
    const kleber = direkt ? 0 : (el.querySelector('.kal-monat')?.offsetHeight || 0);
    el.scrollTop += oben.getBoundingClientRect().top - el.getBoundingClientRect().top - kleber;
    titelNachScroll(el);
    markCalendarRouteReady();
  };
  stellen();
  requestAnimationFrame(stellen);
}
/* In der Liste nennt der Titel den Monat, in dem man gerade liest. */
function titelNachScroll(el) {
  if (curView !== 'agenda') return;
  const oben = el.getBoundingClientRect().top + 4;
  let monat = null;
  for (const kopf of el.querySelectorAll('.kal-monat')) {
    if (kopf.getBoundingClientRect().top <= oben) monat = kopf;
    else break;
  }
  const iso = `${(monat || el.querySelector('.kal-monat'))?.dataset.monat || anchorKey.slice(0,7)}-01`;
  $('monthTitle').textContent = monatJahr(iso);
}

function renderMonat(el, liste) {
  const kompakt = isMobileCalendar();
  const wochen = monatsWochen(anchorKey, liste, { heute:todayKey });
  el.innerHTML = monatHtml(wochen, { gewaehlt:kompakt ? anchorKey : '', kompakt, spurenMax:3 })
    + (kompakt ? `<div class="kal-tagesliste">${tagesListeHtml(anchorKey, liste, { erledigtVon })}</div>` : '');
  el.scrollTop = 0;
}

const stundeHoehe = () => parseFloat(getComputedStyle(buehne()).getPropertyValue('--kal-stunde')) || 48;
function renderZeit(el, liste) {
  const tage = datesForCalendarView(anchorKey, curView);
  const jetzt = new Date();
  el.innerHTML = zeitHtml(zeitRaster(tage, liste), {
    heute:todayKey,
    jetzt:tage.includes(todayKey) ? jetzt.getHours() * 60 + jetzt.getMinutes() : null,
  });
  /* Auf die Stunde stellen, in der etwas passiert: heute zwei Stunden
     vor jetzt, sonst 7 Uhr — nicht auf Mitternacht. */
  const stunde = tage.includes(todayKey) ? Math.max(0, jetzt.getHours() - 2) : 7;
  el.scrollTop = stunde * stundeHoehe();
}

/* Ein Klick auf einen Eintrag öffnet, was zu ihm gehört: den Termin
   der Gruppe als Karte (bearbeitet wird er in der Gruppe), die Reise
   mit ihrem Programm, die Erinnerung, den eigenen Termin. */
function oeffne(eintrag) {
  if (eintrag.art === 'team') { zeigeTeamTermin(eintrag); return; }
  if (eintrag.art === 'reise') { openTrip(eintrag.ref.id); return; }
  if (eintrag.art === 'erinnerung') { openReminderForm(eintrag.ref); return; }
  openDayForm(eintrag.ref);
}

/* ── Mini-Monat (Seitenleiste am Laptop) ── */
function isoWeekNumber(value) {
  const date = new Date(`${value}T00:00:00`);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}
function renderMiniCalendars() {
  const container = $('miniCalendars');
  if (!container || isMobileCalendar()) return;
  const base = new Date(`${anchorKey}T00:00:00`);
  const month = new Date(base.getFullYear(), base.getMonth(), 1);
  const gridStart = startOfCalendarWeek(keyOf(month.getFullYear(), month.getMonth(), 1));
  const activeDates = new Set(['day','3day','week'].includes(curView) ? datesForCalendarView(anchorKey,curView) : [anchorKey]);
  const belegt = new Set();
  for (const e of aktuelleEintraege.values()) {
    if (e.erledigt) continue;
    for (let tag = e.von, n = 0; tag <= e.bis && n < 62; tag = addCalendarDays(tag, 1), n++) belegt.add(tag);
  }
  const rows = Array.from({length:6},(_,weekIndex)=>{
    const weekStart = addCalendarDays(gridStart,weekIndex*7);
    const daysHtml = Array.from({length:7},(_,dayIndex)=>{
      const dateKey = addCalendarDays(weekStart,dayIndex);
      const date = new Date(`${dateKey}T00:00:00`);
      const outside = date.getMonth() !== month.getMonth();
      return `<button class="mini-tag${outside?' is-aussen':''}${dateKey===todayKey?' is-heute':''}${activeDates.has(dateKey)?' is-gewaehlt':''}${belegt.has(dateKey)?' is-belegt':''}"
        type="button" data-mini-day="${dateKey}" aria-label="${fmtDateKey(dateKey)}">${date.getDate()}</button>`;
    }).join('');
    const selectedWeek = curView==='week' && startOfCalendarWeek(anchorKey)===weekStart;
    return `<div class="mini-woche${selectedWeek?' is-gewaehlt':''}">
      <button type="button" class="mini-woche__kw" data-mini-week="${weekStart}" title="${esc(tt('kal.kwOeffnen','KW {n} öffnen', { n:isoWeekNumber(weekStart) }))}">${isoWeekNumber(weekStart)}</button>
      ${daysHtml}
    </div>`;
  }).join('');
  container.innerHTML = `<div class="mini-monat">
    <div class="mini-monat__kopf">
      <strong>${esc(monatJahr(keyOf(month.getFullYear(), month.getMonth(), 1)))}</strong>
      <button type="button" data-mini-shift="-1" aria-label="${esc(tt('cal.vorheriger','Vorheriger Zeitraum'))}"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button type="button" data-mini-shift="1" aria-label="${esc(tt('cal.naechster','Nächster Zeitraum'))}"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <div class="mini-woche mini-woche--kopf" aria-hidden="true"><span>KW</span>${['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20'].map(iso => `<span>${esc(new Intl.DateTimeFormat(window.TVZAI18n?.locale || 'de-CH', { weekday:'narrow' }).format(new Date(`${iso}T12:00:00`)))}</span>`).join('')}</div>
    ${rows}
  </div>`;
  container.querySelectorAll('[data-mini-day]').forEach(button => button.onclick = () => {
    anchorKey = button.dataset.miniDay;
    agendaShouldFocusToday = false;
    renderCurrentView();
  });
  container.querySelectorAll('[data-mini-week]').forEach(button => button.onclick = () => {
    anchorKey = button.dataset.miniWeek;
    setView('week');
  });
  container.querySelectorAll('[data-mini-shift]').forEach(button => button.onclick = () => {
    const date = new Date(`${anchorKey}T00:00:00`);
    date.setMonth(date.getMonth() + Number(button.dataset.miniShift), 1);
    anchorKey = keyOf(date.getFullYear(),date.getMonth(),date.getDate());
    agendaShouldFocusToday = false;
    renderCurrentView();
  });
}

/* ── Reise (Termin der Gruppe) ── */
let newTripFileHtml = '';
let editTripItinerary = [];
function setTripPlanPane(p){
  document.querySelectorAll('#tpTabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.tpane===p));
  document.querySelectorAll('#tripSheet [data-tbody]').forEach(b=>{ b.hidden = b.dataset.tbody!==p; });
}
function describePlanHtml(html, baseDate = $('tStart').value) {
  const status = $('tpImportStatus');
  if (!html?.trim()) {
    status.className='html-import-feedback';
    status.textContent='Erkannte Tage und Programmpunkte erscheinen automatisch im Kalender. Die Originalseite bleibt zusätzlich öffnbar; Skripte werden nicht ausgeführt.';
    return;
  }
  const parsed = parseItineraryHtml(html,{baseDate});
  if (parsed.items.length) {
    status.className='html-import-feedback is-good';
    status.textContent=`${parsed.items.length} Programmpunkt${parsed.items.length===1?'':'e'} an ${parsed.days||1} Tag${parsed.days===1?'':'en'} erkannt — sie erscheinen im Kalender.`;
  } else {
    status.className='html-import-feedback is-warning';
    status.textContent='Die Seite wird gespeichert und lässt sich öffnen, aber es wurden keine einzelnen Programmpunkte erkannt.';
  }
}
function openTripForm(t){
  editTripId = t ? t.id : null;
  $('tripFormTitle').textContent = t ? tt('kal.terminBearbeiten','Termin bearbeiten') : tt('cal.gruppentermin','Gruppentermin');
  $('tName').value=t?.name||''; $('tDest').value=t?.destination||'';
  /* Nur Gruppen, die man leitet — dorthin darf man eintragen und
     verschieben (die Regel für trips verlangt es für beide Seiten). */
  const waehlbar = geleiteteGruppen();
  $('tGroup').innerHTML = waehlbar.map(item=>`<option value="${esc(item.id)}">${esc(item.name||'Gruppe')}</option>`).join('');
  $('tGroup').value = t?.familyId || (waehlbar.some(g => g.id === group?.id) ? group.id : waehlbar[0]?.id) || '';
  $('tStart').value=t?.startDate||(sheetKey||''); $('tEnd').value=t?.endDate||'';
  $('tStartTime').value=t?.startTime||''; $('tEndTime').value=t?.endTime||'';
  $('tNotes').value=t?.notes||'';
  $('tpHtml').value = t?.planHtml || '';
  $('tpUrl').value = t?.planUrl || '';
  editTripItinerary = t?.itinerary || [];
  newTripFileHtml = '';
  $('tpChosen').hidden = true;
  describePlanHtml(t?.planHtml||'');
  setTripPlanPane('paste');
  $('tripFormDelete').hidden = !t;
  $('tripBackdrop').classList.add('visible'); $('tripSheet').classList.add('visible');
}
function closeTripForm(){ $('tripBackdrop').classList.remove('visible'); $('tripSheet').classList.remove('visible'); }
async function tripLoeschen(id) {
  const aq = await getDocs(query(collection(db,'activities'), where('tripId','==',id)));
  await Promise.all(aq.docs.map(d=>deleteDoc(d.ref)));
  const fq = await loadAttachments(id);
  await Promise.all(fq.map(f=>delAttachment(f.id).catch(()=>{})));
  await deleteDoc(doc(db,'trips',id));
}

/* ── Reise im Detail ── */
async function openTrip(id){
  const s=await getDoc(doc(db,'trips',id)); if(!s.exists())return;
  const tr={id:s.id,...s.data()}; editTripId=id;
  const acts=await getDocs(query(collection(db,'activities'), where('tripId','==',id))).then(q=>q.docs.map(d=>({id:d.id,...d.data()}))).catch(()=>[]);
  const files=await loadAttachments(id);
  $('kalender').hidden = true;
  $('tripDetail').hidden = false;
  delete document.body.dataset.calendarWorkspace;
  window.scrollTo(0,0);
  renderTripDetail(tr, acts, files);
}
function backToGroup(){
  $('tripDetail').hidden = true;
  $('kalender').hidden = false;
  document.body.dataset.calendarWorkspace='true';
  agendaShouldFocusToday = false;
  reload();
}

function renderTripDetail(tr, acts, files){
  files = files || [];
  const dt = tr.startDate ? (fmtDateKey(tr.startDate)+(tr.endDate&&tr.endDate!==tr.startDate?' – '+fmtDateKey(tr.endDate):'')) : 'Kein Datum';
  // Nach Tagen: ein Plan über drei Tage liest sich als drei Tage.
  const itinDays = groupByDay(tr.itinerary||[]);
  const itinCount = (tr.itinerary||[]).length;
  /* Ändern, Programm pflegen, Gäste einladen, löschen: die Leitung der
     Gruppe. Mitglieder sehen das Programm, haken ab, teilen Aufgaben und
     Dateien — so wie die Regel für trips es seit v.35.49.0 hält. */
  const leite = darfLeiten(tr.familyId);
  const v = $('tripDetail');
  v.innerHTML = `
    <button class="b b--secondary" id="tdBack" type="button"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg> ${esc(tt('nav.kalender','Kalender'))}</button>
    <div class="grp-card reise-kopf" style="--farbe:${groupColor(tr.familyId)}">
      <div class="grp-top"><span class="grp-name">${esc(tr.name)}</span>
        ${leite ? `<button class="row__aktion" id="tdEdit" type="button" title="Bearbeiten" aria-label="Bearbeiten"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>` : ''}</div>
      ${tr.destination?`<div class="item-meta">${esc(tr.destination)}</div>`:''}
      <div class="item-meta">${esc(dt)} · ${esc(groupName(tr.familyId))}</div>
      ${tr.notes?`<p class="reise-notiz">${esc(tr.notes)}</p>`:''}
      <div class="grp-actions"><button class="b b--secondary" id="tdIcs" type="button"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> .ics</button>
        ${(tr.planHtml||tr.planUrl||itinCount)?`<button class="b b--primary" id="pOpenTop" type="button">${esc(tt('kal.programmOeffnen','Programm öffnen'))}</button>`:''}</div>
    </div>

    <div class="sub-card"><div class="sub-title">Programm</div>
      ${leite ? `<div class="row2"><input class="form-input" id="iDate" type="date"><input class="form-input" id="iTime" type="time"></div>
      <input class="form-input feld-abstand" id="iTitle" placeholder="Programmpunkt">
      <button class="btn btn-primary btn-block feld-abstand" id="iAdd" type="button">Hinzufügen</button>` : ''}
      <div class="feld-abstand" id="iList">${itinCount ? itinDays.map(day => `
        <div class="itin-day">
          <div class="marke">${esc(day.heading)}</div>
          <div class="rows">${day.items.map(it => {
            const done = itineraryItemDone(tr,it);
            return `<div class="row row--static${done?' done':''}" data-bereich="kalender">
              <button class="kal-haken${done?' is-an':''}" type="button" data-itog="${esc(it.id||'')}"
                aria-pressed="${done}" aria-label="${done?'Wieder öffnen':'Als erledigt markieren'}"></button>
              <span class="row__body">
                <span class="row__title">${esc(it.title)}</span>
                ${it.tag ? `<span class="prog-tag">${esc(it.tag)}</span>` : ''}
                ${it.notes ? `<span class="row__sub">${esc(it.notes)}</span>` : ''}
                ${it.transport ? `<span class="row__sub">→ ${esc(it.transport)}</span>` : ''}
              </span>
              <span class="row__end">
                ${it.timeLabel||it.time ? `<span class="row__time">${esc(it.timeLabel||it.time)}</span>` : ''}
                ${leite ? `<button class="row__aktion row__aktion--gefahr" type="button" data-idel="${(tr.itinerary||[]).indexOf(it)}" title="Entfernen" aria-label="Entfernen"><svg class="ic" viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>` : ''}
              </span>
            </div>`;
          }).join('')}</div>
        </div>`).join('') : '<p class="empty-hint">Noch nichts geplant.</p>'}</div>
    </div>

    ${leite ? `<div class="sub-card"><div class="sub-title">Gast-Zugang</div>
      <p class="blatt-text">Teile diesen Link nur mit Personen, die den Plan sehen und mit euch chatten dürfen.</p>
      <button class="btn btn-primary btn-block" id="gShare" type="button">Gast-Link erstellen &amp; kopieren</button>
      <div class="feld-abstand" id="gList"><p class="empty-hint">Lade Gäste…</p></div>
    </div>` : ''}

    <div class="sub-card"><div class="sub-title">Aufgaben</div>
      <input class="form-input" id="aName" placeholder="Aufgabe / Besorgung">
      <button class="btn btn-primary btn-block feld-abstand" id="aAdd" type="button">Hinzufügen</button>
      <div class="feld-abstand" id="aList">${acts.length?acts.map(a=>`<div class="line ${a.done?'done':''}"><button class="kal-haken${a.done?' is-an':''}" type="button" data-tog="${a.id}" data-done="${a.done?1:0}" aria-pressed="${!!a.done}" aria-label="Erledigt"></button><span class="l-main"><span class="l-title">${esc(a.name)}</span></span><button class="row__aktion row__aktion--gefahr" type="button" data-adel="${a.id}" title="Löschen" aria-label="Löschen"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>`).join(''):'<p class="empty-hint">Keine Aufgaben.</p>'}</div>
    </div>

    ${leite ? `<div class="sub-card"><div class="sub-title">Plan / Info-Seite</div>
      <div class="tabs">
        <button class="tab active" type="button" data-tp="paste">HTML</button><button class="tab" type="button" data-tp="upload">Datei</button><button class="tab" type="button" data-tp="url">Link</button></div>
      <div data-tb="paste"><textarea class="form-textarea" id="pHtml" rows="3" placeholder="HTML…">${esc(tr.planHtml||'')}</textarea></div>
      <div data-tb="upload" hidden><label class="drop" id="pDrop"><span id="pDropText">HTML-Datei wählen</span><input type="file" id="pFile" accept=".html,.htm,text/html" hidden></label><p class="gewaehlt" id="pChosen" hidden></p></div>
      <div data-tb="url" hidden><input class="form-input" id="pUrl" type="url" placeholder="https://…" value="${esc(tr.planUrl||'')}"></div>
      <div class="knopfreihe"><button class="btn btn-primary knopfreihe__breit" id="pSave" type="button">Speichern</button></div>
    </div>` : ''}

    <div class="sub-card"><div class="sub-title">Dateien</div>
      <p class="blatt-text">Bilder werden automatisch verkleinert. Sehr grosse Dateien: lieber den Link-Tab oben nutzen.</p>
      <label class="drop" id="fDrop"><span>Dateien wählen (PDF, Bild, …)</span><input type="file" id="fInput" multiple hidden></label>
      <div class="progress" id="fProg" hidden><i></i></div>
      <div class="feld-abstand" id="fList"></div>
    </div>

    ${leite ? '<button class="btn btn-danger btn-block" id="tdDelete" type="button">Termin löschen</button>' : ''}
  `;
  $('tdBack').onclick = backToGroup;
  if ($('tdEdit')) $('tdEdit').onclick = () => openTripForm(tr);
  $('tdIcs').onclick = () => downloadIcs([tr], (tr.name||'termin'));
  if ($('pOpenTop')) $('pOpenTop').onclick = () => openPlan(tr);
  if (leite) wireGuestSection(tr);
  if ($('iAdd')) $('iAdd').onclick = async () => {
    const title=$('iTitle').value.trim(); if(!title)return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const next=[...(tr.itinerary||[]), {id, title, date:$('iDate').value, time:$('iTime').value}];
    await updateDoc(doc(db,'trips',tr.id),{itinerary:next}); tr.itinerary=next; renderTripDetail(tr,acts,files);
  };
  v.querySelectorAll('[data-idel]').forEach(b=>b.onclick=async()=>{
    // Index ins gespeicherte Feld, nicht in die sortierte Ansicht.
    const i=+b.dataset.idel; if(i<0) return;
    const n=(tr.itinerary||[]).filter((_,j)=>j!==i);
    await updateDoc(doc(db,'trips',tr.id),{itinerary:n}); tr.itinerary=n; renderTripDetail(tr,acts,files); });
  v.querySelectorAll('[data-itog]').forEach(button => button.onclick = () => {
    const item = (tr.itinerary||[]).find(entry=>entry.id===button.dataset.itog);
    if (item) toggleItineraryItem(tr,item).then(()=>renderTripDetail(tr,acts,files));
  });
  $('aAdd').onclick = async () => { const name=$('aName').value.trim(); if(!name)return; await addDoc(collection(db,'activities'),{tripId:tr.id,name,done:false,createdAt:serverTimestamp()}); openTrip(tr.id); };
  v.querySelectorAll('[data-tog]').forEach(b=>b.onclick=async()=>{ await updateDoc(doc(db,'activities',b.dataset.tog),{done:b.dataset.done!=='1'}); openTrip(tr.id); });
  v.querySelectorAll('[data-adel]').forEach(b=>b.onclick=async()=>{ await deleteDoc(doc(db,'activities',b.dataset.adel)); openTrip(tr.id); });
  v.querySelectorAll('[data-tp]').forEach(t=>t.onclick=()=>{ v.querySelectorAll('[data-tp]').forEach(x=>x.classList.toggle('active',x===t)); v.querySelectorAll('[data-tb]').forEach(b=>{ b.hidden = b.dataset.tb!==t.dataset.tp; }); });
  let planFileHtml='';
  if($('pFile')) $('pFile').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{planFileHtml=String(r.result||'');$('pChosen').textContent=f.name;$('pChosen').hidden=false;}; r.readAsText(f); };
  if ($('pDrop')) $('pDrop').onclick=()=>$('pFile').click();
  if ($('pSave')) $('pSave').onclick = async () => {
    const active=[...v.querySelectorAll('[data-tp]')].find(x=>x.classList.contains('active')).dataset.tp;
    let planHtml='',planUrl='';
    if(active==='upload'&&planFileHtml)planHtml=planFileHtml; else if(active==='url')planUrl=$('pUrl').value.trim(); else planHtml=$('pHtml').value.trim();
    // Einlesen: Programmpunkte aus der HTML ersetzen die vom letzten
    // Einlesen desselben Plans; von Hand angelegte bleiben.
    let itinerary = tr.itinerary || [];
    if (planHtml) {
      const { items } = parseItineraryHtml(planHtml, { baseDate: tr.startDate });
      if (items.length) {
        const manual = itinerary.filter(it => !it.autoImported);
        itinerary = [...manual, ...items];
      }
    }
    await updateDoc(doc(db,'trips',tr.id),{planHtml,planUrl,itinerary});
    tr.planHtml=planHtml; tr.planUrl=planUrl; tr.itinerary=itinerary;
    renderTripDetail(tr,acts,files);
  };
  let curFiles = files;
  const bindFiles=()=>{ $('fList').innerHTML=renderFileList(curFiles);
    v.querySelectorAll('[data-fopen]').forEach(b=>b.onclick=()=>openStored(curFiles[+b.dataset.fopen]));
    v.querySelectorAll('[data-fdel]').forEach(b=>b.onclick=()=>removeFile(b.dataset.fdel,curFiles,bindFiles)); };
  bindFiles();
  $('fDrop').onclick=()=>$('fInput').click();
  $('fInput').onchange=async e=>{ await uploadFiles(tr.id,'trip',[...e.target.files],curFiles); bindFiles(); $('fInput').value=''; };
  if ($('tdDelete')) $('tdDelete').onclick = async () => {
    if(!confirm('Diesen Termin löschen?'))return;
    await tripLoeschen(tr.id);
    backToGroup();
  };
}

function randToken(){ return Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b=>b.toString(36)).join('').slice(0,16); }

async function wireGuestSection(tr){
  $('gShare').onclick = async () => {
    let token = tr.guestToken;
    if (!token) { token = randToken(); await updateDoc(doc(db,'trips',tr.id),{guestToken:token}); tr.guestToken = token; }
    const url = `${location.origin}${location.pathname.replace(/planner\.html$/, 'guest.html')}?trip=${tr.id}&token=${token}`;
    try { await navigator.clipboard.writeText(url); $('gShare').textContent = 'Link kopiert'; }
    catch(e) { window.prompt('Link kopieren:', url); }
    setTimeout(()=>{ if($('gShare')) $('gShare').textContent = 'Gast-Link erstellen & kopieren'; }, 2000);
  };
  await loadGuestList(tr);
}

async function loadGuestList(tr){
  const list = $('gList');
  if (!list) return;
  try {
    const aq = await getDocs(query(collection(db,'guestAccess'), where('tripId','==',tr.id)));
    if (!aq.docs.length) { list.innerHTML = '<p class="empty-hint">Noch keine Gäste.</p>'; return; }
    const rows = await Promise.all(aq.docs.map(async d => {
      const g = d.data();
      let name = g.uid, lastActiveAt = null;
      try {
        const p = await getDoc(doc(db,'guestProfiles',g.uid));
        if (p.exists()) { name = p.data().name || p.data().email || g.uid; lastActiveAt = p.data().lastActiveAt || null; }
      } catch(e) {}
      return { uid: g.uid, name, docId: d.id, lastActiveAt };
    }));
    // Inaktive Gäste löscht Firestore nicht von selbst (dafür bräuchte es
    // eine Cloud Function auf Blaze). "Zuletzt aktiv" ist der Ersatz.
    const dayMs = 86400000;
    list.innerHTML = rows.map(r => {
      let sub = 'noch nie aktiv';
      if (r.lastActiveAt?.toDate) {
        const tage = Math.floor((Date.now() - r.lastActiveAt.toDate().getTime()) / dayMs);
        sub = tage <= 0 ? 'heute aktiv' : `vor ${tage} Tag${tage===1?'':'en'} aktiv`;
      }
      const stale = r.lastActiveAt?.toDate && (Date.now() - r.lastActiveAt.toDate().getTime()) / dayMs > 30;
      return `<div class="line">
        <span class="l-main"><span class="l-title">${esc(r.name)}</span><span class="l-sub${stale?' is-alt':''}">${sub}</span></span>
        <button class="row__aktion" type="button" data-gchat="${esc(r.uid)}" data-gname="${esc(r.name)}" title="Chat" aria-label="Chat"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
        <button class="row__aktion row__aktion--gefahr" type="button" data-gdel="${esc(r.docId)}" title="Entfernen" aria-label="Entfernen"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-gchat]').forEach(b=>b.onclick=()=>{
      const destination = `messages.html?to=${encodeURIComponent(b.dataset.gchat)}&name=${encodeURIComponent(b.dataset.gname)}`;
      if (!window.tvzaNavigate?.(destination)) location.href = destination;
    });
    list.querySelectorAll('[data-gdel]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Gast-Zugang entfernen?')) return;
      await deleteDoc(doc(db,'guestAccess',b.dataset.gdel));
      loadGuestList(tr);
    });
  } catch(e) { reportClientError('calendar-guests-load',e); list.innerHTML = '<p class="empty-hint">Gäste konnten nicht geladen werden.</p>'; }
}

const DATEI_SYMBOL = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const BILD_SYMBOL = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
function renderFileList(files){
  if(!files||!files.length) return '<p class="empty-hint">Keine Dateien.</p>';
  return files.map((f,i)=>`<div class="file-row"><span class="file-ic">${/image\//.test(f.type)?BILD_SYMBOL:DATEI_SYMBOL}</span>
    <span class="item-body"><span class="l-title datei-name">${esc(f.name)}</span>
    <span class="l-sub">${(f.size/1024).toFixed(0)} KB</span></span>
    <button class="b b--secondary" type="button" data-fopen="${i}">Öffnen</button>
    <button class="row__aktion row__aktion--gefahr" type="button" data-fdel="${esc(f.id||'')}" title="Löschen" aria-label="Löschen"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>`).join('');
}
async function uploadFiles(parentId, scope, list, curFiles){
  const prog=$('fProg'); if(prog) prog.hidden=false;
  for(const file of list){
    const st=await fileToStored(file);
    if(!st){ alert(`„${file.name}" ist zu gross für den Gratis-Speicher (max ~0,9 MB; Bilder werden automatisch verkleinert). Für grosse Dateien nutze den Link-Tab.`); continue; }
    try{ const r=await saveAttachment(parentId,scope,st); curFiles.push({id:r.id,...st}); }
    catch(e){ reportClientError('attachment-save',e); alert('Datei speichern fehlgeschlagen.'); }
  }
  if(prog) prog.hidden=true;
}
async function removeFile(id, curFiles, rebind){ if(!id)return; if(!confirm('Datei löschen?'))return;
  try{ await delAttachment(id); }catch(e){reportClientError('attachment-delete',e);} const i=curFiles.findIndex(f=>f.id===id); if(i>=0)curFiles.splice(i,1); rebind(); }

/* ── Eigener Termin ── */
function setDayPane(p){ dayPane=p; document.querySelectorAll('#dayForm .tab').forEach(t=>t.classList.toggle('active',t.dataset.pane===p)); document.querySelectorAll('#dayForm [data-body]').forEach(b=>{ b.hidden = b.dataset.body!==p; }); }
function bindDayFiles(){
  const ex = dayFiles.map((f,i)=>`<div class="file-row"><span class="file-ic">${/image\//.test(f.type)?BILD_SYMBOL:DATEI_SYMBOL}</span><span class="item-body"><span class="l-title datei-name">${esc(f.name)}</span><span class="l-sub">${(f.size/1024).toFixed(0)} KB</span></span><button class="b b--secondary" type="button" data-dfo="${i}">Öffnen</button><button class="row__aktion row__aktion--gefahr" type="button" data-dfd="${esc(f.id)}" title="Löschen" aria-label="Löschen"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>`).join('');
  const st = pendingDayFiles.map(f=>`<div class="file-row"><span class="file-ic">${DATEI_SYMBOL}</span><span class="item-body"><span class="l-title">${esc(f.name)}</span><span class="l-sub">wird beim Speichern hochgeladen</span></span></div>`).join('');
  $('dFileList').innerHTML = ex+st;
  $('dFileList').querySelectorAll('[data-dfo]').forEach(b=>b.onclick=()=>openStored(dayFiles[+b.dataset.dfo]));
  $('dFileList').querySelectorAll('[data-dfd]').forEach(b=>b.onclick=async()=>{ if(!confirm('Datei löschen?'))return; await delAttachment(b.dataset.dfd).catch(()=>{}); const i=dayFiles.findIndex(x=>x.id===b.dataset.dfd); if(i>=0)dayFiles.splice(i,1); bindDayFiles(); });
}
async function openDayForm(existing){
  editDayId=existing?existing.id:null; dayUploadHtml=''; pendingDayFiles=[]; dayFiles=[];
  $('dayFormTitle').textContent=existing?tt('kal.eigenerBearbeiten','Termin bearbeiten'):tt('cal.persoenlich','Persönlicher Termin');
  $('dTitle').value=existing?.title||''; $('dDate').value=existing?.date||sheetKey||todayKey;
  $('dEndDate').value=existing?.endDate && existing.endDate!==existing.date ? existing.endDate : '';
  $('dStartTime').value=existing?.startTime||'';
  $('dEndTime').value=existing?.endTime||'';
  $('dLocation').value=existing?.location||'';
  $('dNotes').value=existing?.notes||'';
  $('dHtml').value=existing?.planHtml||''; $('dUrl').value=existing?.planUrl||''; $('dHtmlChosen').hidden=true;
  $('dFileList').innerHTML='';
  $('dayFormDelete').hidden=!existing;
  setDayPane(existing?.planUrl&&!existing?.planHtml?'url':'paste');
  $('dayFormBackdrop').classList.add('visible'); $('dayForm').classList.add('visible');
  setTimeout(() => { if (!existing) $('dTitle').focus(); }, 50);
  if(existing){ dayFiles = await loadAttachments(existing.id); bindDayFiles(); }
}
function closeDayForm(){ $('dayFormBackdrop').classList.remove('visible'); $('dayForm').classList.remove('visible'); }

/* ── Programm und Info-Seite ── */
function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value||''));
    return ['http:','https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}
function safePlanHtml(html) {
  if (!html?.trim()) return '';
  const parsed = new DOMParser().parseFromString(html,'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv="refresh"],link[rel="modulepreload"],link[rel="preload"]')
    .forEach(element=>element.remove());
  parsed.querySelectorAll('*').forEach(element=>{
    [...element.attributes].forEach(attribute=>{
      const name=attribute.name.toLowerCase(), value=attribute.value.trim();
      if(name.startsWith('on') || name==='srcdoc') element.removeAttribute(attribute.name);
      if(['href','src','xlink:href','action','formaction'].includes(name) && /^(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(value)) element.removeAttribute(attribute.name);
      if(name==='style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(value)) element.removeAttribute(attribute.name);
    });
    if(element.tagName==='A'){
      element.setAttribute('target','_blank');
      element.setAttribute('rel','noopener noreferrer');
    }
  });
  return '<!doctype html>'+parsed.documentElement.outerHTML;
}
function renderPlanViewer(tr) {
  const items = tr.itinerary || [];
  const grouped = groupByDay(items);
  const doneCount = items.filter(item=>itineraryItemDone(tr,item)).length;
  const pct = items.length ? Math.round(doneCount/items.length*100) : 0;
  const range = tr.startDate
    ? `${fmtDateKey(tr.startDate)}${tr.endDate&&tr.endDate!==tr.startDate?' – '+fmtDateKey(tr.endDate):''}`
    : 'Ohne festes Datum';
  $('viewerPlan').innerHTML = `<div class="plan-wrap">
    <section class="plan-hero">
      <div class="plan-hero__eyebrow">${esc(groupName(tr.familyId))}</div>
      <h2>${esc(tr.name||'Programm')}</h2>
      <div class="plan-hero__meta">${esc(range)}${tr.destination?' · '+esc(tr.destination):''}</div>
      ${tr.notes?`<p class="plan-stop__notes">${esc(tr.notes)}</p>`:''}
      <div class="plan-progress">
        <div class="plan-progress__track"><span class="plan-progress__fill" style="width:${pct}%"></span></div>
        <span class="plan-progress__text">${doneCount} / ${items.length} erledigt</span>
      </div>
    </section>
    ${grouped.length ? grouped.map(day => {
      const first = day.items[0] || {};
      return `<section class="plan-day">
        <header class="plan-day__head">
          <div class="plan-day__date">${esc(day.heading)}</div>
          ${first.dayTitle?`<div class="plan-day__title">${esc(first.dayTitle)}</div>`:''}
          ${first.dayIntro?`<p class="plan-day__intro">${esc(first.dayIntro)}</p>`:''}
        </header>
        <div class="plan-stops">${day.items.map(item => {
          const done = itineraryItemDone(tr,item);
          const past = !!item.date && item.date < todayKey;
          return `<article class="plan-stop${done?' is-done':''}">
            <button class="kal-haken${done?' is-an':''}" type="button" data-plan-stop="${esc(item.id||'')}"
              aria-pressed="${done}" aria-label="${done?'Wieder öffnen':'Als erledigt markieren'}"></button>
            <div class="plan-stop__body">
              <div class="plan-stop__top">
                ${item.timeLabel||item.time?`<span class="plan-stop__time">${esc(item.timeLabel||item.time)}</span>`:''}
                <span class="plan-stop__title">${esc(item.title||'Programmpunkt')}</span>
                ${item.tag?`<span class="prog-tag">${esc(item.tag)}</span>`:''}
                ${past&&!done?'<span class="plan-past">Vorbei</span>':''}
              </div>
              ${item.notes?`<div class="plan-stop__notes">${esc(item.notes)}</div>`:''}
              ${item.transport?`<div class="plan-stop__transport">${esc(item.transport)}</div>`:''}
            </div>
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('') : '<p class="empty-hint">Aus der HTML konnten noch keine Programmpunkte erkannt werden.</p>'}
  </div>`;
  $('viewerPlan').querySelectorAll('[data-plan-stop]').forEach(button => button.onclick = () => {
    const item = (tr.itinerary||[]).find(entry=>entry.id===button.dataset.planStop);
    if (item) toggleItineraryItem(tr,item);
  });
}

/* Eingelesenes HTML wird zum eigenen, geteilten Programm oben; das
   bereinigte Original bleibt als zweite Ansicht erreichbar. */
function openPlan(tr) {
  if (!(tr.itinerary||[]).length) {
    openViewer(tr.name,tr.planHtml,tr.planUrl);
    return;
  }
  openPlanTripId = tr.id;
  $('viewerTitle').textContent=tr.name||'Programm';
  const frame=$('viewerFrame'), plan=$('viewerPlan'), mode=$('viewerMode');
  frame.hidden=true; frame.removeAttribute('src'); frame.removeAttribute('srcdoc');
  plan.hidden=false;
  renderPlanViewer(tr);
  if(tr.planHtml||tr.planUrl){
    mode.hidden=false;
    mode.textContent='Original ansehen';
    mode.onclick=()=>openViewer(tr.name,tr.planHtml,tr.planUrl,tr);
  } else {
    mode.hidden=true;
    mode.onclick=null;
  }
  $('viewer').classList.add('visible');
}

function openViewer(title,html,url,returnTrip=null){
  $('viewerTitle').textContent=title||'Info';
  const f=$('viewerFrame'),plan=$('viewerPlan'),mode=$('viewerMode');
  plan.hidden=true; f.hidden=false;
  const safeUrl=safeExternalUrl(url);
  if(safeUrl){
    f.setAttribute('sandbox','allow-scripts allow-forms allow-popups');
    f.removeAttribute('srcdoc'); f.src=safeUrl;
  }
  else {
    f.setAttribute('sandbox','allow-popups');
    f.removeAttribute('src');
    const safeHtml = safePlanHtml(html) || '<p style="font-family:sans-serif;padding:24px">Keine Infos.</p>';
    f.srcdoc = safeHtml;
  }
  if(returnTrip){
    mode.hidden=false;
    mode.textContent='Programm';
    mode.onclick=()=>openPlan(returnTrip);
  } else {
    mode.hidden=true;
    mode.onclick=null;
  }
  $('viewer').classList.add('visible');
}
function closeViewer(){
  $('viewer').classList.remove('visible');
  const f=$('viewerFrame');
  f.removeAttribute('src'); f.removeAttribute('srcdoc'); f.hidden=true;
  $('viewerPlan').hidden=true;
  $('viewerMode').hidden=true;
  $('viewerMode').onclick=null;
  openPlanTripId=null;
}

/* ── ICS: der Abgleich, der mit jedem Kalender geht ── */
function icsHerunterladen(body, name) {
  const blob = new Blob([body], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${String(name||'kalender').replace(/[^\w.-]+/g,'-')}.ics`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* Bis v.35.48.0 rief das .ics der Reise downloadIcs() — eine Funktion,
   die es nicht gab (Falle 9). Der Knopf warf und tat nichts. */
function downloadIcs(liste, name) {
  const events = liste.map(item => ({ ...item, title:item.name, location:item.destination }));
  icsHerunterladen(buildCalendarIcs({ events, reminders:[], calendarName:name }), name);
}
function exportAllIcs() {
  const events = [
    ...trips.map(item => ({ ...item, title:item.name, location:item.destination })),
    ...(showPersonal ? days : []).map(item => ({ ...item, startDate:item.date, description:item.notes })),
  ];
  icsHerunterladen(buildCalendarIcs({
    events,
    reminders:showPersonal ? reminders : [],
    calendarName:'Firn · Sichtbare Kalender',
  }), 'tvza-kalender');
  $('calendarSyncStatus').textContent = tt('kal.exportiert','Der Kalender wurde exportiert.');
}
async function importCalendarFile(file) {
  const status = $('calendarSyncStatus');
  status.textContent = tt('kal.importiertGerade','Kalender wird importiert…');
  try {
    const parsed = parseCalendarIcs(await file.text());
    if (!parsed.events.length && !parsed.reminders.length) {
      status.textContent = tt('kal.nichtsGefunden','In dieser Datei wurden keine Termine oder Erinnerungen gefunden.');
      return;
    }
    const knownEvents = new Map(days.filter(item => item.externalUid).map(item => [item.externalUid, item]));
    const knownReminders = new Map(reminders.filter(item => item.externalUid).map(item => [item.externalUid, item]));
    for (const event of parsed.events) {
      const data = {
        ownerUid:user.uid,
        title:event.title,
        date:event.startDate,
        endDate:event.endDate,
        startTime:event.startTime,
        endTime:event.endTime,
        location:event.location,
        notes:event.description,
        source:'ics',
        externalUid:event.uid || '',
        updatedAt:serverTimestamp()
      };
      const existing = event.uid ? knownEvents.get(event.uid) : null;
      if (existing) await updateDoc(doc(db, 'calendarDays', existing.id), data);
      else await addDoc(collection(db, 'calendarDays'), { ...data, createdAt:serverTimestamp() });
    }
    for (const reminder of parsed.reminders) {
      const data = {
        title:reminder.title,
        date:reminder.date,
        time:reminder.time,
        notes:reminder.notes,
        completed:reminder.completed,
        source:'ics',
        externalUid:reminder.uid || '',
        updatedAt:serverTimestamp()
      };
      const existing = reminder.uid ? knownReminders.get(reminder.uid) : null;
      if (existing) await updateDoc(doc(reminderCollection(), existing.id), data);
      else await addDoc(reminderCollection(), { ...data, createdAt:serverTimestamp() });
    }
    await reload();
    status.textContent = tt('kal.importiert','{n} Termine und {m} Erinnerungen importiert.', { n:parsed.events.length, m:parsed.reminders.length });
  } catch {
    status.textContent = tt('kal.icsFehler','Die Kalenderdatei konnte nicht gelesen werden.');
  } finally {
    $('calendarImportFile').value = '';
  }
}

/* ── Ansicht wechseln und verdrahten ── */
function setView(view) {
  curView = passendeAnsicht(view);
  if (curView === 'agenda') agendaShouldFocusToday = true;
  if (isMobileCalendar()) {
    try { localStorage.setItem(mobileViewKey(), curView); } catch {}
  } else {
    calendarPreference.view = curView;
  }
  saveCalendarPreference();
  renderCurrentView();
}

function wireUI(){
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.onclick = () => setView(button.dataset.calendarView));
  $('prevBtn').onclick=()=>{ agendaShouldFocusToday=false; anchorKey=moveCalendarAnchor(anchorKey,curView,-1); if (curView==='agenda') buehne().scrollTop=0; renderCurrentView(); };
  $('nextBtn').onclick=()=>{ agendaShouldFocusToday=false; anchorKey=moveCalendarAnchor(anchorKey,curView,1); if (curView==='agenda') buehne().scrollTop=0; renderCurrentView(); };
  $('todayBtn').onclick=()=>{ agendaShouldFocusToday=true; anchorKey=isoTag(); renderCurrentView(); };
  $('calendarSettingsBtn').onclick=openCalendarSetup;
  $('calendarSetupClose').onclick=closeCalendarSetup;
  $('calendarSetupBackdrop').onclick=closeCalendarSetup;
  $('manageGroupsBtn').onclick=zurGruppenseite;
  $('settingsGroupsBtn').onclick=zurGruppenseite;
  $('createBackdrop').onclick=closeCreateSheet;
  $('createSheetClose').onclick=closeCreateSheet;
  $('createEventOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); sheetKey=tag; openDayForm(null); };
  $('createGroupEventOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); gruppenterminAnlegen(tag); };
  $('createTripOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); sheetKey=tag; openTripForm(null); };
  $('createReminderOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); openReminderForm(null,tag); };
  $('mobileRemindersBtn').onclick=openReminderHub;
  $('reminderHubBackdrop').onclick=closeReminderHub;
  $('reminderHubClose').onclick=closeReminderHub;
  $('reminderHubAdd').onclick=()=>{ closeReminderHub(); openReminderForm(null,todayKey); };
  $('mobileCalAddBtn').onclick=()=>openCreateSheet();
  $('addTripBtn').onclick=()=>openCreateSheet();
  $('addReminderBtn').onclick=()=>openReminderForm(null,todayKey);
  $('calendarImportBtn').onclick=()=>$('calendarImportFile').click();
  $('calendarImportFile').onchange=e=>{ const file=e.target.files?.[0]; if(file)importCalendarFile(file); };
  $('calendarExportBtn').onclick=exportAllIcs;
  $('tripBackdrop').onclick=closeTripForm; $('tripFormClose').onclick=closeTripForm;
  $('reminderBackdrop').onclick=closeReminderForm; $('reminderFormClose').onclick=closeReminderForm;
  $('dayFormBackdrop').onclick=closeDayForm; $('dayFormClose').onclick=closeDayForm; $('viewerClose').onclick=closeViewer;

  document.querySelectorAll('#tpTabs .tab').forEach(t=>t.onclick=()=>setTripPlanPane(t.dataset.tpane));
  $('tpDrop').onclick=()=>$('tpFile').click();
  $('tpFile').onchange = e => {
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      newTripFileHtml=String(r.result||'');
      $('tpChosen').textContent=f.name;
      $('tpChosen').hidden=false;
      describePlanHtml(newTripFileHtml);
    };
    r.readAsText(f);
  };
  $('tpHtml').addEventListener('input',()=>describePlanHtml($('tpHtml').value));
  $('tripFormDelete').onclick = async () => {
    if (!editTripId) return;
    if (!confirm('Diesen Termin löschen?')) return;
    try {
      await tripLoeschen(editTripId);
      closeTripForm();
      backToGroup();
    } catch(e) { reportClientError('calendar-trip-delete', e); alert('Löschen fehlgeschlagen.'); }
  };
  $('tripSave').onclick = async () => {
    const name=$('tName').value.trim(); if(!name){alert('Bitte einen Titel eingeben.');return;}
    const start=$('tStart').value;
    if(!start){alert('Bitte ein Datum auswählen.');return;}
    // "Bis" ist freiwillig — ohne Ende ist der Termin eintägig.
    const startTime=$('tStartTime').value, endTime=$('tEndTime').value;
    const data={ name, destination:$('tDest').value.trim(), startDate:start, endDate:$('tEnd').value||start,
      startTime, endTime:endTime||startTime, notes:$('tNotes').value.trim(),
      familyId:$('tGroup').value };
    if (!data.familyId) { alert('Bitte einen Kalender auswählen.'); return; }
    // Dasselbe Einlesen wie im Detail der Reise.
    const activePane = document.querySelector('#tpTabs .tab.active')?.dataset.tpane || 'paste';
    let planHtml='', planUrl='';
    if (activePane==='upload' && newTripFileHtml) planHtml = newTripFileHtml;
    else if (activePane==='url') planUrl = $('tpUrl').value.trim();
    else planHtml = $('tpHtml').value.trim();
    data.planHtml = planHtml; data.planUrl = planUrl;
    let itinerary = editTripId ? editTripItinerary : [];
    if (planHtml) {
      const { items } = parseItineraryHtml(planHtml, { baseDate: data.startDate });
      if (items.length) {
        const manual = itinerary.filter(it => !it.autoImported);
        itinerary = [...manual, ...items];
      }
    }
    data.itinerary = itinerary;
    $('tripSave').disabled=true;
    try{
      let id = editTripId;
      if(editTripId) await updateDoc(doc(db,'trips',editTripId), data);
      else { const ref = await addDoc(collection(db,'trips'), { ...data, createdBy:user.uid, createdAt:serverTimestamp() }); id = ref.id; }
      closeTripForm();
      await openTrip(id);
    }catch(e){reportClientError('calendar-trip-save',e);alert('Speichern fehlgeschlagen.');}
    $('tripSave').disabled=false;
  };

  $('dayFormSave').onclick = async () => {
    const title=$('dTitle').value.trim(), date=$('dDate').value;
    if(!title){alert('Bitte einen Titel eingeben.');return;} if(!date){alert('Bitte ein Datum wählen.');return;}
    const endDate = $('dEndDate').value && $('dEndDate').value > date ? $('dEndDate').value : '';
    let planHtml='',planUrl='';
    if(dayPane==='upload'&&dayUploadHtml)planHtml=dayUploadHtml; else if(dayPane==='url')planUrl=$('dUrl').value.trim(); else planHtml=$('dHtml').value.trim();
    const data={
      ownerUid:user.uid,
      title,
      date,
      endDate,
      startTime:$('dStartTime').value,
      endTime:$('dEndTime').value,
      location:$('dLocation').value.trim(),
      notes:$('dNotes').value.trim(),
      planHtml,
      planUrl
    };
    $('dayFormSave').disabled=true;
    try{
      let id=editDayId;
      if(id) await updateDoc(doc(db,'calendarDays',id),data);
      else { data.createdAt=serverTimestamp(); const r=await addDoc(collection(db,'calendarDays'),data); id=r.id; }
      if(pendingDayFiles.length){ const tmp=[]; await uploadFiles(id,'day',pendingDayFiles,tmp); }
      agendaShouldFocusToday = false;
      await reload(); closeDayForm();
    }catch(e){reportClientError('calendar-day-save',e);alert('Speichern fehlgeschlagen.');}
    $('dayFormSave').disabled=false;
  };
  $('dayFormDelete').onclick = async () => { if(!editDayId)return; if(!confirm('Termin löschen?'))return;
    const fq=await loadAttachments(editDayId); await Promise.all(fq.map(f=>delAttachment(f.id).catch(()=>{})));
    await deleteDoc(doc(db,'calendarDays',editDayId)); agendaShouldFocusToday = false; await reload(); closeDayForm(); };
  $('dFileDrop').onclick=()=>$('dFiles').click();
  $('dFiles').onchange=e=>{ pendingDayFiles=[...e.target.files]; bindDayFiles(); };
  $('dHtmlFile').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{dayUploadHtml=String(r.result||'');$('dHtmlChosen').textContent=f.name;$('dHtmlChosen').hidden=false;}; r.readAsText(f); };
  document.querySelectorAll('#dayForm .tab').forEach(t=>t.onclick=()=>setDayPane(t.dataset.pane));
  $('dDrop').onclick=()=>$('dHtmlFile').click();

  $('reminderSave').onclick = async () => {
    const title = $('rTitle').value.trim();
    const date = $('rDate').value;
    if (!title) { alert('Bitte einen Titel eingeben.'); return; }
    if (!date) { alert('Bitte ein Datum wählen.'); return; }
    const existing = reminders.find(item => item.id === editReminderId);
    const data = { title, date, time:$('rTime').value, notes:$('rNotes').value.trim(), completed:existing?.completed === true, updatedAt:serverTimestamp() };
    $('reminderSave').disabled = true;
    try {
      if (editReminderId) await updateDoc(doc(reminderCollection(), editReminderId), data);
      else await addDoc(reminderCollection(), { ...data, createdAt:serverTimestamp() });
      closeReminderForm();
    } catch {
      alert('Erinnerung konnte nicht gespeichert werden.');
    } finally {
      $('reminderSave').disabled = false;
    }
  };
  $('reminderComplete').onclick = async () => {
    const existing = reminders.find(item => item.id === editReminderId);
    if (!existing) return;
    $('reminderComplete').disabled = true;
    const updated = await setReminderCompletion(existing, !existing.completed);
    $('reminderComplete').disabled = false;
    if (updated) closeReminderForm();
  };
  $('reminderDelete').onclick = async () => {
    if (!editReminderId || !confirm('Diese Erinnerung löschen?')) return;
    try {
      await deleteDoc(doc(reminderCollection(), editReminderId));
      closeReminderForm();
    } catch {
      alert('Erinnerung konnte nicht gelöscht werden.');
    }
  };

  /* Die Bühne: EIN Zuhörer für alle Ansichten (ansicht.js). */
  verdrahten(buehne(), {
    aktuell:() => aktuelleEintraege,
    stundeHoehe,
    beiEintrag:oeffne,
    beiErledigt:eintrag => setReminderCompletion(eintrag.ref, !eintrag.ref.completed),
    beiStop:(eintrag, stop) => toggleItineraryItem(eintrag.ref, stop),
    beiProgramm:eintrag => openPlan(eintrag.ref),
    beiNeu:tag => openCreateSheet(tag),
    beiTag:tag => {
      anchorKey = tag;
      agendaShouldFocusToday = false;
      /* Am Handy wählt ein Tag im Monat den Tag (seine Einträge stehen
         darunter); sonst öffnet er die Tagesansicht. */
      if (curView === 'month' && isMobileCalendar()) renderCurrentView();
      else setView('day');
    },
    beiSlot:(tag, zeit) => {
      sheetKey = tag;
      openDayForm(null);
      const [h, m] = zeit.split(':').map(Number);
      const ende = Math.min(23 * 60 + 59, h * 60 + m + 60);
      $('dStartTime').value = zeit;
      $('dEndTime').value = `${pad(Math.floor(ende / 60))}:${pad(ende % 60)}`;
    },
  });
  buehne().addEventListener('scroll', () => titelNachScroll(buehne()), { passive:true });

  /* Wechselt das Gerät die Grösse (Handy quer, Fenster schmal), passt
     die Ansicht mit — eine Woche am schmalen Rand ist nicht lesbar. */
  matchMedia('(max-width:899px)').addEventListener('change', () => {
    let gemerkt = '';
    if (isMobileCalendar()) { try { gemerkt = localStorage.getItem(mobileViewKey()) || ''; } catch {} }
    curView = passendeAnsicht(isMobileCalendar() ? gemerkt || curView : calendarPreference.view || curView);
    agendaShouldFocusToday = curView === 'agenda';
    renderCurrentView();
  });

  document.addEventListener('keydown',e=>{ if(e.key!=='Escape')return;
    if($('viewer').classList.contains('visible'))closeViewer();
    else if($('reminderHubSheet').classList.contains('visible'))closeReminderHub();
    else if($('createSheet').classList.contains('visible'))closeCreateSheet();
    else if($('calendarSetupSheet').classList.contains('visible'))closeCalendarSetup();
    else if($('reminderSheet').classList.contains('visible'))closeReminderForm();
    else if($('dayForm').classList.contains('visible'))closeDayForm();
    else if($('tripSheet').classList.contains('visible'))closeTripForm(); });
}
