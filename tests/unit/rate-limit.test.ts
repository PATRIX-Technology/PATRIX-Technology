import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryRateLimiter } from '@/lib/rate-limit';

describe('InMemoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first `limit` attempts within a window', async () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check('key-a', 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks the (limit + 1)th attempt within the same window', async () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      await limiter.check('key-b', 5, 60_000);
    }
    const blocked = await limiter.check('key-b', 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks separate keys independently', async () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      await limiter.check('tenant-a', 5, 60_000);
    }
    const otherKey = await limiter.check('tenant-b', 5, 60_000);
    expect(otherKey.allowed).toBe(true);
  });

  it('resets once the window has elapsed', async () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      await limiter.check('key-c', 5, 60_000);
    }
    expect((await limiter.check('key-c', 5, 60_000)).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    const afterReset = await limiter.check('key-c', 5, 60_000);
    expect(afterReset.allowed).toBe(true);
  });

  it('reports decreasing remaining counts as attempts are consumed', async () => {
    const limiter = new InMemoryRateLimiter();
    const first = await limiter.check('key-d', 3, 60_000);
    const second = await limiter.check('key-d', 3, 60_000);
    const third = await limiter.check('key-d', 3, 60_000);
    expect([first.remaining, second.remaining, third.remaining]).toEqual([2, 1, 0]);
  });
});
