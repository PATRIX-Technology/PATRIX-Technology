import { describe, expect, it } from 'vitest';
import { normalizeUaePhone } from '@/lib/domain/phone';

describe('normalizeUaePhone', () => {
  it('accepts already-correct E.164 input', () => {
    expect(normalizeUaePhone('+971501234567')).toBe('+971501234567');
  });

  it('accepts E.164 with spaces', () => {
    expect(normalizeUaePhone('+971 50 123 4567')).toBe('+971501234567');
  });

  it('accepts a local number with a leading 0', () => {
    expect(normalizeUaePhone('0501234567')).toBe('+971501234567');
  });

  it('accepts a local number with a leading 0 and dashes', () => {
    expect(normalizeUaePhone('050-123-4567')).toBe('+971501234567');
  });

  it('accepts a bare 9-digit mobile number with no leading 0 or country code', () => {
    expect(normalizeUaePhone('501234567')).toBe('+971501234567');
  });

  it('accepts a country code with no plus sign', () => {
    expect(normalizeUaePhone('971501234567')).toBe('+971501234567');
  });

  it.each(['052', '054', '055', '056', '058'])('accepts every UAE mobile prefix (%s)', (prefix) => {
    const local = `0${prefix.slice(1)}1234567`;
    expect(normalizeUaePhone(local)).toMatch(/^\+971\d{9}$/);
  });

  it('rejects a UAE landline area code (04 Dubai)', () => {
    expect(normalizeUaePhone('0412345678')).toBeNull();
  });

  it('rejects a number that is too short', () => {
    expect(normalizeUaePhone('05012345')).toBeNull();
  });

  it('rejects a number that is too long', () => {
    expect(normalizeUaePhone('050123456789')).toBeNull();
  });

  it('rejects a non-UAE country code', () => {
    expect(normalizeUaePhone('+14155552671')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(normalizeUaePhone('not a phone number')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(normalizeUaePhone('')).toBeNull();
  });
});
