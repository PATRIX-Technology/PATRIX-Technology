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
