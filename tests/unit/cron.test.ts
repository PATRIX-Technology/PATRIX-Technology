import { describe, expect, it } from 'vitest';
import { isCronRequestAuthorized } from '@/lib/domain/cron';

describe('isCronRequestAuthorized', () => {
  it('accepts the correct bearer token', () => {
    expect(isCronRequestAuthorized('Bearer my-secret', 'my-secret')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isCronRequestAuthorized('Bearer wrong', 'my-secret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isCronRequestAuthorized(null, 'my-secret')).toBe(false);
  });

  it('rejects a header missing the Bearer prefix', () => {
    expect(isCronRequestAuthorized('my-secret', 'my-secret')).toBe(false);
  });

  it('rejects a token that only differs in length, without throwing', () => {
    // timingSafeEqual throws on mismatched buffer lengths -- this must
    // be handled, not just accidentally not crash in one direction.
    expect(isCronRequestAuthorized('Bearer my-secret-but-longer', 'my-secret')).toBe(false);
    expect(isCronRequestAuthorized('Bearer short', 'my-secret')).toBe(false);
  });
});
