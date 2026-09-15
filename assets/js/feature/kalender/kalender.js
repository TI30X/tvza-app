/* ══════════════════════════════════════════════════════════════════
   Der Kalender — Daten, Blätter und Verdrahtung.

   Bis v.35.48.0 stand das alles als Inline-Modul in pages/planner.html:
   2500 Zeilen in einer Datei, dazu ein Stilblock von 220 Zeilen. Beim
   Umzug hierher (v.35.49.0) sind die Ansichten neu gebaut worden
   (eintraege.js rechnet, ansicht.js zeichnet); was Daten lädt, Gruppen
   übernimmt und die Blätter (eigener Termin, Erinnerung, ICS) bedient,
   ist umgezogen, nicht umgeschrieben.

   Seit v.35.50.0 gibt es hier keine Reise mehr: Termine und Reisen
   sind EIN Modell (groups/{gid}/events). Ein Termin trägt sein Programm
   (programm.js), bearbeitet wird er im Gruppe-Tab; hier öffnet er sein
   Programm. Abgehakt wird ein Programm nicht — was vorbei ist, blendet
   sich von selbst ab (Michel). Die alten Reisen übernimmt die Leitung
   beim Öffnen (reise-uebernahme.js); bis dahin stehen sie wie früher im
   Kalender, zum Ansehen.

   Was sich für die Leute geändert hat, steht in ansicht.js und
   eintraege.js; hier nur so viel:
   - keine Frage "Google oder Outlook?" mehr beim ersten Öffnen,
   - am Handy: Liste, Tag, 3 Tage, Monat — am Laptop Tag, Woche, Monat,
     Liste; welche Ansicht man zuletzt hatte, merkt sich das Gerät,
   - Erinnerungen hinter der Glocke oben (und am Laptop in der
     Seitenleiste), statt als breiter Knopf über dem Inhalt.
   ══════════════════════════════════════════════════════════════════ */

import { db, requireAuth, wireOfflineBanner, escHtml, getProfile, reportClientError } from '../../firebase-config.js';
import {
  punktVorbei, jetztFuer, abfahrtVon, programmZeigen, programmNeuZeichnen, viewerOffen,
} from '../../programm.js';
import { sollReiseUebernehmen } from '../../reise-uebernahme.js';
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
  eineReiseUebernehmen, ladePlaene, ladeGruppenKalender,
} from '../../groups.js';
import {
  quelleVon, sichtbar, quellenBaum, ausGemerkt, kalenderName, naechsteFarbe, KALENDER_NAME_MAX, KALENDER_MAX,
} from '../../kalender-quellen.js';
import { planEinheiten, einheitZiel } from '../../wochenplan.js';
import { gruppenOptionen } from '../../gruppenwahl.js';
import { teamTerminText, teamFarben } from '../../kalender-teams.js';
import { familieUebernehmen, sollUebernehmen, vereinigeGruppen } from '../../uebernahme.js';
import { frage, waehle, meldung, eingabe } from '../../dialog.js';
import { isoTag, zeitraum, istAbgesagt, alsIcsEintrag, artenFuer, artWort } from '../../termine.js';
import { sammeln, agenda, monatsWochen, zeitRaster } from './eintraege.js';
import {
  agendaHtml, monatHtml, tagesListeHtml, zeitHtml, verdrahten, monatJahr, rasterTitel,
} from './ansicht.js';
/* Die Hülle: Leiste, Router, Konto, Namenskarte. Früher ein zweites
   <script type="module"> in der Seite — die Seiten-Invariante erlaubt
   eins. */
import '../../nav.js?v=23';

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
let allTrips = [], days = [], reminders = [];
let visibleGroupIds = new Set(), showPersonal = true;
/* Teams: gespeichert werden die AUSGESCHALTETEN. Wer einem neuen Team
   beitritt, sieht dessen Termine sofort, statt sie erst suchen und
   einschalten zu muessen. */
