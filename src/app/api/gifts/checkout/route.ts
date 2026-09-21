import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/billing/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { findGiftPack } from '@/lib/domain/gifts';
import { generateGiftCode } from '@/lib/domain/gift-tokens';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { flags } from '@/lib/flags';

export const runtime = 'nodejs';

/**
 * Starts a one-time Stripe Checkout purchase for a gift pack. Unlike the
 * subscription checkout in src/app/api/billing/checkout/route.ts, this
 * needs no signed-in tenant — anyone can buy a gift for someone else. See
 * docs/DECISIONS.md "Phase 4: gifting" for the full redemption-code
 * trust model.
 */
export async function POST(request: Request) {
  if (!flags.billing) {
    return NextResponse.json({ error: 'Gift purchases are not enabled on this deployment yet.' }, { status: 501 });
  }

  try {
    const ip = await getClientIp();
    await enforceRateLimit(`gifts:checkout:${ip}`, 10, 10 * 60 * 1000);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const body = await request.json().catch(() => ({}));
  const packKey = String(body.packKey ?? '');
  const purchaserEmail = String(body.purchaserEmail ?? '').trim();
  const locale = body.locale === 'ar' ? 'ar' : 'en';

  const pack = findGiftPack(packKey);
  if (!pack) {
    return NextResponse.json({ error: 'Unknown gift pack.' }, { status: 404 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(purchaserEmail)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }

  const { code, codeHash } = generateGiftCode();
  const serviceClient = createSupabaseServiceRoleClient();

  const { data: gift, error: insertError } = await serviceClient
    .from('gifts')
    .insert({
      purchaser_email: purchaserEmail,
      story_credits: pack.storyCredits,
      amount_usd: pack.priceUsd,
      code_hash: codeHash,
      status: 'pending_payment',
    })
    .select('id')
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: purchaserEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(pack.priceUsd * 100),
          product_data: {
            name: `Hikayti gift — ${pack.label}`,
            description: 'A redeemable code for personalised storybook credits.',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { purpose: 'gift', gift_id: gift.id },
    success_url: `${appUrl}/${locale}/gift/success?code=${code}`,
    cancel_url: `${appUrl}/${locale}/gift`,
  });

  const { error: updateError } = await serviceClient
    .from('gifts')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', gift.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
