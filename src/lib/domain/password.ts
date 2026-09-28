/** Shared password rule for every place an account password is set
 * (org sign-up, family sign-up, accepting a staff invite) — previously
 * each of those three server actions duplicated its own bare
 * `password.length < 8` check with no letter/number requirement at all.
 * See docs/DECISIONS.md "Password complexity requirement". */
export const PASSWORD_MIN_LENGTH = 10;

/** HTML5 `pattern` attribute value for client-side hinting only — a
 * fast, no-round-trip nudge before the user even submits. The real,
 * authoritative check is validatePassword() below, run server-side on
 * every path that sets a password; this is never trusted on its own.
 * Lookaheads for "at least one letter" and "at least one digit",
 * minimum length via `{N,}`. */
export const PASSWORD_PATTERN = `(?=.*[A-Za-z])(?=.*\\d).{${PASSWORD_MIN_LENGTH},}`;

/** The matching user-facing hint text lives in the `auth.passwordHint`
 * translation key (interpolating PASSWORD_MIN_LENGTH), not here — every
 * form that shows it is customer-facing and needs the Arabic version
 * too, so it goes through next-intl at each call site rather than being
 * a hardcoded English constant. See docs/DECISIONS.md "Dashboard
 * settings/billing/security/MFA screens translated into Arabic". */

/** Returns a user-facing error message, or null if the password satisfies
 * the rule. Deliberately does not require a specific case or a symbol —
 * length plus a letter/number mix is a real complexity bar without the
 * "must contain !@#$" pattern that mostly just pushes people toward
 * "Password1!" and a sticky note. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'Password must include at least one letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  return null;
}