let teams = [], teamTermine = new Map(), teamAbos = new Map(), versteckteTeams = new Set();
let teamTrainings = new Map();   // gid -> Einheiten der Pläne (v.35.59.0)
/* Mehrere Kalender (v.35.60.0, kalender-quellen.js): die eigenen, die der
   Gruppen, und welche Quellen ausgeschaltet sind. */
let eigeneKalender = [];         // users/{uid}/kalender
const gruppenKalender = new Map(); // gid -> [{ id, name, farbe }]
let aus = new Set();
/* familien: die alten Kalendergruppen, in denen man steht. groups ist
   die Vereinigung: alle Gruppen, dazu jede Familie, die (noch) keine
   Gruppe ist. Beide Quellen kommen getrennt an; erst wenn beide da
   sind, wird vereinigt. */
let familien = [], teamsGeladen = false, familienGeladen = false, gruppenFarben = new Map();
let anchorKey = todayKey, curView = 'month';
let calendarPreference = normalizeCalendarPreference({});
let editDayId = null, editReminderId = null, dayPane = 'paste', dayUploadHtml = '', sheetKey = null;
let pendingDayFiles = [], dayFiles = [], agendaShouldFocusToday = true;
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
    if (hin) { zurSeite('./gruppe.html'); return; }
  }
  watchGroups();
}

/* Sichtbar ist jede Gruppe, die nicht ausgeschaltet ist. Gemerkt
   werden die AUSGESCHALTETEN — eine neue Gruppe ist sofort zu sehen. */
function loadVisibleSources() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(sourceKey()) || 'null'); } catch {}
  aus = ausGemerkt(saved);
  abgeleitet();
}
/* Aus der einen Menge (aus) folgt, was die alten Stellen fragen: welche
   Gruppen ganz aus sind. Persönliches filtert eintraegeJetzt einzeln. */
function abgeleitet() {
  versteckteTeams = new Set([...aus].filter(s => /^g:[^:]+$/.test(s)).map(s => s.slice(2)));
  showPersonal = true;
  visibleGroupIds = new Set(groups.map(item => item.id).filter(id => !versteckteTeams.has(id)));
}
function saveVisibleSources() {
  try {
    localStorage.setItem(sourceKey(), JSON.stringify({ aus:[...aus], teamsAus:[...versteckteTeams] }));
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
      teamTrainings.delete(gid);
      gruppenKalender.delete(gid);
    }
    for (const gid of ids) {
      if (teamAbos.has(gid)) continue;
      teamAbos.set(gid, beobachteTermine(gid, termine => {
        teamTermine.set(gid, termine);
        renderCurrentView();
        offenesProgrammNeu();
      }));
      trainingsLaden(liste.find(item => item.id === gid));
      gruppenKalenderLaden(gid);
    }
    vereinige();
  });
}

/* Die Einheiten der Trainingspläne (v.35.59.0). Michel: "wenn ich eine
   Excel hochlade … steht am Dienstag Sprungprogramm", aber im Kalender
   stand es nicht. Hier stehen die Pläne für alle und die eigenen — die
   Einzelpläne der anderen Athleten sieht die Leitung in der Gruppe, im
   eigenen Kalender wären es zwanzigmal dieselben Einheiten. Gelesen
   einmal beim Öffnen; eine neue Excel kommt mit dem nächsten Laden. */
async function trainingsLaden(gruppe) {
  if (!gruppe) return;
  try {
    const plaene = await ladePlaene(gruppe.id, user.uid, false);
    const quellen = plaene.map(plan => {
      let programm = null;
      try { programm = JSON.parse(plan.json); } catch { /* kaputter Plan: weglassen */ }
      return programm ? { gid:gruppe.id, gruppe:gruppe.name || '', plan:{ ...plan, json:undefined }, programm } : null;
    }).filter(Boolean);
    teamTrainings.set(gruppe.id, planEinheiten(quellen, isoTag()));
    renderCurrentView();
  } catch (error) {
    reportClientError('kalender-trainings', error);
  }
}

