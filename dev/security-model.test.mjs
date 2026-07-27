import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

test('membership requires a server-readable user profile', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /function hasProfile\(\)[\s\S]*documents\/users\/\$\(request\.auth\.uid\)/);
  assert.match(rules, /function isMember\(\)[\s\S]*hasProfile\(\) && !isGuest\(\)/);
});

test('family registration requires an invitation code', async () => {
  const [rules, login] = await Promise.all([
    read('firestore.rules'),
    read('login.html'),
  ]);
  assert.match(rules, /inviteIsValid\(request\.resource\.data\)/);
  assert.match(login, /id="fInvite"/);
  assert.match(login, /inviteCode/);
});

test('admin and per-user data are not globally writable', async () => {
  const rules = await read('firestore.rules');
  assert.doesNotMatch(rules, /match \/users\/\{p=\*\*\}[\s\S]{0,80}allow read, write: if isMember/);
  assert.match(rules, /match \/projects\/\{ownerUid\}\/\{p=\*\*\}[\s\S]*request\.auth\.uid == ownerUid/);
});

test('module shares use deterministic ids for rule lookups', async () => {
  const [rules, index] = await Promise.all([
    read('firestore.rules'),
    read('index.html'),
  ]);
  assert.match(rules, /ownerUid \+ '__' \+ targetUid \+ '__' \+ moduleKey/);
  assert.match(index, /const shareId = `\$\{user\.uid\}__\$\{target\.uid\}__\$\{moduleKey\}`/);
});

test('public projects do not expose a password field', async () => {
  const [rules, publicPage] = await Promise.all([
    read('firestore.rules'),
    read('public.html'),
  ]);
  const publicRules = rules.match(/match \/publicProjects\/\{docId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.ok(publicRules);
  assert.doesNotMatch(publicRules, /publicPassword/);
  assert.doesNotMatch(publicPage, /publicPassword|openProtected|pwModal/);
});

test('authentication messages never append backend codes', async () => {
  const pages = await Promise.all([
    read('login.html'),
    read('pages/guest.html'),
  ]);
  for (const page of pages) {
    assert.doesNotMatch(page, /Fehler:\s*['"]?\s*\+/);
    assert.doesNotMatch(page, /user-not-found|wrong-password|invalid-credential/);
  }
});

test('production pages do not expose raw backend errors', async () => {
  const pages = await Promise.all([
    'index.html',
    'pages/planner.html',
    'pages/foodtracker.html',
    'pages/messages.html',
    'pages/weather.html',
    'pages/watchlist.html',
    'pages/maturaarbeit.html',
    'pages/maturaarbeit-tracker.html',
    'assets/js/firebase-config.js',
    'assets/js/matura-sync.js',
    'assets/js/notifications.js',
  ].map(read));
  const visibleBackendError = /(?:alert\s*\(|textContent\s*=|innerHTML\s*=)[^\n]*(?:error|err|e)\.(?:message|code)/i;
  const rawConsoleError = /console\.(?:warn|error)\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?(?:error|err|e)\s*\)/i;
  for (const page of pages) {
    assert.doesNotMatch(page, visibleBackendError);
    assert.doesNotMatch(page, rawConsoleError);
  }
});

test('personal reminders and imported calendar entries stay owner-scoped', async () => {
  const rules = await read('firestore.rules');
  const reminders = rules.match(/match \/users\/\{uid\}\/reminders\/\{reminderId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  const calendarDays = rules.match(/match \/calendarDays\/\{id\} \{([\s\S]*?)\n    \}/)?.[1] || '';

  assert.match(reminders, /request\.auth\.uid == uid/);
  assert.match(calendarDays, /resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(calendarDays, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
  assert.doesNotMatch(calendarDays, /allow read, write: if isMember/);
});

test('calendar group data is scoped to the group, not to the whole family', async () => {
  const rules = await read('firestore.rules');

  for (const name of ['families', 'trips', 'activities', 'attachments']) {
    assert.doesNotMatch(rules, new RegExp(`match /${name}/\\{[^}]+\\}\\s*\\{[^}]*allow read, write: if isMember`));
  }
  assert.match(rules, /function inFamily\(familyId\)[\s\S]*request\.auth\.uid in familyData\(familyId\)\.get\('members', \[\]\)/);

  const trips = rules.match(/match \/trips\/\{tripId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.ok(trips);
  assert.match(trips, /allow list: if inFamily\(resource\.data\.get\('familyId', ''\)\)/);
  assert.match(trips, /allow create: if inFamily\(request\.resource\.data\.get\('familyId', ''\)\)/);

  const activities = rules.match(/match \/activities\/\{id\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  const attachments = rules.match(/match \/attachments\/\{id\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(activities, /canUseTrip/);
  assert.match(attachments, /canUseAttachmentParent/);
});

test('group documents stay unreadable outside the group and names live in a directory', async () => {
  const [rules, planner] = await Promise.all([
    read('firestore.rules'),
    read('pages/planner.html'),
  ]);

  const families = rules.match(/match \/families\/\{id\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.ok(families);
  assert.match(families, /allow get, list: if inFamilyDoc\(\) \|\| managesFamilyDoc\(\)/);
  // Joining by link proves knowledge of the token instead of reading it.
  assert.match(families, /request\.resource\.data\.inviteToken == resource\.data\.inviteToken/);
  assert.match(rules, /match \/familyDirectory\/\{familyId\}/);

  assert.match(planner, /collection\(db,'familyDirectory'\), where\('name','==',name\)/);
  assert.doesNotMatch(planner, /Math\.random\(\)\.toString\(36\)\.slice\(2,10\)/);
});

test('a member cannot slip into a calendar group by editing their own profile', async () => {
  const rules = await read('firestore.rules');
  const users = rules.match(/match \/users\/\{uid\} \{([\s\S]*?)\n      allow delete: if isAdmin\(\);/)?.[1] || '';

  assert.ok(users);
  assert.match(users, /inFamily\(request\.resource\.data\.familyId\)/);
});

test('dashboard loads trips per group instead of the whole collection', async () => {
  const dashboard = await read('index.html');
  assert.doesNotMatch(dashboard, /getDocs\(collection\(db, 'trips'\)\)/);
  assert.match(dashboard, /where\('familyId','==',familyId\)/);
});

test('uploaded calendar HTML cannot run with TVZA origin privileges', async () => {
  const planner = await read('pages/planner.html');
  assert.doesNotMatch(planner, /sandbox="[^"]*allow-same-origin/);
  assert.match(planner, /function safeExternalUrl\(value\)/);
  assert.match(planner, /\['http:','https:'\]\.includes\(parsed\.protocol\)/);
  assert.match(planner, /function safePlanHtml\(html\)/);
  assert.match(planner, /script,iframe,object,embed,form,base/);
  assert.match(planner, /name\.startsWith\('on'\)/);
});

test('visible version and service-worker cache stay aligned', async () => {
  const [ui, sw] = await Promise.all([
    read('assets/js/ui-fx.js'),
    read('sw.js'),
  ]);
  const appVersion = ui.match(/APP_VERSION = "(v\.[^"]+)"/)?.[1];
  const cacheVersion = sw.match(/const CACHE = 'tvza-(v\.[^']+)'/)?.[1];
  assert.equal(cacheVersion, appVersion);
});
