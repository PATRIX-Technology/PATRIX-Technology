'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { ActionResult } from './auth';

export interface ConsentLookup {
  found: boolean;
  childFirstName?: string;
  organisationName?: string;
  status?: string;
  expiresAt?: string;
  requestsPhoto?: boolean;
}

/**
 * Consent tokens are 24 random bytes (~192 bits) — brute-forcing one is
 * computationally infeasible regardless of rate limiting. These limits
 * are defence-in-depth (per the product brief's "rate limiting where
 * appropriate"), not the primary protection, so they're generous enough
 * that a parent refreshing the page a few times never gets blocked.
 */
const CONSENT_LOOKUP_RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };
const CONSENT_RESPOND_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

export async function getConsentInfo(token: string): Promise<ConsentLookup> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:lookup:${ip}`,
      CONSENT_LOOKUP_RATE_LIMIT.limit,
      CONSENT_LOOKUP_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { found: false };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_consent_request_info', { raw_token: token });
  if (error || !data || !data.found) return { found: false };
  return {
    found: true,
    childFirstName: data.child_first_name,
    organisationName: data.organisation_name,
    status: data.status,
    expiresAt: data.expires_at,
    requestsPhoto: Boolean(data.requests_photo),
  };
}

export interface RespondToConsentResult extends ActionResult {
  success?: boolean;
}

export async function respondToConsentAction(
  token: string,
  decision: 'granted' | 'declined',
): Promise<RespondToConsentResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:respond:${ip}`,
      CONSENT_RESPOND_RATE_LIMIT.limit,
      CONSENT_RESPOND_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('respond_to_consent', { raw_token: token, decision });
  if (error) return { error: error.message };
  return { success: true };
}