/* Eine Einheit öffnet ihren Player — am geplanten Tag, "Zurück" führt
   in den Kalender. Ohne Blatt ("evtl. Spiel") gibt es nichts zu üben:
   dann eine Karte. Der Player liegt ausserhalb des Routers, darum oben. */
async function zeigeTraining(eintrag) {
  const x = eintrag.ref;
  if (!x.unit || !x.planId) {
    await meldung({ titel:eintrag.titel, text:[zeitraum({ von:eintrag.von, bis:eintrag.bis }), x.slot, x.gruppe].filter(Boolean).join(' · ') });
    return;
  }
  const ziel = new URL(einheitZiel(x.gid, x.planId, x, x.datum, 'kalender'), location.href).href;
  (window.top || window).location.href = ziel;
}
async function zeigeTeamTermin(eintrag) {
  const hin = await frage({
    titel:eintrag.titel,
    /* teamTerminText kennt die Form aus kalender-teams.js: art ist dort
       das Wort ("Training"), nicht die Sorte des Eintrags. */
    text:[
      teamTerminText({ art:eintrag.typ, ref:eintrag.ref, abgesagt:eintrag.abgesagt }),
      abfahrtText(eintrag.ref),
    ].filter(Boolean).join('\n\n'),
    ja:tt('kal.zumTermin','Zum Termin'),
    nein:tt('a11y.schliessen','Schliessen'),
  });
  if (hin) zumTermin(eintrag.ref.gid, eintrag.ref.id);
}
/* Die eigene Abfahrt, wenn die Leitung eine eingetragen hat. */
function abfahrtText(termin) {
  const a = abfahrtVon(termin, user?.uid);
  return a ? `${tt('prog.deineAbfahrt','Deine Abfahrt')}: ${[a.zeit, a.ort].filter(Boolean).join(' · ')}` : '';
}
/* Bearbeitet, zugesagt und gepackt wird ein Termin in seiner Gruppe —
   dorthin führt "Zum Termin", nicht nur auf die Seite. */
