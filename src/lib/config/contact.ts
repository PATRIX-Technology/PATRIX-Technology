/**
 * WhatsApp number for the Contact Us page, in wa.me format (digits only,
 * with country code, no leading +/00). +971 55 599 0694 -> 971555990694.
 */
export const WHATSAPP_NUMBER = '971555990694';

export function whatsappLink(message?: string): string | null {
  if (!WHATSAPP_NUMBER) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${WHATSAPP_NUMBER}${query}`;
}

/**
 * A WhatsApp share link with NO destination number -- unlike
 * whatsappLink() above (always addressed to Ownly's own number, for
 * "contact us"), this opens WhatsApp with the message pre-filled and lets
 * the person sending it pick who to send it to from their own contacts.
 * Used where staff need to forward something (a consent link, an order
 * summary) to someone whose number Ownly doesn't have on file -- a
 * parent's phone number is deliberately not collected for the bulk
 * story-only consent flow (see requestConsentBulkAction in
 * src/lib/actions/children.ts), so there's no number to address this to.
 */
export function whatsappShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
