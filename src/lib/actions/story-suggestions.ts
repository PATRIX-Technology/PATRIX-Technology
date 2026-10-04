'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { StorySuggestionStatus } from '@/types/database';
import type { ActionResult } from './auth';

/**
 * How many suggestions a tenant may submit per hour, keyed by their
 * current plan — a higher-tier subscriber gets a higher cap. Deliberately
 * modest at every tier since this is a feedback form, not core product
 * usage: even the top nursery plan doesn't need a high ceiling. Tenants
 * with no active subscription row yet (checkout not completed, or a plan
 * that's been removed from the `plans` table) get the lowest tier's limit
 * rather than the old flat 10/hour default.
 */
const SUGGESTION_RATE_LIMIT_BY_PLAN_KEY: Record<string, number> = {
  family: 3,
  family_plus: 5,
  starter: 10,
  starter_usd: 10,
  growth: 20,
  growth_usd: 20,
  network: 30,
  network_usd: 30,
};
const DEFAULT_SUGGESTION_RATE_LIMIT = 3;

async function getSuggestionRateLimit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
): Promise<number> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plans(key)')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const planKey = (data?.plans as unknown as { key: string } | null)?.key;
  return (planKey && SUGGESTION_RATE_LIMIT_BY_PLAN_KEY[planKey]) || DEFAULT_SUGGESTION_RATE_LIMIT;
}

/**
 * Saves a nursery/family's story-idea suggestion — see
 * docs/DECISIONS.md "Story template suggestions" and its "Telegram
 * notification removed" follow-up. Always saved to the database
 * first and visible on the Owner dashboard's suggestions list — the
 * durable, guaranteed record. The WhatsApp wa.me link the dialog
 * offers afterwards is an optional, submitter-initiated fast path on
 * top of that (founder's own number, no WhatsApp Business API or
 * per-message cost involved), never a substitute for the saved row.
 */
export async function suggestStoryTemplateAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Sign in first.' };

  try {
    const ip = await getClientIp();
    const limit = await getSuggestionRateLimit(supabase, context.tenantId);
    await enforceRateLimit(`story-suggestion:${ip}:${context.userId}`, limit, 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const topic = String(formData.get('topic') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!topic || !description) {
    return { error: 'Please fill in both fields.' };
  }

  const { error } = await supabase.from('story_template_suggestions').insert({
    tenant_id: context.tenantId,
    submitted_by: context.userId,
    topic,
    description,
  });
  if (error) return { error: error.message };

  return { message: 'saved' };
}

/**
 * Owner-only status update for a suggestion (new -> reviewed / added /
 * declined) — backs the Owner dashboard list. RLS enforces this at
 * the database level too (story_template_suggestions_owner_update in
 * migration 0024); the explicit check here just gives a clearer error
 * than the raw Postgres RLS message would.
 */
export async function updateSuggestionStatusAction(
  suggestionId: string,
  status: StorySuggestionStatus,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Sign in first.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_owner')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_platform_owner) return { error: 'Not authorized.' };

  const { error } = await supabase
    .from('story_template_suggestions')
    .update({ status })
    .eq('id', suggestionId);
  if (error) return { error: error.message };

  return { message: 'updated' };
}
