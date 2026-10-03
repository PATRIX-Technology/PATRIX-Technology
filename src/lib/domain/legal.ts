import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bump whenever the Terms of Service or Privacy Policy text changes
 * materially -- each acceptance row records the version shown at the time,
 * so a dispute can be checked against the exact text the user agreed to.
 */
export const LEGAL_TERMS_VERSION = '2026-10-03';

/** Server-side re-check that the mandatory legal checkbox was actually
 * submitted checked -- the HTML `required` attribute alone is a client-side
 * nicety a form replay or direct POST can skip. Every sign-up action calls
 * this before creating an account or tenant. */
export function hasAcceptedLegalTerms(formData: FormData): boolean {
  return formData.get('legalAccepted') === 'true';
}

/**
 * Best-effort, same tradeoff as recordReferralIfPresent in
 * src/lib/domain/referrals.ts: a sign-up that already passed the mandatory
 * checkbox gate should never fail (or surface an error) just because this
 * audit insert had a hiccup. The gate itself -- hasAcceptedLegalTerms,
 * checked before any account/tenant is created -- is what actually blocks
 * an unconsented sign-up; this just records that it happened.
 */
export async function recordLegalAcceptance(
  supabase: SupabaseClient,
  { userId, tenantId, ip }: { userId: string; tenantId: string | null; ip: string },
): Promise<void> {
  await supabase.from('legal_acceptances').insert({
    user_id: userId,
    tenant_id: tenantId,
    document_version: LEGAL_TERMS_VERSION,
    ip,
  });
}
