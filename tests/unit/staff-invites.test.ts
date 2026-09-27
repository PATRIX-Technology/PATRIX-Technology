import { describe, expect, it } from 'vitest';
import { buildStaffInviteUrl, generateStaffInviteToken, hashStaffInviteToken } from '@/lib/domain/staff-invites';

describe('generateStaffInviteToken', () => {
  it('produces a token whose hash matches hashStaffInviteToken', () => {
    const { token, tokenHash } = generateStaffInviteToken();
    expect(hashStaffInviteToken(token)).toBe(tokenHash);
  });

  it('produces different tokens each call', () => {
    const a = generateStaffInviteToken();
    const b = generateStaffInviteToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe('buildStaffInviteUrl', () => {
  it('joins base url, locale, and token with exactly one slash each', () => {
    expect(buildStaffInviteUrl('https://example.com/', 'en', 'abc')).toBe(
      'https://example.com/en/staff/accept/abc',
    );
    expect(buildStaffInviteUrl('https://example.com', 'ar', 'abc')).toBe(
      'https://example.com/ar/staff/accept/abc',
    );
  });
});
