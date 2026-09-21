import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getStripeClient } from '@/lib/billing/stripe';
import { flags } from '@/lib/flags';

export const runtime = 'nodejs';

/** Redirects the owner to Stripe's hosted customer portal for their tenant. */
export async function GET() {
  if (!flags.billing) {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment yet.' }, { status: 501 });
  }

  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (context.role !== 'nursery_owner') {
    return NextResponse.json({ error: 'Only the organisation owner can manage billing.' }, { status: 403 });
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account exists for this organisation yet.' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${appUrl}/en/dashboard/settings`,
  });

  return NextResponse.redirect(portalSession.url);
}
