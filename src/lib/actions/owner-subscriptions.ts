'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { planIsAvailableForTenant } from '@/lib/domain/billing';
import type { SubscriptionStatus } from '@/types/database';

/**
 * Richer than the generic ActionResult on purpose: the owner-subscriptions
 * table is server-rendered, and a client-side revalidatePath()/
 * router.refresh() round trip through Next's fetch cache turned out to be
 * unreliable at actually showing the new plan/usage here (see
 * docs/DECISIONS.md "Owner subscriptions admin panel"). Returning the
 * authoritative saved values lets the calling control update its own
 * displayed row directly from this result — the same pattern
 * SuggestionStatusControl already uses for the same reason.
 */
export type SetTenantSubscriptionResult =
  | { error: string }
  | {
      message: 'updated';
      planId: string;
      status: SubscriptionStatus;
      cancelAtPeriodEnd: boolean;
      storiesIncluded: number;
      periodEnd: string;
    };

/**
 * Manual owner override for a tenant's plan/status — for pilot customers
 * signed up before real Stripe billing exists, or any case the founder
 * needs to grant/correct a plan by hand instead of waiting on a Stripe
 * checkout. Reuses the same RLS grants a real checkout relies on
 * (subscriptions_owner_write / quotas_owner_write, migration 0004) rather
 * than a new RPC — is_platform_owner() is checked explicitly here too, for
 * a clear error message instead of a raw Postgres RLS one.
 *
 * Sets a fresh 30-day period starting now and gives the tenant the new
 * plan's full story allowance immediately (mirrors what
 * sync_quota_to_plan does for a real Stripe checkout, migration 0016) —
 * a manual grant should behave exactly like a paid one from the tenant's
 * point of view.
 */
export async function adminSetTenantSubscriptionAction(
  tenantId: string,
  planId: string,
  status: SubscriptionStatus,
  cancelAtPeriodEnd: boolean,
): Promise<SetTenantSubscriptionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Sign in first.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_owner')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_platform_owner) return { error: 'Not authorized.' };

  const [{ data: tenant }, { data: plan }] = await Promise.all([
    supabase.from('tenants').select('tenant_type').eq('id', tenantId).maybeSingle(),
    supabase.from('plans').select('audience, stories_per_month').eq('id', planId).maybeSingle(),
  ]);
  if (!tenant) return { error: 'Tenant not found.' };
  if (!plan) return { error: 'Plan not found.' };
  if (!planIsAvailableForTenant(plan, tenant.tenant_type)) {
    return { error: `That plan is priced for ${plan.audience} accounts, not ${tenant.tenant_type} ones.` };
  }

  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: subscriptionError } = await supabase
    .from('subscriptions')
    .update({
      plan_id: planId,
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
  if (subscriptionError) return { error: subscriptionError.message };

  const { error: quotaError } = await supabase.from('quotas').upsert(
    {
      tenant_id: tenantId,
      stories_included_this_period: plan.stories_per_month,
      stories_used_this_period: 0,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (quotaError) return { error: quotaError.message };

  return {
    message: 'updated',
    planId,
    status,
    cancelAtPeriodEnd,
    storiesIncluded: plan.stories_per_month,
    periodEnd: periodEnd.toISOString(),
  };
}
