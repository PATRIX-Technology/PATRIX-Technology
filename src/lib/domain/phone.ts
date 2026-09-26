/**
 * Normalizes a UAE mobile number to E.164 (+9715XXXXXXXX) — the format
 * Supabase's phone auth (and every SMS provider behind it) requires.
 * Accepts the way people actually type a UAE mobile locally (leading 0,
 * no country code, with or without spaces/dashes) as well as already-
 * correct E.164 input, and returns null for anything that isn't a
 * plausible UAE mobile number rather than silently mangling it — a
 * landline area code (02/03/04/06/07/09) or a wrong-length number should
 * fail loudly here, not send an SMS to nowhere and confuse the user with
 * a generic Supabase error later. UAE mobiles are always 9 digits after
 * the +971 country code, starting with 5 (050/052/054/055/056/058).
 */
export function normalizeUaePhone(input: string): string | null {
  const stripped = input.replace(/[\s\-()]/g, '');

  let digitsAfterCountryCode: string;
  if (stripped.startsWith('+971')) {
    digitsAfterCountryCode = stripped.slice(4);
  } else if (stripped.startsWith('971')) {
    digitsAfterCountryCode = stripped.slice(3);
  } else if (stripped.startsWith('05')) {
    digitsAfterCountryCode = stripped.slice(1);
  } else if (stripped.startsWith('5')) {
    digitsAfterCountryCode = stripped;
  } else {
    return null;
  }

  if (!/^5\d{8}$/.test(digitsAfterCountryCode)) return null;

  return `+971${digitsAfterCountryCode}`;
}
