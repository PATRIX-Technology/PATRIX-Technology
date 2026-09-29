/**
 * Supabase Auth's own signUp() error says outright when an email is
 * already registered ("User already registered" / similar wording).
 * Relaying that verbatim is a classic email-enumeration side channel —
 * an attacker submits a list of addresses and learns which ones already
 * have accounts, with no rate limit slowing that down beyond the same
 * per-IP sign-up limiter every other sign-up attempt already hits.
 *
 * Both sign-up paths (org, family — src/lib/actions/auth.ts,
 * src/lib/actions/family.ts) route their signUp() error through this
 * first, matching this app's existing generic-response convention for
 * forgotPasswordAction/sendSignInOtpAction, which already accept the
 * same tradeoff (see their own comments) for exactly this reason.
 */
export function sanitizeSignUpErrorMessage(message: string): string {
  if (/already registered|already exists|already in use/i.test(message)) {
    return 'Something went wrong creating your account. If you already have one, sign in instead — otherwise, double-check your details and try again.';
  }
  return message;
}
