import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN, validatePassword } from '@/lib/domain/password';

describe('validatePassword', () => {
  it('rejects a password shorter than the minimum length', () => {
    expect(validatePassword('Ab1'.padEnd(PASSWORD_MIN_LENGTH - 1, 'a'))).toMatch(/at least/i);
  });

  it('rejects a password with no letter', () => {
    expect(validatePassword('01234567890')).toMatch(/letter/i);
  });

  it('rejects a password with no number', () => {
    expect(validatePassword('abcdefghijk')).toMatch(/number/i);
  });

  it('accepts a password meeting length + letter + number', () => {
    expect(validatePassword('correcthorse1')).toBeNull();
  });

  it('keeps PASSWORD_PATTERN consistent with validatePassword', () => {
    const regex = new RegExp(`^${PASSWORD_PATTERN}$`);
    expect(regex.test('correcthorse1')).toBe(true);
    expect(regex.test('short1')).toBe(false);
    expect(regex.test('nodigitshere')).toBe(false);
    expect(regex.test('1234567890')).toBe(false);
  });
});
