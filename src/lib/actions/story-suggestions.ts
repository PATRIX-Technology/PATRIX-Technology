'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { ActionResult } from './auth';

/**
 * Saves a nursery/family's story-idea suggestion — see
 * docs/DECISIONS.md "Story template suggestions". This only records
 * the idea; the WhatsApp hand-off to the founder is a separate,
 * client-side wa.me link the dialog offers after a successful save
 * (see SuggestTemplateDialog), not something this action sends itself.
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

  return { message: 'saved' };
}
