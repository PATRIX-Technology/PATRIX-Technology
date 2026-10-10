import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getStripeClient } from '@/lib/billing/stripe';
import { flags } from '@/lib/flags';
import {
  PRINT_ORDER_PRICE_MINOR,
  isPrintOrderCurrency,
  validateShippingAddress,
} from '@/lib/domain/print-orders';

export const runtime = 'nodejs';

/**
 * Starts a Stripe Checkout session (mode: 'payment', one-off -- never
 * mode: 'subscription') for a physical printed copy of an already
 * -approved story. Deliberately a hosted Checkout session, same as the
 * subscription flow in /api/billing/checkout, rather than a custom Card
 * Element/PaymentIntent integration: less PCI surface for us to carry,
 * built-in 3D Secure, and Stripe's own recommended integration path for
 * an account still going through UAE onboarding review.
 */
export async function POST(request: Request) {
  if (!flags.billing) {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment yet.' }, { status: 501 });
  }

  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const storyId = String(body.storyId ?? '');
  const currency = body.currency;
  const consentAccepted = body.consentAccepted === true;
  const locale = body.locale === 'ar' ? 'ar' : 'en';

  if (!storyId) {
    return NextResponse.json({ error: 'Missing storyId.' }, { status: 400 });
  }
  if (!isPrintOrderCurrency(currency)) {
    return NextResponse.json({ error: 'Choose AED or USD.' }, { status: 400 });
  }
  if (!consentAccepted) {
    return NextResponse.json(
      { error: 'You must confirm the parental consent and sales terms checkbox.' },
      { status: 400 },
    );
  }

  const shipping = validateShippingAddress(body);
  if (!shipping) {
    return NextResponse.json({ error: 'Please fill in a complete shipping address.' }, { status: 400 });
  }

  // story_id must belong to this tenant AND be fully approved -- a
  // DRAFT/GENERATING/NEEDS_REVIEW story has no finished PDF to print yet.
  // The composite tenant check mirrors requestConsentAction's reasoning
  // in src/lib/actions/children.ts: give a clear error here instead of
  // letting print_orders_story_tenant_fkey (if added later) or RLS
  // surface a raw constraint violation.
  const { data: story } = await supabase
    .from('stories')
    .select('id, status')
    .eq('id', storyId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!story) {
    return NextResponse.json({ error: 'Story not found.' }, { status: 404 });
  }
  if (story.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'Only a fully approved, finished story can be ordered as a printed copy.' },
      { status: 409 },
    );
  }

  const amountMinor = PRINT_ORDER_PRICE_MINOR[currency];

  const { data: order, error: insertError } = await supabase
    .from('print_orders')
    .insert({
      tenant_id: context.tenantId,
      story_id: storyId,
      requested_by: context.userId,
      currency,
      amount_minor: amountMinor,
      shipping_name: shipping.shippingName,
      shipping_phone: shipping.shippingPhone,
      shipping_address_line1: shipping.shippingAddressLine1,
      shipping_address_line2: shipping.shippingAddressLine2 ?? null,
      shipping_city: shipping.shippingCity,
      shipping_country: shipping.shippingCountry,
      consent_accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insertError || !order) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not create the print order.' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountMinor,
          product_data: {
            name: locale === 'ar' ? 'نسخة مطبوعة من كتاب القصة المخصص' : 'Printed personalised storybook',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { print_order_id: order.id },
    success_url: `${appUrl}/${locale}/dashboard/stories/${storyId}?printOrder=success`,
    cancel_url: `${appUrl}/${locale}/dashboard/stories/${storyId}?printOrder=cancelled`,
  });

  const { error: updateError } = await supabase
    .from('print_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ checkoutUrl: session.url });
}
