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

test('visible version and service-worker cache stay aligned', async () => {
  const [ui, sw] = await Promise.all([
    read('assets/js/ui-fx.js'),
    read('sw.js'),
  ]);
  const appVersion = ui.match(/APP_VERSION = "(v\.[^"]+)"/)?.[1];
  const cacheVersion = sw.match(/const CACHE = 'tvza-(v\.[^']+)'/)?.[1];
  assert.equal(cacheVersion, appVersion);
});
