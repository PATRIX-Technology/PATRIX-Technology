import { describe, expect, it } from 'vitest';
import { sanitizeSignUpErrorMessage } from '@/lib/domain/auth-errors';

describe('sanitizeSignUpErrorMessage', () => {
  it('replaces an "already registered" message with a generic one', () => {
    const result = sanitizeSignUpErrorMessage('User already registered');
    expect(result).not.toMatch(/already registered/i);
    expect(result.length).toBeGreaterThan(0);
  });

  it('replaces variants mentioning "already exists" or "already in use"', () => {
    expect(sanitizeSignUpErrorMessage('A user with this email already exists')).not.toMatch(/already exists/i);
    expect(sanitizeSignUpErrorMessage('Email already in use')).not.toMatch(/already in use/i);
  });

  it('passes through an unrelated error message unchanged', () => {
    expect(sanitizeSignUpErrorMessage('Password should be at least 6 characters')).toBe(
      'Password should be at least 6 characters',
    );
  });
});
