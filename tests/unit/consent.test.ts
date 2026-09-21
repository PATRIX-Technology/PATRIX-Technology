import { describe, expect, it } from 'vitest';
import {
  buildConsentScope,
  buildConsentUrl,
  generateConsentToken,
  hashConsentToken,
  isPhotoPersonalizationAllowed,
} from '@/lib/domain/consent';

describe('generateConsentToken', () => {
  it('produces a token whose hash matches hashConsentToken', () => {
    const { token, tokenHash } = generateConsentToken();
    expect(hashConsentToken(token)).toBe(tokenHash);
  });

  it('produces different tokens each call', () => {
    const a = generateConsentToken();
    const b = generateConsentToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe('buildConsentUrl', () => {
  it('joins base url and token with exactly one slash', () => {
    expect(buildConsentUrl('https://example.com/consent/', 'abc')).toBe(
      'https://example.com/consent/abc',
    );
    expect(buildConsentUrl('https://example.com/consent', 'abc')).toBe(
      'https://example.com/consent/abc',
    );
  });
});

describe('isPhotoPersonalizationAllowed', () => {
  // FEATURE_PHOTO_PERSONALIZATION is unset in the test environment, so the
  // flag itself is false — this asserts the gate stays closed even when
  // every OTHER condition is true, which is the whole point of the flag.
  it('is false when the feature flag is off, even if tenant + legal conditions are true', () => {
    expect(
      isPhotoPersonalizationAllowed({ tenantOptedIntoPhoto: true, legalReviewCompleted: true }),
    ).toBe(false);
  });

  it('is false when the tenant has not opted in', () => {
    expect(
      isPhotoPersonalizationAllowed({ tenantOptedIntoPhoto: false, legalReviewCompleted: true }),
    ).toBe(false);
  });
});

describe('buildConsentScope', () => {
  it('always includes story consent', () => {
    const scope = buildConsentScope({
      tenantOptedIntoPhoto: false,
      legalReviewCompleted: false,
      requestPhoto: false,
    });
    expect(scope.story).toBe(true);
  });

  it('never grants photo scope while the flag is off, even if requested', () => {
    const scope = buildConsentScope({
      tenantOptedIntoPhoto: true,
      legalReviewCompleted: true,
      requestPhoto: true,
    });
    expect(scope.photo).toBe(false);
  });
});
