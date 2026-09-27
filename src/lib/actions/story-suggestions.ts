'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import type { StorySuggestionStatus } from '@/types/database';
import type { ActionResult } from './auth';

/**
 * Saves a nursery/family's story-idea suggestion — see
 * docs/DECISIONS.md "Story template suggestions". Always saved to the
 * database first; the Telegram notification and the WhatsApp wa.me
 * link the dialog offers afterwards are both best-effort extras on
 * top of that saved row, never a substitute for it.
 */
export async function suggestStoryTemplateAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Sign in first.' };

  try {
    const ip = await getClientIp();
    await enforceRateLimit(`story-suggestion:${ip}:${context.userId}`, 10, 60 * 60 * 1000);
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

  await sendTelegramMessage(
    `📖 New story idea suggestion\n\nFrom: ${context.tenantName} (${context.fullName})\n\nTopic: ${topic}\n\nWhy it matters: ${description}`,
  );

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
