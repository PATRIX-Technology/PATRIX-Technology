'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import type { StorySuggestionStatus } from '@/types/database';
import type { ActionResult } from './auth';

/**
 * Saves a nursery/family's story-idea suggestion — see
 * docs/DECISIONS.md "Story template suggestions" and its "Telegram
 * notification removed" follow-up. Always saved to the database
 * first and visible on the Owner dashboard's suggestions list — the
 * durable, guaranteed record. The WhatsApp wa.me link the dialog
 * offers afterwards is an optional, submitter-initiated fast path on
 * top of that (founder's own number, no WhatsApp Business API or
 * per-message cost involved), never a substitute for the saved row.
 *
 * The submission cap is a fixed number per subscription billing
 * period (plans.suggestion_requests_per_month, synced into
 * quotas.suggestions_included_this_period at checkout), not a
 * sliding-window rate limit — see docs/DECISIONS.md "Story
 * suggestions: fixed count per period, not per hour". Enforced by
 * consume_suggestion_quota (migration 0038), the same
 * check-and-increment pattern already used for story generation
 * quota.
 */
export async function suggestStoryTemplateAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Sign in first.' };

  const { data: allowed, error: quotaError } = await supabase.rpc('consume_suggestion_quota', {
    target_tenant_id: context.tenantId,
  });
  if (quotaError) return { error: quotaError.message };
  if (!allowed) {
    return {
      error: "You've used all your story suggestions for this billing period. They reset when your subscription renews.",
    };
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
