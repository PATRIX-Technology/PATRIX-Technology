'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import {
  PRINT_ORDER_PRICE_MINOR,
  isPrintOrderCurrency,
  validateShippingAddress,
  type ShippingAddressInput,
} from '@/lib/domain/print-orders';
import { whatsappLink } from '@/lib/config/contact';
import type { ActionResult } from './auth';

export interface WhatsAppPrintOrderResult extends ActionResult {
  whatsappUrl?: string;
}

/**
 * A lighter-weight alternative to the Stripe-paid checkout in
 * /api/print-orders/checkout — see docs/DECISIONS.md "WhatsApp print
 * order: a manual-fulfillment alternative to Stripe checkout". Records
 * the exact same `print_orders` row (status stays 'pending', no
 * `stripe_checkout_session_id`) so the order is visible in the owner's
 * dashboard and never just a chat message that can get lost, then hands
 * back a `wa.me` link pre-filled with the order summary, addressed to
 * Ownly's own support/ops number (the same one the Contact page uses) —
 * per the founder's spec, staff there forward it on to whichever print
 * vendor is contracted, never the vendor directly.
 */
export async function createWhatsAppPrintOrderAction(
  storyId: string,
  currency: unknown,
  consentAccepted: boolean,
  shippingInput: Partial<ShippingAddressInput>,
): Promise<WhatsAppPrintOrderResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  if (!isPrintOrderCurrency(currency)) return { error: 'Choose AED or USD.' };
  if (!consentAccepted) {
    return { error: 'You must confirm the parental consent and sales terms checkbox.' };
  }

  const shipping = validateShippingAddress(shippingInput);
  if (!shipping) return { error: 'Please fill in a complete shipping address.' };

  // Same tenant/approved-status check as the Stripe checkout route — see
  // its own comment for why a composite check here beats a raw FK/RLS
  // error surfacing to the user.
  const { data: story } = await supabase
    .from('stories')
    .select('id, status, theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name)')
    .eq('id', storyId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!story) return { error: 'Story not found.' };
  if (story.status !== 'APPROVED') {
    return { error: 'Only a fully approved, finished story can be ordered as a printed copy.' };
  }

  const { data: templateRow } = await supabase
    .from('story_theme_templates')
    .select('title')
    .eq('theme_key', story.theme_key)
    .eq('locale', story.locale)
    .maybeSingle();

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
    return { error: insertError?.message ?? 'Could not create the print order.' };
  }

  const child = story.children as unknown as { first_name: string; arabic_first_name: string | null } | null;
  const childName = (story.locale === 'ar' && child?.arabic_first_name) || child?.first_name || '';
  const title = templateRow?.title ?? story.theme_key.replace(/_/g, ' ');
  const amountDisplay = `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const addressLine = [
    shipping.shippingAddressLine1,
    shipping.shippingAddressLine2,
    shipping.shippingCity,
    shipping.shippingCountry,
  ]
    .filter(Boolean)
    .join(', ');

  const message = [
    'New print order — Ownly',
    `Order ID: ${order.id}`,
    `Organisation: ${context.tenantName}`,
    `Story: ${title} (for ${childName})`,
    `Price: ${amountDisplay} (to be collected separately — not paid online)`,
    `Ship to: ${shipping.shippingName} — ${shipping.shippingPhone}`,
    `Address: ${addressLine}`,
  ].join('\n');

  const whatsappUrl = whatsappLink(message);
  if (!whatsappUrl) return { error: 'WhatsApp ordering is not available right now.' };

  return { whatsappUrl };
}