function zumTermin(gid, eid) {
  aktiveGruppeSetzen(gid);
  zurSeite(`./gruppe.html?g=${encodeURIComponent(gid)}&termin=${encodeURIComponent(eid)}`);
}
/* Eine Reise, die noch niemand übernommen hat, ohne Programm. */
async function zeigeReise(eintrag) {
  const x = eintrag.ref;
  const zeile = [zeitraum({ von:eintrag.von, bis:eintrag.bis }), x.destination, groupName(x.familyId)]
    .filter(Boolean).join(' · ');
  await meldung({ titel:eintrag.titel, text:[zeile, String(x.notes || '').trim()].filter(Boolean).join('\n\n') });
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

/* Die Quellen (v.35.60.0): am Laptop als Liste in der Seitenleiste — das
   Eigene, dann jede Gruppe mit ihren Kalendern eingerückt darunter —,
   dieselbe Liste im Blatt "Kalender" am Handy, und am Handy oben Knöpfe
   für das Eigene und die Gruppen als Ganzes. */
const ANTIPPEN = 'data-quelle';
function baum() {
  return quellenBaum({
    eigene:eigeneKalender,
    gruppen:groups,
    jeGruppe:gruppenKalender,
    mitPlaenen:new Set([...teamTrainings].filter(([, liste]) => liste.length).map(([gid]) => gid)),
    farbePersoenlich:personalCalendarColor(),
    farbeVon:groupColor,
    arten:art => artenFuer(art || 'kader'),
    artWort:(art, gruppenart) => artWort(art, gruppenart || 'kader'),
    t:tt,
  });
}
function quelleZeile(q, { kind = false, gruppeAus = false } = {}) {
  const an = !aus.has(q.schluessel);
  return `<div class="kal-quelle-zeile${kind ? ' is-kind' : ''}${gruppeAus ? ' is-gedimmt' : ''}">
    <button class="kal-quelle${an ? ' is-an' : ''}" type="button" ${ANTIPPEN}="${esc(q.schluessel)}" aria-pressed="${an}" style="--farbe:${q.farbe}">
      <span class="kal-quelle__punkt"></span><span>${esc(q.name)}</span>
    </button>
    ${q.eigen ? `<button class="kal-quelle__weg" type="button" data-kalender-weg="${esc(q.id)}" aria-label="${esc(tt('kal.kalenderLoeschen', '«{name}» löschen', { name:q.name }))}" title="${esc(tt('kal.kalenderLoeschen', '«{name}» löschen', { name:q.name }))}">×</button>` : ''}
  </div>`;
}
function quellenListe() {
  return baum().map(q => quelleZeile(q) + q.kinder.map(k => quelleZeile(k, { kind:true, gruppeAus:aus.has(q.schluessel) })).join('')).join('')
    + `<button class="kal-link kal-quelle-neu" type="button" data-kalender-neu>+ ${esc(tt('kal.neuerKalender', 'Neuer Kalender'))}</button>`;
}
function renderCalendarSources() {
  const liste = quellenListe();
  $('calendarSources').innerHTML = liste;
  const imBlatt = $('calendarSetupSources');
  if (imBlatt) imBlatt.innerHTML = liste;
  const oben = baum();
  $('calendarMobileSources').innerHTML = oben.length > 1 ? oben.map(q => {
    const an = !aus.has(q.schluessel);
    return `<button class="kal-chip${an ? ' is-an' : ''}" type="button" ${ANTIPPEN}="${esc(q.schluessel)}" aria-pressed="${an}" style="--farbe:${q.farbe}">
      <span class="kal-quelle__punkt"></span>${esc(q.name)}
    </button>`;
  }).join('') : '';
  $('calendarMobileSources').hidden = oben.length <= 1;
}
/* EIN Zuhörer für alle drei Orte: umschalten, anlegen, löschen. */
function quellenVerdrahten() {
  const hier = event => {
    const knopf = event.target.closest(`[${ANTIPPEN}],[data-kalender-neu],[data-kalender-weg]`);
    if (!knopf) return;
    if (knopf.hasAttribute('data-kalender-neu')) { kalenderAnlegen(); return; }
    if (knopf.dataset.kalenderWeg) { kalenderLoeschen(knopf.dataset.kalenderWeg); return; }
    const s = knopf.getAttribute(ANTIPPEN);
    if (aus.has(s)) aus.delete(s); else aus.add(s);
    abgeleitet();
    saveVisibleSources();
    renderCalendarSources();
    renderReminders();
    renderCurrentView();
  };
  for (const id of ['calendarSources', 'calendarMobileSources', 'calendarSetupSources']) $(id)?.addEventListener('click', hier);
}

/* Eigene Kalender (v.35.60.0): "Familie", "Schule" — neben "Persönlich". */
async function eigeneKalenderLaden() {
  try {
    const s = await getDocs(collection(db, 'users', user.uid, 'kalender'));
    eigeneKalender = s.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  } catch (error) {
    reportClientError('kalender-eigene', error);
    eigeneKalender = [];
  }
  kalenderWahlFuellen();
}
async function kalenderAnlegen() {
  if (eigeneKalender.length >= KALENDER_MAX) {
    await meldung({ titel:tt('kal.neuerKalender', 'Neuer Kalender'), text:tt('kal.kalenderGenug', 'Mehr als {n} eigene Kalender gehen nicht.', { n:KALENDER_MAX }) });
    return;
  }
  const roh = await eingabe({
    titel:tt('kal.neuerKalender', 'Neuer Kalender'),
    text:tt('kal.neuerKalenderText', 'Ein eigener Kalender neben «Persönlich», mit eigener Farbe — z.B. für die Familie.'),
    platzhalter:tt('kal.kalenderPh', 'z.B. Familie'),
    maxlength:KALENDER_NAME_MAX,
    ja:tt('kal.anlegen', 'Anlegen'),
  });
  const name = kalenderName(roh);
  if (!name) return;
  const farbe = naechsteFarbe([personalCalendarColor(), ...eigeneKalender.map(k => k.farbe)], GROUP_COLORS);
  try {
    await addDoc(collection(db, 'users', user.uid, 'kalender'), { name, farbe, erstelltAm:serverTimestamp() });
    await eigeneKalenderLaden();
    renderCalendarSources();
  } catch (error) {
    reportClientError('kalender-anlegen', error);
    await meldung({ titel:tt('kal.neuerKalender', 'Neuer Kalender'), text:tt('kal.f.anlegen', 'Der Kalender liess sich nicht anlegen.') });
  }
}
async function kalenderLoeschen(id) {
  const k = eigeneKalender.find(x => x.id === id);
  if (!k) return;
  const ja = await frage({
    titel:tt('kal.kalenderLoeschen', '«{name}» löschen', { name:k.name }),
    text:tt('kal.kalenderLoeschenText', 'Die Termine darin bleiben und stehen danach unter «Persönlich».'),
    ja:tt('common.loeschen', 'Löschen'),
    nein:tt('common.abbrechen', 'Abbrechen'),
    gefahr:true,
  });
  if (!ja) return;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'kalender', id));
    aus.delete(`pk:${id}`);
    saveVisibleSources();
    await eigeneKalenderLaden();
    renderCalendarSources();
    renderCurrentView();
  } catch (error) {
    reportClientError('kalender-loeschen', error);
  }
}
/* Im Formular des eigenen Termins: in welchen Kalender. Ohne eigene
   Kalender gibt es nichts zu wählen — dann fehlt das Feld. */
