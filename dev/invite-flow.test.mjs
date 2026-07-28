import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

test('invite codes contain 128 bits from Web Crypto', async () => {
  const index = await read('index.html');
  assert.match(index, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(index, /padStart\(2, '0'\)/);
});

test('invite creation selects a managed family and queues a templated email', async () => {
  const [index, rules] = await Promise.all([
    read('index.html'),
    read('firestore.rules'),
  ]);
  assert.match(index, /id="memberInviteFamily"/);
  assert.match(index, /where\('members', 'array-contains', user\.uid\)/);
  assert.match(index, /familyId,/);
  assert.match(index, /doc\(db, 'mail', `member-invite-\$\{code\}`\)/);
  assert.match(index, /name: 'member-invite'/);
  assert.match(rules, /match \/mail\/\{mailId\}/);
  assert.match(rules, /template\.name == 'member-invite'/);
});

test('linked registration atomically joins the family and consumes the code', async () => {
  const [login, rules] = await Promise.all([
    read('login.html'),
    read('firestore.rules'),
  ]);
  assert.match(login, /const batch = writeBatch\(db\)/);
  assert.match(login, /members: arrayUnion\(cred\.user\.uid\)/);
  assert.match(login, /batch\.delete\(inviteRef\)/);
  assert.match(rules, /function invitedAutoJoin\(familyId\)/);
  assert.match(rules, /function consumesInvite\(code\)/);
});

test('invite query parameter opens registration and fills the code', async () => {
  const login = await read('login.html');
  assert.match(login, /params\.get\('invite'\)/);
  assert.match(login, /setMode\('register'\)/);
  assert.match(login, /\$\('fInvite'\)\.value = inviteParam/);
});
