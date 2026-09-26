import { describe, expect, it } from 'vitest';
import { getPhoneCountryOptions, normalizePhoneNumber } from '@/lib/domain/phone';

describe('normalizePhoneNumber', () => {
  it('accepts an already-international UAE number with no country hint needed', () => {
    expect(normalizePhoneNumber('+971501234567')).toBe('+971501234567');
  });

  it('accepts an already-international number with spaces', () => {
    expect(normalizePhoneNumber('+971 50 123 4567')).toBe('+971501234567');
  });

  it('accepts a UAE local number given the country explicitly', () => {
    expect(normalizePhoneNumber('0501234567', 'AE')).toBe('+971501234567');
  });

  it('accepts a US local number given the country explicitly', () => {
    expect(normalizePhoneNumber('4155552671', 'US')).toBe('+14155552671');
  });

  it('accepts a UK local number (leading 0 trunk prefix) given the country explicitly', () => {
    expect(normalizePhoneNumber('07911123456', 'GB')).toBe('+447911123456');
  });

  it('accepts an already-international French number', () => {
    expect(normalizePhoneNumber('+33612345678')).toBe('+33612345678');
  });

  it('accepts an already-international Indian number', () => {
    expect(normalizePhoneNumber('+919876543210')).toBe('+919876543210');
  });

  it('rejects a number that is too short for its country', () => {
    expect(normalizePhoneNumber('123', 'AE')).toBeNull();
  });

  it('rejects a national number with no country hint and no leading +', () => {
    expect(normalizePhoneNumber('501234567')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(normalizePhoneNumber('not a phone number', 'AE')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(normalizePhoneNumber('', 'AE')).toBeNull();
  });
});

describe('getPhoneCountryOptions', () => {
  it('includes every country libphonenumber-js knows, each with a name and calling code', () => {
    const options = getPhoneCountryOptions('en');
    expect(options.length).toBeGreaterThan(200);
    for (const option of options) {
      expect(option.code).toMatch(/^[A-Z]{2}$/);
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.callingCode.length).toBeGreaterThan(0);
    }
  });

  it('resolves UAE, US, and UK to their correct names and calling codes', () => {
    const options = getPhoneCountryOptions('en');
    const byCode = Object.fromEntries(options.map((o) => [o.code, o]));
    expect(byCode.AE).toMatchObject({ name: 'United Arab Emirates', callingCode: '971' });
    expect(byCode.US).toMatchObject({ name: 'United States', callingCode: '1' });
    expect(byCode.GB).toMatchObject({ name: 'United Kingdom', callingCode: '44' });
  });

  it('sorts alphabetically by display name for the given locale', () => {
    const options = getPhoneCountryOptions('en');
    const names = options.map((o) => o.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en'));
    expect(names).toEqual(sorted);
  });

  it('returns Arabic display names when asked for the ar locale', () => {
    const options = getPhoneCountryOptions('ar');
    const uae = options.find((o) => o.code === 'AE');
    expect(uae?.name).toBe('الإمارات العربية المتحدة');
  });
});