function kalenderWahlFuellen(wert) {
  const wahl = $('dKalender');
  if (!wahl) return;
  const jetzt = wert ?? wahl.value;
  wahl.innerHTML = [`<option value="">${esc(tt('kal.persoenlich', 'Persönlich'))}</option>`,
    ...eigeneKalender.map(k => `<option value="${esc(k.id)}">${esc(k.name)}</option>`)].join('');
  wahl.value = eigeneKalender.some(k => k.id === jetzt) ? jetzt : '';
  $('grpDKalender').hidden = !eigeneKalender.length;
}

/* Die Kalender, die die Leitung einer Gruppe angelegt hat ("Rennplan"). */
async function gruppenKalenderLaden(gid) {
  try { gruppenKalender.set(gid, await ladeGruppenKalender(gid)); }
  catch (error) { reportClientError('kalender-gruppe', error); gruppenKalender.set(gid, []); }
  renderCalendarSources();
  renderCurrentView();
}

/* Gruppen werden an EINER Stelle angelegt, betreten und verwaltet: im
   Gruppe-Tab. Bis v.35.31.0 hatte der Kalender eine zweite Verwaltung
   fuer seine Kalendergruppen — Mitglieder, Rollen, Beitrittsanfragen,
   Einladungslink, Farbe —, alles doppelt und alles auf families. */
function zurGruppenseite() { zurSeite('./gruppe.html'); }

/* Im Rahmen des Routers über den Router (v.35.53.0): location.href lud
   die Gruppe IN den Rahmen, ohne tvzaFrame — mit zweiter Leiste und
   zweitem Kopf darin. */
function zurSeite(ziel) {
  if (!window.tvzaNavigate?.(new URL(ziel, location.href).href)) location.href = ziel;
}

/* ── Wer darf in eine Gruppe eintragen? ───────────────────────────
   Die Leitung: Kopf und Trainer (v.35.49.0). Mitglieder lesen, sagen zu,
   haken Programmpunkte ab — sie tragen nichts in die Gruppe ein. Bis
   dahin bot der Kalender jedem Mitglied "Gruppentermin" an, für jede
   seiner Gruppen, und die Regel liess es zu. Seit v.35.50.0 gibt es
   daneben keine "Reise" mehr zum Anlegen: eine Reise ist ein Termin der
   Gruppe mit Programm, angelegt im Gruppe-Tab. */
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
  zurSeite(`./gruppe.html?g=${encodeURIComponent(gid)}&neu=${encodeURIComponent(tag)}`);
}
/* Wechselt jemand die aktive Gruppe (Leiste, Gruppe-Tab), wandert der
   "Standard" fuer neue Reisen mit. */
