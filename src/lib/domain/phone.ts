import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export type { CountryCode };

/**
 * Normalizes a phone number to E.164 (e.g. +971501234567) for Supabase's
 * phone auth. Accepts either an already-international number (a leading
 * '+', country auto-detected — this is how the phone auth forms actually
 * call it, since the country picker already resolved the number to E.164
 * client-side before submitting) or a local/national number plus an
 * explicit `defaultCountry` to interpret it against. Returns null for
 * anything libphonenumber-js can't validate as a real number for that
 * country, rather than sending a doomed SMS to a malformed number.
 */
export function normalizePhoneNumber(input: string, defaultCountry?: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export interface PhoneCountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

/**
 * Every country libphonenumber-js knows a numbering plan for, with a
 * locale-appropriate display name (Intl.DisplayNames — built into the
 * JS runtime, no extra dataset dependency needed) and dial code, sorted
 * by name for a usable dropdown. Used by CountryPhoneField
 * (src/components/auth/CountryPhoneField.tsx); not cached across calls
 * since it's cheap (245 entries) and only ever built once per form
 * render, not per keystroke.
 */
export function getPhoneCountryOptions(locale: string): PhoneCountryOption[] {
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  return getCountries()
    .map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
      callingCode: getCountryCallingCode(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
