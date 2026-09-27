'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { ActionResult } from './auth';

export interface StaffInviteLookup {
  found: boolean;
  tenantName?: string;
  role?: string;
  email?: string;
  status?: string;
}

/**
 * Invite tokens are 24 random bytes (~192 bits) -- brute-forcing one is
 * computationally infeasible regardless of rate limiting. These limits
 * are defence-in-depth, same reasoning as the consent link's, generous
 * enough that someone re-checking their own invite page never gets
 * blocked.
 */
const INVITE_LOOKUP_RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };
const INVITE_ACCEPT_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

export async function getStaffInviteInfo(token: string): Promise<StaffInviteLookup> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`staff-invite:lookup:${ip}`, INVITE_LOOKUP_RATE_LIMIT.limit, INVITE_LOOKUP_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { found: false };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_staff_invite_info', { raw_token: token });
  if (error || !data || !data.found) return { found: false };
  return {
    found: true,
    tenantName: data.tenant_name,
    role: data.role,
    email: data.email,
    status: data.status,
  };
}

export interface AcceptStaffInviteResult extends ActionResult {
  emailConfirmationPending?: boolean;
}

/**
 * Runs auth.signUp for the invited email, then (if that produced an
 * active session -- it won't if the Supabase project requires email
 * confirmation) immediately calls accept_staff_invite to join the
 * inviting tenant. If confirmation is required, the invited person just
 * needs to confirm and revisit this same link once signed in -- the
 * invite stays "pending" until accept_staff_invite actually runs, same
 * tolerance signUpAction already has for this Supabase Auth setting.
 */
export async function acceptStaffInviteAction(
  locale: string,
  token: string,
  email: string,
  formData: FormData,
): Promise<AcceptStaffInviteResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`staff-invite:accept:${ip}`, INVITE_ACCEPT_RATE_LIMIT.limit, INVITE_ACCEPT_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const fullName = String(formData.get('fullName') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!fullName || !password) return { error: 'All fields are required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) return { error: signUpError.message };

  if (!signUpData.session) {
    return { emailConfirmationPending: true };
  }

  const { data: tenantId, error: acceptError } = await supabase.rpc('accept_staff_invite', {
    raw_token: token,
    full_name: fullName,
  });
  if (acceptError) return { error: acceptError.message };
  if (!tenantId) return { error: 'Could not join the team. Please try again.' };

  return { redirectTo: `/${locale}/dashboard` };
}
