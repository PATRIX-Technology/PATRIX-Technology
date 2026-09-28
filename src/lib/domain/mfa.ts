import type { SupabaseClient } from '@supabase/supabase-js';

export type MfaGateResult =
  | { status: 'ok' }
  | { status: 'needs_enrollment' }
  | { status: 'needs_challenge' };

/**
 * Reports this session's TOTP MFA status via Supabase Auth's built-in
 * Authenticator Assurance Level (AAL) rather than a bespoke token scheme:
 * `nextLevel` tells us whether a second factor exists on the account at
 * all, `currentLevel` tells us whether THIS session has actually
 * completed it.
 *
 * Two different callers use this the same way but enforce differently:
 * platform owner routes treat 'needs_enrollment' as a hard block (owner
 * MFA is mandatory — see docs/DECISIONS.md "Owner MFA is mandatory, not
 * optional"), while the regular tenant dashboard treats it as optional
 * and only forces 'needs_challenge' (see "Optional-but-recommended MFA
 * for regular users") — someone who never enrolled just isn't asked,
 * but someone who DID enroll always has to complete the step-up.
 */
export async function getMfaStatus(supabase: SupabaseClient): Promise<MfaGateResult> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;

  if (data.nextLevel === 'aal1' || data.nextLevel === null) {
    return { status: 'needs_enrollment' };
  }
  if (data.currentLevel !== data.nextLevel) {
    return { status: 'needs_challenge' };
  }
  return { status: 'ok' };
}
