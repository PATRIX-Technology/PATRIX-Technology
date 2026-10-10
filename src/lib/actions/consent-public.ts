'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { ActionResult } from './auth';

export interface ConsentLookup {
  found: boolean;
  childFirstName?: string;
  organisationName?: string;
  status?: string;
  expiresAt?: string;
  requestsPhoto?: boolean;
  /** True only when this request's scope includes photo AND staff
   * supplied a parent phone number when generating the link (migration
   * 0036) — i.e. whether the OTP step below must be completed before
   * respondToConsentAction will be accepted by the database. */
  otpRequired?: boolean;
  otpVerified?: boolean;
  /** e.g. "******34" — never the full number; see
   * get_consent_request_info in migration 0036. */
  parentPhoneMasked?: string;
}

/**
 * Consent tokens are 24 random bytes (~192 bits) — brute-forcing one is
 * computationally infeasible regardless of rate limiting. These limits
 * are defence-in-depth (per the product brief's "rate limiting where
 * appropriate"), not the primary protection, so they're generous enough
 * that a parent refreshing the page a few times never gets blocked.
 */
const CONSENT_LOOKUP_RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };
const CONSENT_RESPOND_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/** OTP sends cost real money per SMS (same reasoning as auth.ts's
 * OTP_SEND_RATE_LIMIT) — keyed by IP+token rather than IP+phone since
 * this action never receives the raw phone from the client, only the
 * token; a token is unique per consent request, so this still blunts
 * repeated SMS-bombing of one request's phone number. */
const CONSENT_OTP_SEND_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };
const CONSENT_OTP_VERIFY_RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

export async function getConsentInfo(token: string): Promise<ConsentLookup> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:lookup:${ip}`,
      CONSENT_LOOKUP_RATE_LIMIT.limit,
      CONSENT_LOOKUP_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { found: false };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_consent_request_info', { raw_token: token });
  if (error || !data || !data.found) return { found: false };
  return {
    found: true,
    childFirstName: data.child_first_name,
    organisationName: data.organisation_name,
    status: data.status,
    expiresAt: data.expires_at,
    requestsPhoto: Boolean(data.requests_photo),
    otpRequired: Boolean(data.otp_required),
    otpVerified: Boolean(data.otp_verified),
    parentPhoneMasked: data.parent_phone_masked ?? undefined,
  };
}

/**
 * Sends an SMS OTP to the phone on file for a photo-scoped consent
 * request, so the public page can prove the person responding actually
 * holds that number before respondToConsentAction will be accepted (the
 * database enforces this independently — see respond_to_consent in
 * migration 0036). Reuses Supabase Auth's phone-OTP mechanism purely to
 * verify phone ownership, not to sign anyone in — see
 * verifyConsentOtpAction below, which signs the resulting session back
 * out immediately. There is no standalone "verify phone, no session"
 * primitive in this codebase (auth.ts's OTP actions are all tied to
 * full account sign-in/sign-up), so this is the lightest reuse available
 * without hand-rolling a second OTP/SMS mechanism alongside Twilio.
 */
export async function sendConsentOtpAction(token: string): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:otp-send:${ip}:${token}`,
      CONSENT_OTP_SEND_RATE_LIMIT.limit,
      CONSENT_OTP_SEND_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data: phone, error: lookupError } = await supabase.rpc('send_consent_otp_target', {
    raw_token: token,
  });
  if (lookupError || !phone) {
    return { error: 'This consent link does not require phone verification, or has expired.' };
  }

  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) return { error: error.message };
  return { message: 'Verification code sent.' };
}

export interface VerifyConsentOtpResult extends ActionResult {
  success?: boolean;
}

export async function verifyConsentOtpAction(token: string, code: string): Promise<VerifyConsentOtpResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:otp-verify:${ip}:${token}`,
      CONSENT_OTP_VERIFY_RATE_LIMIT.limit,
      CONSENT_OTP_VERIFY_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data: phone, error: lookupError } = await supabase.rpc('send_consent_otp_target', {
    raw_token: token,
  });
  if (lookupError || !phone) {
    return { error: 'This consent link does not require phone verification, or has expired.' };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
  if (verifyError) return { error: 'That code is incorrect or has expired.' };

  // This page never signs anyone into an account — verifyOtp was used
  // purely to prove phone ownership, so the session it created as a side
  // effect is dropped immediately, before it could ever be mistaken for
  // a real sign-in by anything else reading these cookies.
  await supabase.auth.signOut();

  const { error: markError } = await supabase.rpc('mark_consent_otp_verified', { raw_token: token });
  if (markError) return { error: markError.message };

  return { success: true };
}

export interface RespondToConsentResult extends ActionResult {
  success?: boolean;
}

export async function respondToConsentAction(
  token: string,
  decision: 'granted' | 'declined',
): Promise<RespondToConsentResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `consent:respond:${ip}`,
      CONSENT_RESPOND_RATE_LIMIT.limit,
      CONSENT_RESPOND_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('respond_to_consent', { raw_token: token, decision });
  if (error) return { error: error.message };
  return { success: true };
}