window.addEventListener('firn-gruppe', () => vereinige());

/* ── Daten laden ── */
/* Der Assistent (ki-pille.js, v.35.53.0) trägt im obersten Dokument ein;
   der Kalender steht dann oft geparkt im Rahmen daneben und erfährt es
   über 'storage' — sonst stünde der neue Termin erst nach dem nächsten
   Laden da. */
addEventListener('storage', e => { if (e.key === 'firn.daten' && user) reload().catch(() => {}); });

async function reload() {
  const t1 = Promise.all(groups.map(item =>
    getDocs(query(collection(db,'trips'), where('familyId','==',item.id)))
      .then(snapshot => snapshot.docs.map(entry => ({id:entry.id,...entry.data()})))
      .catch(error => { reportClientError('calendar-trips-load',error); return []; })
  )).then(result => {
    allTrips = result.flat();
  });
  const t2 = getDocs(query(collection(db,'calendarDays'), where('ownerUid','==',user.uid)))
    .then(s=>{ days = s.docs.map(d=>({id:d.id,...d.data()})); })
    .catch(e=>{ reportClientError('calendar-days-load',e); days=[]; })
    .finally(() => { daysLoaded = true; });
  await Promise.all([t1,t2,eigeneKalenderLaden()]);
  renderCalendarSources();
  renderCurrentView();
}

/* Die alten Reisen: sichtbar, solange sie kein Termin sind — nach der
   Übernahme trägt der Termin dieselbe Kennung, und die Marke an der
   Reise folgt einen Augenblick später. Dazwischen stünde sie doppelt. */
function sichtbareReisen() {
  return allTrips.filter(reise => visibleGroupIds.has(reise.familyId)
    && !reise.uebernommen
    && !(teamTermine.get(reise.familyId) || []).some(termin => termin.id === reise.id));
}

/* Wer eine Gruppe leitet, übernimmt ihre Reisen (reise-uebernahme.js). */
function reisenUebernehmen() {
  for (const reise of allTrips) {
    const team = teams.find(g => g.id === reise.familyId);
    if (!sollReiseUebernehmen(reise, { istGruppe:() => !!team, leitet:() => leitet(team?.meineRolle) })) continue;
    eineReiseUebernehmen(reise, user.uid, team.art)
      .catch(error => reportClientError('calendar-reise-uebernahme', error));
  }
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
    renderCurrentView();
    offenesProgrammNeu();
    reisenUebernehmen();
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

/* ══ Zeichnen ══════════════════════════════════════════════════════
   Alle Ansichten aus DERSELBEN Liste von Einträgen (eintraege.js). */

function eintraegeJetzt() {
  const index = {
    eigene:new Set(eigeneKalender.map(k => k.id)),
    jeGruppe:new Map([...gruppenKalender].map(([gid, liste]) => [gid, new Set(liste.map(k => k.id))])),
  };
  const farben = new Map([
    ...eigeneKalender.map(k => [`pk:${k.id}`, k.farbe]),
    ...[...gruppenKalender].flatMap(([gid, liste]) => liste.map(k => [`g:${gid}:k:${k.id}`, k.farbe])),
  ]);
  return sammelnRoh().flatMap(e => {
    const s = quelleVon(e, index);
    if (!sichtbar(s, aus)) return [];
    return [farben.get(s) ? { ...e, farbe:farben.get(s) } : e];
  });
}
function sammelnRoh() {
  return sammeln({
    tage:days,
    erinnerungen:reminders,
    reisen:sichtbareReisen(),
    teams:groups.filter(item => !versteckteTeams.has(item.id))
      .map(gruppe => ({ gruppe, termine:teamTermine.get(gruppe.id) || [], trainings:teamTrainings.get(gruppe.id) || [] })),
    persoenlich:showPersonal,
    farbePersoenlich:personalCalendarColor(),
    farbeVon:groupColor,
    nameVon:groupName,
    persoenlichName:tt('kal.persoenlich','Persönlich'),
  });
}

/* Ein Programmpunkt ist vorbei, wenn seine Zeit vorbei ist — abgehakt
   wird er nicht (v.35.50.0). */
const vorbeiVon = (eintrag, stop) => punktVorbei(stop, jetztFuer(new Date()));
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
  el.innerHTML = `<div class="kal-liste">${agendaHtml(tage, { vorbeiVon })}</div><div class="kal-auslauf" aria-hidden="true"></div>`;
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
    + (kompakt ? `<div class="kal-tagesliste">${tagesListeHtml(anchorKey, liste, { vorbeiVon })}</div>` : '');
  el.scrollTop = 0;
}

