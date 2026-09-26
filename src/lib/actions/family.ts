'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { normalizePhoneNumber } from '@/lib/domain/phone';
import type { ActionResult } from './auth';

const AUTH_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/** Same reasoning as OTP_SEND_RATE_LIMIT in src/lib/actions/auth.ts —
 * SMS costs real money per send, so this is tighter than password auth's
 * rate limit specifically to blunt SMS-bombing a phone number. */
const OTP_SEND_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

/**
 * Individual/family sign-up — Phase 4 scaffolding. Creates a "family"
 * tenant via create_family_tenant() (see
 * supabase/migrations/0009_family_and_gifts.sql), which reuses the exact
 * same tenant/RLS/children/story machinery a nursery uses. No separate
 * consumer data model was built — see docs/DECISIONS.md "Phase 4:
 * families are tenants" for why that's the right call here.
 */
export async function familySignUpAction(locale: string, formData: FormData): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`auth:family-sign-up:${ip}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();

  if (!email || !password || !fullName) {
    return { error: 'All fields are required.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    return { error: signUpError.message };
  }

  const familyDisplayName = `${fullName}'s Family`;
  const { error: rpcError } = await supabase.rpc('create_family_tenant', {
    family_display_name: familyDisplayName,
    owner_full_name: fullName,
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  redirect(`/${locale}/dashboard`);
}

/**
 * Phone sign-up for a family account, step 1 of 2 — mirrors
 * sendNurserySignUpOtpAction in src/lib/actions/auth.ts. Full name is
 * collected here and carried through to step 2 as a hidden form field.
 */
export async function sendFamilySignUpOtpAction(formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();

  if (!phoneInput || !fullName) {
    return { error: 'All fields are required.' };
  }
  const phone = normalizePhoneNumber(phoneInput);
  if (!phone) {
    return { error: 'Enter a valid mobile number.' };
  }

  try {
    const ip = await getClientIp();
    await enforceRateLimit(`auth:otp-send:${ip}:${phone}`, OTP_SEND_RATE_LIMIT.limit, OTP_SEND_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) {
    return { error: error.message };
  }
  return { message: `Code sent to ${phone}.` };
}

/**
 * Step 2: verifies the code and completes the family sign-up. Same
 * "already onboarded" guard as verifyNurserySignUpOtpAction — skips
 * create_family_tenant if this phone already has a tenant, rather than
 * creating a second one.
 */
export async function verifyFamilySignUpOtpAction(locale: string, formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();

  const phone = normalizePhoneNumber(phoneInput);
  if (!phone || !token) {
    return { error: 'Enter the code we sent you.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (verifyError) {
    return { error: 'That code is incorrect or has expired.' };
  }

  const existing = await getCurrentTenantContext(supabase);
  if (!existing) {
    if (!fullName) {
      return { error: 'Missing your name — go back and try again.' };
    }
    const { error: rpcError } = await supabase.rpc('create_family_tenant', {
      family_display_name: `${fullName}'s Family`,
      owner_full_name: fullName,
    });
    if (rpcError) {
      return { error: rpcError.message };
    }
  }

  redirect(`/${locale}/dashboard`);
}
