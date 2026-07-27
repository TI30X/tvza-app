import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

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

test('calendar colors belong to calendars and group management has real controls', async () => {
  const planner = await read('pages/planner.html');
  assert.match(planner, /calendarColor:color/);
  assert.match(planner, /function renameGroup\(\)/);
  assert.match(planner, /function toggleGroupManager\(uid\)/);
  assert.match(planner, /function transferGroupHead\(uid,name\)/);
  assert.match(planner, /function removeGroupMember\(uid,name\)/);
  assert.doesNotMatch(planner, /id="tSwatch"|id="dSwatch"/);
});

test('desktop planner sheets are centered and Outlook has a week-selecting mini calendar', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/calendar.css'),
  ]);
  assert.match(planner, /id="miniCalendars"/);
  assert.match(planner, /data-mini-week/);
  assert.match(css, /\.planner-page \.sheet \{[^}]*top:50%/s);
  assert.match(css, /transform:translate\(-50%,-50%\)/);
});

test('calendar actions use aligned icons and compact calendars remain readable', async () => {
  const [planner, css, sharedCss] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/calendar.css'),
    read('assets/css/style.css'),
  ]);
  assert.doesNotMatch(planner, />\+\s*(?:Neuer Termin|Erinnerung|Termin|Gruppe)/);
  assert.match(planner, /class="ui-plus calendar-action-icon/);
  assert.match(sharedCss, /\.calendar-action-icon::before,[\s\S]*top:\s*50%;[\s\S]*left:\s*50%/);
  assert.match(css, /\.mini-calendar-day,[\s\S]*font-size:12px/);
  assert.match(css, /\.calendar-month \.evchip \{[\s\S]*font-size:12px/);
});

test('group people use consistent initial avatars in lists and requests', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/calendar.css'),
  ]);

  assert.match(planner, /function personInitials\(name\)/);
  assert.match(planner, /function personAvatar\(name, uid/);
  assert.match(planner, /group-avatar-stack/);
  assert.match(planner, /group-request-copy/);
  assert.match(css, /--person-bg/);
  assert.match(css, /\.group-member-avatar--stacked/);
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
    read('assets/css/calendar.css'),
  ]);

  assert.match(planner, /const isMobileCalendar = \(\) => matchMedia\('\(max-width:899px\)'\)\.matches/);
  assert.match(planner, /isMobileCalendar\(\)[\s\S]*mobileView[\s\S]*'agenda'/);
  assert.match(planner, /data-calendar-view="agenda"[^>]*>Liste</);
  assert.match(planner, /data-agenda-focus/);
  assert.match(planner, /scroller\.scrollTo\(\{ top:Math\.max\(0,top\)/);
  assert.match(css, /\.calendar-agenda \{[\s\S]*overflow-y:auto/);
});

test('mobile creation and reminders stay above long calendar content', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/calendar.css'),
  ]);

  assert.match(planner, /id="createEventOption"/);
  assert.match(planner, /id="createReminderOption"/);
  assert.match(planner, /id="mobileReminderSummary"/);
  assert.match(planner, /id="reminderHubList"/);
  assert.match(planner, /\$\('calendarBelow'\)\.style\.display='none'/);
  assert.match(css, /\.mobile-reminder-summary \{[\s\S]*display:none/);
  assert.match(css, /#reminderSection \{ display:none; \}/);
});

test('mobile month uses only required weeks and wraps event labels', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/calendar.css'),
  ]);

  assert.match(planner, /const totalCells = Math\.ceil\(\(offset \+ dim\) \/ 7\) \* 7/);
  assert.match(planner, /for\(let i=0;i<totalCells;i\+\+\)/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /\.calendar-month \.cell\.has-events/);
});