const stundeHoehe = () => parseFloat(getComputedStyle(buehne()).getPropertyValue('--kal-stunde')) || 48;
function renderZeit(el, liste) {
  const tage = datesForCalendarView(anchorKey, curView);
  const jetzt = new Date();
  el.innerHTML = zeitHtml(zeitRaster(tage, liste), {
    jetzt:tage.includes(todayKey) ? jetzt.getHours() * 60 + jetzt.getMinutes() : null,
  });
  /* Auf die Stunde stellen, in der etwas passiert: heute zwei Stunden
     vor jetzt, sonst 7 Uhr — nicht auf Mitternacht. */
  const stunde = tage.includes(todayKey) ? Math.max(0, jetzt.getHours() - 2) : 7;
  el.scrollTop = stunde * stundeHoehe();
}

/* Ein Klick auf einen Eintrag öffnet, was zu ihm gehört: einen Termin
   mit Programm dieses Programm (mit "Zum Termin"), einen ohne als Karte
   — bearbeitet wird er in der Gruppe —, die Erinnerung, den eigenen
   Termin. */
function oeffne(eintrag) {
  if (eintrag.art === 'team' || eintrag.art === 'reise') {
    const x = eintrag.ref;
    if (eintrag.stops.length || x.planHtml || x.planUrl) { programmOeffnen(eintrag); return; }
    if (eintrag.art === 'team') zeigeTeamTermin(eintrag); else zeigeReise(eintrag);
    return;
  }
  if (eintrag.art === 'training') { zeigeTraining(eintrag); return; }
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

/* ── Dateien am eigenen Termin ── */
function randToken(){ return Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b=>b.toString(36)).join('').slice(0,16); }

const DATEI_SYMBOL = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const BILD_SYMBOL = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
async function uploadFiles(parentId, scope, list, curFiles){
  for(const file of list){
    const st=await fileToStored(file);
    if(!st){ alert(`„${file.name}" ist zu gross für den Gratis-Speicher (max ~0,9 MB; Bilder werden automatisch verkleinert). Für grosse Dateien nutze den Link-Tab.`); continue; }
    try{ const r=await saveAttachment(parentId,scope,st); curFiles.push({id:r.id,...st}); }
    catch(e){ reportClientError('attachment-save',e); alert('Datei speichern fehlgeschlagen.'); }
  }
}

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
  kalenderWahlFuellen(existing?.kalender || '');
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

/* ── Das Programm eines Eintrags (programm.js) ──
   Dasselbe Blatt wie im Gruppe-Tab. Offen bleibt es über Änderungen
   hinweg: ein Häkchen von jemand anderem erscheint, ohne zu schliessen. */
let offenesProgramm = null;   // die ID des Eintrags, dessen Programm offen ist

