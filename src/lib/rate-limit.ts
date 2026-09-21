import 'server-only';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  /** Consumes one attempt for `key` under a fixed window of `windowMs`
   * milliseconds allowing at most `limit` attempts. */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/**
 * Fixed-window in-memory limiter. Correct and effective for a single
 * process (local dev, a demo deployment, or a single long-running
 * server), but each process/instance has its OWN counters — behind a
 * multi-instance/serverless deployment this under-counts (each instance
 * allows `limit` attempts independently). See UpstashRateLimiter below
 * for the distributed alternative, or docs/DECISIONS.md "Rate limiting".
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      this.sweep(now);
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }

    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
  }

  /** Bounds memory growth by evicting expired buckets on a fraction of calls. */
  private sweep(now: number): void {
    if (Math.random() > 0.02) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Distributed limiter backed by Upstash Redis's REST API (no extra SDK
 * dependency needed — it's plain HTTPS). Used automatically when
 * RATE_LIMIT_REDIS_URL / RATE_LIMIT_REDIS_TOKEN are configured, so rate
 * limits hold correctly across multiple server instances in production.
 */
export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
  ) {}

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`;
    const response = await fetch(`${this.restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', windowKey],
        ['PEXPIRE', windowKey, String(windowMs)],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Upstash rate limit request failed: ${response.status}`);
    }

    const [incrResult] = (await response.json()) as [{ result: number }, { result: number }];
    const count = incrResult.result;

    if (count > limit) {
      const msIntoWindow = Date.now() % windowMs;
      return { allowed: false, remaining: 0, retryAfterMs: windowMs - msIntoWindow };
    }
    return { allowed: true, remaining: limit - count, retryAfterMs: 0 };
  }
}

let cachedLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (cachedLimiter) return cachedLimiter;

  const url = process.env.RATE_LIMIT_REDIS_URL;
  const token = process.env.RATE_LIMIT_REDIS_TOKEN;
  cachedLimiter = url && token ? new UpstashRateLimiter(url, token) : new InMemoryRateLimiter();
  return cachedLimiter;
}

/** Convenience wrapper that throws a user-facing error when blocked, for
 * the common case of a server action calling this at its top. */
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many attempts. Please wait a moment and try again.');
    this.name = 'RateLimitExceededError';
  }
}

export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const result = await getRateLimiter().check(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitExceededError(result.retryAfterMs);
  }
}
