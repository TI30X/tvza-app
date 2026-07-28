import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCK_MS,
  clearLoginFailures,
  loginLockRemaining,
  recordLoginFailure,
} from '../assets/js/auth-security.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('five recent login failures trigger a fifteen-minute local lock', () => {
  const storage = memoryStorage();
  const now = 1_000_000;
  for (let index = 0; index < LOGIN_FAILURE_LIMIT; index += 1) {
    recordLoginFailure(storage, now + index);
  }
  assert.equal(loginLockRemaining(storage, now + LOGIN_FAILURE_LIMIT), LOGIN_LOCK_MS - 1);
});

test('successful login clears the local failure state', () => {
  const storage = memoryStorage();
  recordLoginFailure(storage, 1_000);
  clearLoginFailures(storage);
  assert.equal(loginLockRemaining(storage, 1_001), 0);
});
