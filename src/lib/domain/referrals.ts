import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Best-effort: a signup that arrived via someone's invite link should
 * never fail (or even surface an error) just because the referral
 * bookkeeping had a hiccup — see docs/DECISIONS.md "Referral program
 * replaces gifting". record_referral itself is already a no-op for an
 * empty/unknown code or a self-referral. Called right after
 * create_tenant/create_family_tenant from every one of the four sign-up
 * action functions (email/phone × nursery/family).
 */
export async function recordReferralIfPresent(
  supabase: SupabaseClient,
  referralCode: string,
  newTenantId: string | null,
): Promise<void> {
  if (!referralCode || !newTenantId) return;
  await supabase.rpc('record_referral', { referral_code_used: referralCode, new_tenant_id: newTenantId });
}
