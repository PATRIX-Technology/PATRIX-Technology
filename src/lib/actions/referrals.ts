'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import type { ReferralSummary } from '@/types/database';

/**
 * Replaces the old gift-purchase flow — see docs/DECISIONS.md "Referral
 * program replaces gifting". Any signed-in tenant can share their own
 * referral_code; once someone who signed up with it subscribes for the
 * first time, reward_referral (called from the Stripe webhook) credits
 * this tenant with free stories matching the invitee's plan.
 */
export async function getReferralSummaryAction(): Promise<ReferralSummary | null> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data, error } = await supabase.rpc('get_referral_summary', { target_tenant_id: context.tenantId });
  if (error || !data) return null;
  return data as ReferralSummary;
}
