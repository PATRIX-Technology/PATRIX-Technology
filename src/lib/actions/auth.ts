'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { normalizePhoneNumber } from '@/lib/domain/phone';

export interface ActionResult {
  error?: string;
  message?: string;
}

/** Auth attempts: 10 per IP per 5 minutes — generous for a real user who
 * mistyped a password a few times, tight enough to blunt credential
 * stuffing / signup-spam against a single-instance or Upstash-backed
 * limiter (see docs/DECISIONS.md "Rate limiting"). */
const AUTH_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/** OTP sends cost real money per SMS (via whatever provider is configured
 * in Supabase Auth — see docs/NEEDS_FROM_ME.md) — tighter than password
 * auth's rate limit specifically to blunt SMS-bombing a phone number,
 * not just credential stuffing. Keyed by IP+phone, same reasoning as
 * signInAction below. */
const OTP_SEND_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

function tenantSlugFrom(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

export async function signUpAction(locale: string, formData: FormData): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`auth:sign-up:${ip}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();
  const orgName = String(formData.get('orgName') ?? '').trim();

  if (!email || !password || !fullName || !orgName) {
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

  // signUp() with email confirmation disabled (dev/demo config) signs the
  // user in immediately; if confirmation is required in this Supabase
  // project, create_tenant will simply run the next time they verify and
  // sign in, since it is idempotent on the profile row.
  const { error: rpcError } = await supabase.rpc('create_tenant', {
    tenant_name: orgName,
    tenant_slug: tenantSlugFrom(orgName),
    owner_full_name: fullName,
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  redirect(`/${locale}/dashboard`);
}

export async function signInAction(locale: string, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim();

  try {
    const ip = await getClientIp();
    // Keyed by IP+email (not IP alone) so one noisy IP can't lock out
    // every account behind a shared NAT, while still blunting a targeted
    // password-guessing run against one account.
    await enforceRateLimit(
      `auth:sign-in:${ip}:${email}`,
      AUTH_RATE_LIMIT.limit,
      AUTH_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const password = String(formData.get('password') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'Incorrect email or password.' };
  }

  redirect(`/${locale}/dashboard`);
}

/**
 * Phone sign-up for a nursery, step 1 of 2: sends an OTP SMS. Org name
 * and full name are collected here too (not just the phone) and carried
 * through to step 2 as hidden form fields, since verifyNurserySignUpOtpAction
 * needs them to create the tenant and there's nowhere else to stash them
 * between two separate form submissions without a server-side session of
 * some kind.
 */
export async function sendNurserySignUpOtpAction(formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
  const orgName = String(formData.get('orgName') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();

  if (!phoneInput || !orgName || !fullName) {
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
 * Step 2: verifies the SMS code and completes the nursery sign-up. If
 * this phone number already belongs to an onboarded tenant (someone
 * landed on sign-up by mistake, or retried after already completing
 * sign-up once), skips create_tenant entirely and just logs them in —
 * calling create_tenant a second time for the same user would create a
 * second, duplicate tenant, since it has no "already exists" guard of
 * its own.
 */
export async function verifyNurserySignUpOtpAction(locale: string, formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const orgName = String(formData.get('orgName') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();

  const phone = normalizePhoneNumber(phoneInput);
  if (!phone || !token) {
    return { error: 'Enter the code we sent you.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (verifyError) {
    return { error: verifyError.message };
  }

  const existing = await getCurrentTenantContext(supabase);
  if (!existing) {
    if (!orgName || !fullName) {
      return { error: 'Missing your organisation name — go back and try again.' };
    }
    const { error: rpcError } = await supabase.rpc('create_tenant', {
      tenant_name: orgName,
      tenant_slug: tenantSlugFrom(orgName),
      owner_full_name: fullName,
    });
    if (rpcError) {
      return { error: rpcError.message };
    }
  }

  redirect(`/${locale}/dashboard`);
}

/**
 * Phone sign-in, step 1 of 2. Deliberately uses shouldCreateUser: true,
 * the same as sign-up — NOT false. Using false would make Supabase
 * return a distinguishable error right here for a phone number with no
 * account, before the caller has proven they actually control that
 * number — a classic enumeration side-channel (try a list of numbers,
 * see which ones say "no account" vs send a code). Instead, the
 * "no account" case surfaces from verifySignInOtpAction below, AFTER a
 * real SMS code has been entered — at that point only the true owner of
 * the phone (or someone who already compromised their SMS) can ever
 * reach it, which is a safe place to reveal it.
 */
export async function sendSignInOtpAction(formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
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
 * Step 2: verifies the code, then requires an EXISTING tenant — sign-in
 * never provisions one. A phone number with no tenant here means
 * sendSignInOtpAction's shouldCreateUser:true just created a fresh,
 * blank auth user for a number that was never actually signed up (a
 * harmless orphan row, the same tradeoff email auth already has for an
 * unconfirmed signup that's never completed) — tell them to sign up
 * properly instead of quietly dropping them into an account with no
 * organisation.
 */
export async function verifySignInOtpAction(locale: string, formData: FormData): Promise<ActionResult> {
  const phoneInput = String(formData.get('phone') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
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
    return { error: 'No account found for that number — sign up instead.' };
  }

  redirect(`/${locale}/dashboard`);
}

export async function signOutAction(locale: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/sign-in`);
}
