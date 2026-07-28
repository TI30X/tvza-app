// Beta default: verification is deliberately optional to reduce testing
// friction. Set config/tvza.requireEmailVerification to true to enforce it.
export const DEFAULT_REQUIRE_EMAIL_VERIFICATION = false;

export function requiresVerifiedEmail(config = {}) {
  return config.requireEmailVerification === true;
}

export function emailAccessAllowed(user, config = {}) {
  return !requiresVerifiedEmail(config) || user?.emailVerified === true;
}
