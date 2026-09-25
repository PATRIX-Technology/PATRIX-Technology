/**
 * WhatsApp number for the Contact Us page, in wa.me format (digits only,
 * with country code, no leading +/00). Set once the founder confirms
 * the number - see docs/NEEDS_FROM_ME.md.
 */
export const WHATSAPP_NUMBER = '';

export function whatsappLink(message?: string): string | null {
  if (!WHATSAPP_NUMBER) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${WHATSAPP_NUMBER}${query}`;
}
