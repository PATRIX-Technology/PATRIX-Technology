import type { SupabaseClient } from '@supabase/supabase-js';

export type MfaGateResult =
  | { status: 'ok' }
  | { status: 'needs_enrollment' }
  | { status: 'needs_challenge' };

/**
 * Platform owner accounts must complete TOTP MFA before reaching any
 * /owner route — see docs/DECISIONS.md "Owner MFA is mandatory, not
 * optional". Uses Supabase Auth's built-in Authenticator Assurance Level
 * (AAL) rather than our own token scheme: `nextLevel` tells us whether a
 * second factor exists at all, `currentLevel` tells us whether THIS
 * session has actually completed it.
 */
export async function checkOwnerMfaGate(supabase: SupabaseClient): Promise<MfaGateResult> {
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
