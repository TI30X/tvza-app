export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

const STORAGE_KEY = 'tvza.login-throttle.v1';

function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return {
      failures: Array.isArray(parsed.failures)
        ? parsed.failures.filter(Number.isFinite)
        : [],
      lockedUntil: Number.isFinite(parsed.lockedUntil) ? parsed.lockedUntil : 0,
    };
  } catch {
    return { failures: [], lockedUntil: 0 };
  }
}

function writeState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Firebase Auth still applies its server-side abuse throttling if local
    // storage is unavailable.
  }
}

export function loginLockRemaining(storage, now = Date.now()) {
  const state = readState(storage);
  if (state.lockedUntil <= now) {
    if (state.lockedUntil) writeState(storage, { failures: [], lockedUntil: 0 });
    return 0;
  }
  return state.lockedUntil - now;
}

export function recordLoginFailure(storage, now = Date.now()) {
  const state = readState(storage);
  const failures = state.failures
    .filter(timestamp => timestamp > now - LOGIN_FAILURE_WINDOW_MS)
    .concat(now);
  const lockedUntil = failures.length >= LOGIN_FAILURE_LIMIT
    ? now + LOGIN_LOCK_MS
    : state.lockedUntil;
  writeState(storage, { failures, lockedUntil });
  return Math.max(0, lockedUntil - now);
}

export function clearLoginFailures(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