function programmOptionenFuer(eintrag) {
  const x = eintrag.ref;
  if (eintrag.art === 'team') {
    return {
      schluessel:eintrag.id,
      eyebrow:x.gruppenName || groupName(x.gid),
      titel:x.titel,
      zeitraum:zeitraum(x),
      ort:x.ort || '',
      notiz:x.notiz || '',
      punkte:x.programm || [],
      abfahrt:abfahrtVon(x, user.uid),
      seite:{ html:x.planHtml || '', url:x.planUrl || '' },
      weiter:{ text:tt('kal.zumTermin','Zum Termin'), beiKlick:() => zumTermin(x.gid, x.id) },
    };
  }
  return {
    schluessel:eintrag.id,
    eyebrow:groupName(x.familyId),
    titel:x.name,
    zeitraum:zeitraum({ von:eintrag.von, bis:eintrag.bis }),
    ort:x.destination || '',
    notiz:x.notes || '',
    punkte:x.itinerary || [],
    seite:{ html:x.planHtml || '', url:x.planUrl || '' },
  };
}
function programmOeffnen(eintrag) {
  offenesProgramm = eintrag.id;
  programmZeigen(programmOptionenFuer(eintrag));
}
function offenesProgrammNeu() {
  if (!offenesProgramm || !viewerOffen()) return;
  const eintrag = aktuelleEintraege.get(offenesProgramm);
  if (eintrag) programmNeuZeichnen(eintrag.id, programmOptionenFuer(eintrag));
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
/* Die sichtbaren Kalender als eine Datei: eigene Termine, Erinnerungen,
   die Termine der eingeschalteten Gruppen (ohne abgesagte) und Reisen,
   die noch keine Termine sind. Bis v.35.49.0 fehlten die Gruppentermine. */
function exportAllIcs() {
  const index = {
    eigene:new Set(eigeneKalender.map(k => k.id)),
    jeGruppe:new Map([...gruppenKalender].map(([gid, liste]) => [gid, new Set(liste.map(k => k.id))])),
  };
  const zu = (art, ref) => sichtbar(quelleVon({ art, ref }, index), aus);
  const events = [
    ...groups.filter(item => !versteckteTeams.has(item.id))
      .flatMap(item => (teamTermine.get(item.id) || [])
        .filter(termin => !istAbgesagt(termin) && zu('team', { ...termin, gid:item.id }))
        .map(termin => alsIcsEintrag(termin, item.id))),
    ...sichtbareReisen().map(item => ({ ...item, title:item.name, location:item.destination })),
    ...days.filter(item => zu('tag', item)).map(item => ({ ...item, startDate:item.date, description:item.notes })),
  ];
  icsHerunterladen(buildCalendarIcs({
    events,
    reminders:aus.has('r') ? [] : reminders,
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
  quellenVerdrahten();
  $('createBackdrop').onclick=closeCreateSheet;
  $('createSheetClose').onclick=closeCreateSheet;
  $('createEventOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); sheetKey=tag; openDayForm(null); };
  $('createGroupEventOption').onclick=()=>{ const tag=neuerTag(); closeCreateSheet(); gruppenterminAnlegen(tag); };
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
  $('reminderBackdrop').onclick=closeReminderForm; $('reminderFormClose').onclick=closeReminderForm;
  $('dayFormBackdrop').onclick=closeDayForm; $('dayFormClose').onclick=closeDayForm;

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
      planUrl,
      kalender:$('dKalender')?.value || ''
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
    beiProgramm:programmOeffnen,
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

  /* Das Programm schliesst sein eigenes Blatt (programm.js). */
  document.addEventListener('keydown',e=>{ if(e.key!=='Escape' || viewerOffen())return;
    if($('reminderHubSheet').classList.contains('visible'))closeReminderHub();
    else if($('createSheet').classList.contains('visible'))closeCreateSheet();
    else if($('calendarSetupSheet').classList.contains('visible'))closeCalendarSetup();
    else if($('reminderSheet').classList.contains('visible'))closeReminderForm();
    else if($('dayForm').classList.contains('visible'))closeDayForm(); });
}
