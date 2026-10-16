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
 * Gives the tenant the new plan's full story allowance immediately
 * (mirrors what sync_quota_to_plan does for a real Stripe checkout,
 * migration 0016). Defaults the period to start now, same as before —
 * `periodStartOverride` lets the founder back- or forward-date it instead,
 * for a bank-transfer-paid Founding Partner nursery whose term should
 * start on real launch (1 Jan 2027) rather than whenever the money
 * actually arrived — see docs/DECISIONS.md "Manual grant period start can
 * be overridden".
 */
export async function adminSetTenantSubscriptionAction(
  tenantId: string,
  planId: string,
  status: SubscriptionStatus,
  cancelAtPeriodEnd: boolean,
  periodStartOverride?: string,
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

  const periodStart = periodStartOverride ? new Date(periodStartOverride) : new Date();
  if (Number.isNaN(periodStart.getTime())) return { error: 'Invalid start date.' };
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

export type SetFoundingPartnerFlagResult = { error: string } | { message: 'updated'; enabled: boolean };

/**
 * Lets the founder flag a specific tenant as a Founding Partner from
 * /owner/subscriptions, instead of handing out the FOUNDING10 coupon code
 * for the nursery to type in themselves — see docs/DECISIONS.md
 * "Founding Partner flag replaces self-serve coupon code". Checkout
 * (src/app/api/billing/checkout/route.ts) auto-applies the coupon for any
 * flagged tenant; this action only toggles the flag, with the same
 * explicit is_platform_owner() check as adminSetTenantSubscriptionAction
 * above for a clear error instead of a raw RLS one.
 *
 * Capped at 10 flagged tenants at once — matches FOUNDING10's own
 * max_redemptions, so a founder who flags an 11th nursery gets a clear
 * message here rather than a confusing failure at their checkout later.
 * Un-flagging always succeeds (never blocked by the cap).
 */
export async function adminSetFoundingPartnerFlagAction(
  tenantId: string,
  enabled: boolean,
): Promise<SetFoundingPartnerFlagResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Sign in first.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_owner')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_platform_owner) return { error: 'Not authorized.' };

  if (enabled) {
    const { count } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('founding_partner_discount', true);
    if ((count ?? 0) >= 10) {
      return { error: 'Already 10 tenants are flagged as Founding Partners — that matches the coupon\'s own limit. Un-flag one first.' };
    }
  }

  const { error } = await supabase
    .from('tenants')
    .update({ founding_partner_discount: enabled })
    .eq('id', tenantId);
  if (error) return { error: error.message };

  return { message: 'updated', enabled };
}

export type SetSpecialDiscountResult = { error: string } | { message: 'updated'; percent: number | null };

/**
 * An ad hoc, one-off percent-off for a specific tenant's next Stripe
 * checkout — for a negotiated special price outside the structured
 * Founding Partner campaign (which is capped at 10 and fixed at
 * FOUNDING10's own rate). Not counted against that cap. `percent: null`
 * clears it. See docs/DECISIONS.md "Special discount percent,
 * independent of Founding Partner".
 */
export async function adminSetSpecialDiscountAction(
  tenantId: string,
  percent: number | null,
): Promise<SetSpecialDiscountResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Sign in first.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_owner')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_platform_owner) return { error: 'Not authorized.' };

  if (percent !== null && (!Number.isInteger(percent) || percent < 1 || percent > 99)) {
    return { error: 'Discount must be a whole number between 1 and 99, or cleared.' };
  }

  const { error } = await supabase
    .from('tenants')
    .update({ special_discount_percent: percent })
    .eq('id', tenantId);
  if (error) return { error: error.message };

  return { message: 'updated', percent };
}
