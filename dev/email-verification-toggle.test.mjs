import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_REQUIRE_EMAIL_VERIFICATION,
  emailAccessAllowed,
  requiresVerifiedEmail,
} from '../assets/js/email-verification-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(join(root, relative), 'utf8');

test('beta default permits unverified accounts but true blocks them', () => {
  const unverified = { emailVerified: false };
  assert.equal(DEFAULT_REQUIRE_EMAIL_VERIFICATION, false);
  assert.equal(requiresVerifiedEmail({}), false);
  assert.equal(emailAccessAllowed(unverified, { requireEmailVerification: false }), true);
  assert.equal(emailAccessAllowed(unverified, { requireEmailVerification: true }), false);
  assert.equal(emailAccessAllowed(
    { emailVerified: true },
    { requireEmailVerification: true },
  ), true);
});

test('Firestore and client both use config/tvza enforcement', async () => {
  const [rules, config, login, index] = await Promise.all([
    read('firestore.rules'),
    read('assets/js/firebase-config.js'),
    read('login.html'),
    read('index.html'),
  ]);
  assert.match(rules, /documents\/config\/tvza/);
  assert.match(rules, /requireEmailVerification\(\)/);
  assert.match(rules, /!requireEmailVerification\(\) \|\| emailVerified\(\)/);
  assert.match(config, /getDoc\(doc\(db, 'config', 'tvza'\)\)/);
  assert.match(config, /emailAccessAllowed\(user, tvzaConfig\)/);
  assert.match(login, /sendEmailVerification\(cred\.user/);
  assert.match(login, /tvza-send-verification/);
  assert.match(index, /void sendEmailVerification\(user/);
});
