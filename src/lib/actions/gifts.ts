'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { GiftStatus } from '@/types/database';
import type { ActionResult } from './auth';

export interface GiftStatusLookup {
  found: boolean;
  status?: GiftStatus;
  storyCredits?: number;
}

export async function getGiftStatus(code: string): Promise<GiftStatusLookup> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`gifts:status:${ip}`, 30, 5 * 60 * 1000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { found: false };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_gift_status', { raw_code: code });
  if (error || !data || !data.found) return { found: false };
  return { found: true, status: data.status, storyCredits: data.story_credits };
}

export interface RedeemGiftResult extends ActionResult {
  storyCreditsAdded?: number;
}

export async function redeemGiftAction(code: string): Promise<RedeemGiftResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Sign in (or create a family account) first, then redeem your gift.' };

  try {
    const ip = await getClientIp();
    await enforceRateLimit(`gifts:redeem:${ip}:${context.userId}`, 10, 10 * 60 * 1000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const { data, error } = await supabase.rpc('redeem_gift', {
    raw_code: code,
    target_tenant_id: context.tenantId,
  });
  if (error) return { error: error.message };

  return { storyCreditsAdded: data as number };
}
