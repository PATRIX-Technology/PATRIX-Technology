import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getStripeClient } from '@/lib/billing/stripe';
import { flags } from '@/lib/flags';
import {
  PRINT_ORDER_PRICE_MINOR,
  MAX_BULK_PRINT_ORDER_STORIES,
  isPrintOrderCurrency,
  validateShippingAddress,
} from '@/lib/domain/print-orders';

export const runtime = 'nodejs';

/**
 * Starts a Stripe Checkout session (mode: 'payment', one-off -- never
 * mode: 'subscription') for one or more already-approved stories' printed
 * copies, all paid for together in a single checkout -- see
 * docs/DECISIONS.md "Bulk print ordering, paid online, replaces the
 * WhatsApp no-payment bypass". A single-story order (the story detail
 * page's PrintOrderDialog) is just `storyIds: [oneId]`; the bulk order
 * dialog on the stories list page sends the whole selection at once. One
 * `print_orders` row is still inserted per story (so per-story
 * status/shipping bookkeeping is unchanged), all sharing a fresh
 * `batch_id` so the webhook can mark them paid together and notify the
 * owner with one summary instead of N separate ones.
 *
 * Deliberately a hosted Checkout session, same as the subscription flow
 * in /api/billing/checkout, rather than a custom Card Element/PaymentIntent
 * integration: less PCI surface for us to carry, built-in 3D Secure, and
 * Stripe's own recommended integration path for an account still going
 * through UAE onboarding review.
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
  const storyIds = Array.from(new Set(Array.isArray(body.storyIds) ? body.storyIds.map(String) : []));
  const currency = body.currency;
  const consentAccepted = body.consentAccepted === true;
  const locale = body.locale === 'ar' ? 'ar' : 'en';

  if (storyIds.length === 0) {
    return NextResponse.json({ error: 'No stories selected.' }, { status: 400 });
  }
  if (storyIds.length > MAX_BULK_PRINT_ORDER_STORIES) {
    return NextResponse.json(
      { error: `You can order at most ${MAX_BULK_PRINT_ORDER_STORIES} printed copies in one checkout.` },
      { status: 400 },
    );
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

  // Every story_id must belong to this tenant AND be fully approved -- a
  // DRAFT/GENERATING/NEEDS_REVIEW story has no finished PDF to print yet.
  // The composite tenant check mirrors requestConsentAction's reasoning
  // in src/lib/actions/children.ts: give a clear error here instead of
  // letting RLS surface a raw constraint violation -- and here, report
  // exactly which ones failed rather than silently ordering fewer than
  // the owner selected.
  const { data: stories } = await supabase
    .from('stories')
    .select('id, status, theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name)')
    .eq('tenant_id', context.tenantId)
    .in('id', storyIds);

  const foundById = new Map((stories ?? []).map((s) => [s.id, s]));
  const notApproved = storyIds.filter((id) => foundById.get(id)?.status !== 'APPROVED');
  if (notApproved.length > 0) {
    return NextResponse.json(
      {
        error:
          notApproved.length === storyIds.length
            ? 'None of the selected stories are fully approved yet.'
            : `${notApproved.length} of the selected stories aren't fully approved yet -- deselect them and try again.`,
      },
      { status: 409 },
    );
  }

  const themeLocalePairs = [...new Set((stories ?? []).map((s) => `${s.theme_key}:${s.locale}`))];
  const { data: templateRows } = await supabase
    .from('story_theme_templates')
    .select('theme_key, locale, title')
    .in('theme_key', [...new Set((stories ?? []).map((s) => s.theme_key))]);
  const titleByThemeLocale = new Map(
    (templateRows ?? [])
      .filter((row) => themeLocalePairs.includes(`${row.theme_key}:${row.locale}`))
      .map((row) => [`${row.theme_key}:${row.locale}`, row.title]),
  );

  const amountMinor = PRINT_ORDER_PRICE_MINOR[currency];
  const batchId = randomUUID();
  const consentAcceptedAt = new Date().toISOString();

  const { data: orders, error: insertError } = await supabase
    .from('print_orders')
    .insert(
      storyIds.map((storyId) => ({
        tenant_id: context.tenantId,
        story_id: storyId,
        batch_id: batchId,
        requested_by: context.userId,
        currency,
        amount_minor: amountMinor,
        shipping_name: shipping.shippingName,
        shipping_phone: shipping.shippingPhone,
        shipping_address_line1: shipping.shippingAddressLine1,
        shipping_address_line2: shipping.shippingAddressLine2 ?? null,
        shipping_city: shipping.shippingCity,
        shipping_country: shipping.shippingCountry,
        consent_accepted_at: consentAcceptedAt,
      })),
    )
    .select('id, story_id');
  if (insertError || !orders || orders.length !== storyIds.length) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not create the print order.' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  const lineItems = storyIds.map((storyId) => {
    const story = foundById.get(storyId)!;
    const child = story.children as unknown as { first_name: string; arabic_first_name: string | null } | null;
    const childName = (story.locale === 'ar' && child?.arabic_first_name) || child?.first_name || '';
    const title = titleByThemeLocale.get(`${story.theme_key}:${story.locale}`) ?? story.theme_key.replace(/_/g, ' ');
    const name =
      locale === 'ar'
        ? `نسخة مطبوعة — ${title} (${childName})`
        : `Printed copy — ${title} (${childName})`;
    return {
      price_data: {
        currency,
        unit_amount: amountMinor,
        product_data: { name },
      },
      quantity: 1,
    };
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: { batch_id: batchId },
    success_url: `${appUrl}/${locale}/dashboard/stories?printOrder=success`,
    cancel_url: `${appUrl}/${locale}/dashboard/stories?printOrder=cancelled`,
  });

  const { error: updateError } = await supabase
    .from('print_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('batch_id', batchId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ checkoutUrl: session.url });
}
