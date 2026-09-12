import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Liest index.html samt ihren Modulen — der Code der Startseite
   liegt seit v.35.11.0 in assets/js/feature/start/. */
const read = leserMitStart(root);

test('calendar discovers every group membership instead of one profile familyId', async () => {
  const planner = await read('pages/planner.html');
  assert.match(planner, /where\('members','array-contains',user\.uid\)/);
  assert.match(planner, /visibleGroupIds/);
  assert.match(planner, /id="tGroup"/);
  assert.doesNotMatch(planner, /async function approve\(uid\)\{[^}]*users/);
});

test('dashboard calendar includes trips from all memberships', async () => {
  const dashboard = await read('index.html');
  assert.match(dashboard, /where\('members','array-contains',uid\)/);
  assert.match(dashboard, /familyIds\.has\(x\.familyId\)/);
});

/* Bis v.35.31.0 stand hier: "group management has real controls" — der
   Test verlangte renameGroup, toggleGroupManager, transferGroupHead und
   removeGroupMember im Kalender. Das war die zweite Gruppenverwaltung
   (families) neben dem Gruppe-Tab. Seit v.35.32.0 gibt es EIN Modell;
   der Test haelt jetzt fest, dass die zweite nicht zurueckkommt. */
test('der Kalender verwaltet keine eigenen Gruppen mehr — das tut der Gruppe-Tab', async () => {
  const planner = await read('pages/planner.html');
  for (const fn of ['renameGroup', 'toggleGroupManager', 'transferGroupHead', 'removeGroupMember',
                    'createGroup', 'joinGroup', 'leaveGroup', 'approve', 'renderGroupCard']) {
    assert.doesNotMatch(planner, new RegExp(`function ${fn}\\(`), `${fn} ist zurueck`);
  }
  assert.doesNotMatch(planner, /(updateDoc|addDoc|setDoc)\(\s*(doc|collection)\(db,\s*'families'/,
    'der Kalender schreibt wieder in families');
  assert.doesNotMatch(planner, /'familyDirectory'/, 'Beitritt per Namenssuche ist zurueck');
  assert.match(planner, /function zurGruppenseite\(\) \{ location\.href = '\.\/gruppe\.html'; \}/);
  assert.match(planner, /\$\('manageGroupsBtn'\)\.onclick=zurGruppenseite/);
  assert.match(planner, /\$\('addGroupBtn'\)\.onclick=zurGruppenseite/);
  /* Eine Farbe je Gruppe, fuer Reisen und Termine dieselbe — und
     dieselbe wie im Gruppenwechsler. */
  assert.match(planner, /gruppenFarben = teamFarben\(groups, GROUP_COLORS\)/);
  assert.doesNotMatch(planner, /id="tSwatch"|id="dSwatch"/);
});

test('desktop planner sheets are centered and Outlook has a week-selecting mini calendar', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.match(planner, /id="miniCalendars"/);
  assert.match(planner, /data-mini-week/);
  assert.match(css, /\.planner-page \.sheet \{[^}]*top:50%/s);
  assert.match(css, /transform:translate\(-50%,-50%\)/);
});

test('calendar actions use aligned icons and compact calendars remain readable', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.doesNotMatch(planner, />\+\s*(?:Neuer Termin|Erinnerung|Termin|Gruppe)/);
  assert.match(planner, /class="ui-plus calendar-action-icon/);
  assert.match(css, /\.calendar-action-icon::before,[\s\S]*top:\s*50%;[\s\S]*left:\s*50%/);
  assert.match(css, /\.mini-calendar-day,[\s\S]*font-size:12px/);
  assert.match(css, /\.calendar-month \.evchip \{[\s\S]*font-size:12px/);
});

/* Hier stand bis v.35.31.0 ein Test auf die Avatare in der Mitglieder-
   liste und den Beitrittsanfragen der Kalendergruppen. Beides gibt es im
   Kalender nicht mehr (die Mitglieder zeigt der Gruppe-Tab). Was bleibt:
   keine toten Reste — kein Markup, keine Helfer, keine Stile. */
test('von der alten Mitgliederliste bleibt nichts zurueck', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.doesNotMatch(planner, /personAvatar|group-avatar-stack|group-request-copy|id="groupManageSheet"|id="groupSheet"/);
  assert.doesNotMatch(css, /\.group-(manage|member|avatar|request)/);
});

test('imported programs stay in TVZA and share completion state live', async () => {
  const planner = await read('pages/planner.html');

  assert.match(planner, /function watchTrips\(\)/);
  assert.match(planner, /onSnapshot\(\s*query\(collection\(db,'trips'\)/);
  assert.match(planner, /\[`itineraryDone\.\$\{item\.id\}`\]:next/);
  assert.match(planner, /function renderPlanViewer\(tr\)/);
  assert.match(planner, /function openPlan\(tr\)/);
  assert.match(planner, /mode\.textContent='Original ansehen'/);
  assert.doesNotMatch(planner, /function openPlanFull\(/);
});

test('mobile calendar starts with the readable list view', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);

  assert.match(planner, /const isMobileCalendar = \(\) => matchMedia\('\(max-width:899px\)'\)\.matches/);
  assert.match(planner, /isMobileCalendar\(\)[\s\S]*mobileView[\s\S]*'agenda'/);
  assert.match(planner, /data-calendar-view="agenda"[^>]*>Liste</);
  assert.match(planner, /data-agenda-focus/);
  assert.match(planner, /tail\.style\.height = `\$\{Math\.max\(0, scroller\.clientHeight - markerRect\.height - 8\)\}px`/);
  assert.match(planner, /adjustedMarkerRect\.top - scrollerRect\.top - 8/);
  assert.match(planner, /scroller\.scrollTop = Math\.max\(0, top\)/);
  assert.match(planner, /dataset\.routeReady = 'false'/);
  assert.match(planner, /dataset\.routeReady = 'true'/);
  assert.match(css, /\.calendar-agenda \{[\s\S]*overflow-y:auto/);
  assert.match(css, /\.calendar-agenda\.is-positioning \{ visibility:hidden; \}/);
});

test('mobile creation and reminders stay above long calendar content', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);

  assert.match(planner, /id="createEventOption"/);
  assert.match(planner, /id="createReminderOption"/);
  assert.match(planner, /id="mobileRemindersBtn"/);
  assert.match(planner, /class="calendar-thumb-actions"/);
  assert.match(planner, /id="mobileCalAddBtn"/);
  assert.match(planner, /class="mobile-reminder-label"[^>]*>Erinnerungen</);
  assert.match(planner, /id="mobileReminderCount"/);
  assert.match(planner, /id="reminderHubList"/);
  assert.match(planner, /id="reminderHubList"[\s\S]*id="reminderHubAdd"/);
  assert.match(planner, /document\.body\.dataset\.calendarView = curView/);
  assert.match(planner, /agenda-today-anchor" data-agenda-focus[\s\S]*agenda-today-marker"><strong>Heute<\/strong>/);
  assert.match(planner, /\$\('calendarBelow'\)\.style\.display='none'/);
  assert.match(css, /\.mobile-reminder-button \{[\s\S]*display:none/);
  assert.match(css, /#calendarBelow \{ display:none; \}/);
  assert.match(css, /data-calendar-view="agenda"[\s\S]*calendar-commandbar__nav \{\s*display:none/);
  assert.match(css, /@media \(max-width:899px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) var\(--calendar-thumb-size\)/);
  assert.match(css, /html\.tvza-content-frame \.calendar-thumb-actions \{\s*bottom:2\.5%/);
  assert.match(css, /body\.planner-page\.has-nav \{[\s\S]*overflow:hidden/);
  assert.match(css, /#groupView \.calendar-stage \{[\s\S]*flex:1;[\s\S]*overflow:hidden/);
  assert.match(css, /\.calendar-agenda \{[\s\S]*height:100%;[\s\S]*overflow-y:auto/);
  assert.match(css, /--calendar-mobile-control:clamp/);
  assert.match(css, /padding-bottom:clamp\(112px, 31vw, 148px\)/);
  assert.match(css, /grid-template-columns:repeat\(11,minmax\(0,1fr\)\) var\(--calendar-mobile-control\)/);
  assert.match(css, /\.calendar-commandbar__settings \{[\s\S]*justify-self:end/);
  assert.match(css, /"title title title title title title title title title title title settings"\s*"today today today views views views views views views \. \. \."/);
  assert.match(css, /data-calendar-workspace="true"] \.main \{\s*overflow:hidden/);
  assert.match(planner, /class="agenda-scroll-tail"/);
  assert.match(css, /\.agenda-scroll-tail \{[\s\S]*52dvh/);
  assert.doesNotMatch(planner, /id="reminderHubSheet">\s*<div class="grip"/);
  assert.doesNotMatch(planner, /id="reminderSheet">\s*<div class="grip"/);
  assert.match(planner, /id="reminderComplete"/);
  assert.match(planner, /setReminderCompletion\(existing, !existing\.completed\)/);
  assert.match(planner, /function reminderListHtml\(\) \{\s*const visible = reminders;/);
  assert.match(planner, /item\.completed = completed;\s*renderReminders\(\);/);
  assert.match(planner, /agenda-completed-badge/);
  assert.match(planner, /function focusAgendaOnToday\(box\)/);
  assert.match(planner, /calendarEntryFocusPending = true, initialGroupsLoaded = false, initialRemindersLoaded = false/);
  assert.match(planner, /function focusCalendarEntryWhenReady\(\)/);
  assert.match(planner, /!initialGroupsLoaded \|\| !initialRemindersLoaded/);
  assert.match(planner, /anchorKey = todayKey;\s*agendaShouldFocusToday = true;\s*renderCurrentView\(\);/);
  assert.doesNotMatch(planner, /if \(!agendaShouldFocusToday \|\| !isMobileCalendar\(\)\) return/);
  assert.match(planner, /class="agenda-today-anchor" data-agenda-focus/);
  assert.doesNotMatch(planner, /class="agenda-today-marker" data-agenda-focus/);
  assert.match(css, /\.agenda-today-anchor \{[\s\S]*height:0/);
  assert.match(css, /@media \(min-width:900px\)[\s\S]*#groupView \.calendar-workspace \{[\s\S]*display:flex;[\s\S]*height:clamp\(600px,calc\(100dvh - 120px\),900px\)/);
  assert.match(css, /@media \(min-width:900px\)[\s\S]*#groupView \.calendar-stage \{[\s\S]*flex:1;[\s\S]*overflow:hidden/);
  assert.match(css, /@media \(min-width:900px\)[\s\S]*#groupView \.calendar-view \{[\s\S]*height:100%;[\s\S]*overflow:auto/);
  assert.match(planner, /const containsToday = from<=todayKey/);
  assert.match(planner, /class="agenda-scroll-head"/);
  assert.match(planner, /class="agenda-scroll-tail"/);
  assert.match(planner, /scroller\.scrollTop = Math\.max\(0, top\)/);
  assert.doesNotMatch(planner, /target\.scrollIntoView/);
  assert.match(planner, /setTimeout\(openReminderHub, 100\)/);
  assert.match(css, /\.planner-page \.reminder-hub-sheet \{[\s\S]*overflow:hidden;[\s\S]*display:flex/);
  assert.match(css, /\.planner-page \.reminder-hub-sheet \{[\s\S]*bottom:var\(--tvza-shell-bottom/);
  assert.match(css, /\.planner-page #reminderHubBackdrop \{[\s\S]*bottom:var\(--tvza-shell-bottom/);
  assert.match(css, /html\.tvza-content-frame \.planner-page #reminderHubBackdrop \{ bottom:0; \}/);
  assert.match(css, /\.reminder-hub-sheet \.reminder-hub-list \{[\s\S]*overflow-y:auto/);
  assert.match(css, /\.reminder-hub-add \{[\s\S]*border-radius:var\(--r-pill\)/);
  assert.match(css, /\.reminder-hub-sheet \.reminder-row__title \{[\s\S]*font-weight:800/);
  assert.match(css, /\.planner-page \.reminder-form-sheet \{[\s\S]*overflow-y:auto/);
  assert.match(planner, /requestedAction === 'reminder-new'/);
});

test('mobile month uses only required weeks and wraps event labels', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);

  assert.match(planner, /const totalCells = Math\.ceil\(\(offset \+ dim\) \/ 7\) \* 7/);
  assert.match(planner, /for\(let i=0;i<totalCells;i\+\+\)/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /\.calendar-month \.cell\.has-events/);
});
