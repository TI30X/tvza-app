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
