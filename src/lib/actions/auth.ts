'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { normalizePhoneNumber } from '@/lib/domain/phone';
import { recordReferralIfPresent } from '@/lib/domain/referrals';
import { capitalizeWords } from '@/lib/domain/names';
import { validatePassword } from '@/lib/domain/password';

export interface ActionResult {
  error?: string;
  message?: string;
  /** Set on success by an action that used to call next/navigation's
   * redirect() directly. The calling form navigates itself, client-side,
   * once this appears in the resolved state — see docs/DECISIONS.md
   * "Client-side navigation instead of redirect() inside a useFormState
   * action" for why: redirect() thrown from inside a useFormState-driven
   * Server Action was the root cause behind several hard-to-reproduce
   * client-side crashes reported during this build (sign-in, sign-up,
   * family sign-up, and story creation all shared this exact pattern). */
  redirectTo?: string;
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
  const referralCode = String(formData.get('referralCode') ?? '').trim();

  if (!email || !password || !fullName || !orgName) {
    return { error: 'All fields are required.' };
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
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
  const { data: newTenantId, error: rpcError } = await supabase.rpc('create_tenant', {
    tenant_name: capitalizeWords(orgName),
    tenant_slug: tenantSlugFrom(orgName),
    owner_full_name: capitalizeWords(fullName),
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  await recordReferralIfPresent(supabase, referralCode, newTenantId);

  return { redirectTo: `/${locale}/dashboard` };
}

/**
 * Finishes an organisation sign-up that arrived via Google: the OAuth
 * callback (src/app/api/auth/callback/route.ts) already created the
 * auth session but couldn't provision a tenant itself, since Google's
 * profile has no organisation name to give it — this action collects
 * that one missing field from an already-signed-in user and calls the
 * same create_tenant RPC signUpAction uses. Requires an active session
 * with no tenant yet; a signed-out visitor or one who already has a
 * tenant has nothing to complete here.
 */
export async function completeOrganisationSignupAction(locale: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Your session expired — sign in again.' };

  const existing = await getCurrentTenantContext(supabase);
  if (existing) return { redirectTo: `/${locale}/dashboard` };

  const orgName = String(formData.get('orgName') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const referralCode = String(formData.get('referralCode') ?? '').trim();
  if (!orgName || !fullName) {
    return { error: 'All fields are required.' };
  }

  const { data: newTenantId, error: rpcError } = await supabase.rpc('create_tenant', {
    tenant_name: capitalizeWords(orgName),
    tenant_slug: tenantSlugFrom(orgName),
    owner_full_name: capitalizeWords(fullName),
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  await recordReferralIfPresent(supabase, referralCode, newTenantId);

  return { redirectTo: `/${locale}/dashboard` };
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

  return { redirectTo: `/${locale}/dashboard` };
}

/** Same shape as AUTH_RATE_LIMIT, but keyed by the signed-in user's own
 * id rather than IP+email — this action already requires an active
 * session, so there's a real account identity to key on directly. */
const CHANGE_PASSWORD_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/**
 * Lets a signed-in user (with an email/password identity) change their
 * own password — there was previously no way to do this at all, which
 * would have made the new password-complexity rule (see
 * docs/DECISIONS.md "Password complexity requirement") unenforceable
 * for any existing account. Re-verifies the current password via a
 * fresh signInWithPassword call before allowing the change, rather than
 * trusting that an open session is still the account owner sitting at
 * the keyboard. Does NOT need email delivery (unlike a "forgot
 * password" reset for a signed-out user, which this app doesn't have —
 * see docs/NEEDS_FROM_ME.md on transactional email) since the user is
 * already authenticated.
 */
export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Not signed in.' };

  const hasPasswordIdentity = userData.user.identities?.some((identity) => identity.provider === 'email');
  if (!hasPasswordIdentity || !userData.user.email) {
    return { error: 'This account signs in with a phone code, not a password — there is nothing to change.' };
  }

  try {
    await enforceRateLimit(
      `auth:change-password:${userData.user.id}`,
      CHANGE_PASSWORD_RATE_LIMIT.limit,
      CHANGE_PASSWORD_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  if (!currentPassword || !newPassword) {
    return { error: 'All fields are required.' };
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (reauthError) return { error: 'Current password is incorrect.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { error: updateError.message };

  return { message: 'Password updated.' };
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
  const referralCode = String(formData.get('referralCode') ?? '').trim();

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
    const { data: newTenantId, error: rpcError } = await supabase.rpc('create_tenant', {
      tenant_name: capitalizeWords(orgName),
      tenant_slug: tenantSlugFrom(orgName),
      owner_full_name: capitalizeWords(fullName),
    });
    if (rpcError) {
      return { error: rpcError.message };
    }
    await recordReferralIfPresent(supabase, referralCode, newTenantId);
  }

  return { redirectTo: `/${locale}/dashboard` };
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

  return { redirectTo: `/${locale}/dashboard` };
}

export async function signOutAction(locale: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/sign-in`);
}

/** Same reasoning as OTP_SEND_RATE_LIMIT — Supabase's own email sending
 * has a low default rate limit, and this endpoint is otherwise a classic
 * email-bombing target (anyone can submit anyone else's address), so
 * blunt it per IP+email before Supabase's own limit ever gets hit. */
const PASSWORD_RESET_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

/**
 * Forgot-password, step 1: emails a reset link for a signed-out user.
 * Works for both organisation and family accounts identically — both
 * are plain Supabase email/password identities, and this app never
 * differentiates sign-in by account type (getCurrentTenantContext
 * figures out which one a session belongs to after the fact).
 *
 * Always returns the same generic success message regardless of
 * whether the address has an account — the same email-enumeration
 * reasoning as sendSignInOtpAction's shouldCreateUser:true above,
 * just for a channel (email) where Supabase's own API would otherwise
 * happily tell a caller "no user found" straight up.
 */
export async function requestPasswordResetAction(locale: string, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Enter your email address.' };

  try {
    const ip = await getClientIp();
    await enforceRateLimit(
      `auth:password-reset:${ip}:${email}`,
      PASSWORD_RESET_RATE_LIMIT.limit,
      PASSWORD_RESET_RATE_LIMIT.windowMs,
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/${locale}/reset-password`,
  });
  // Deliberately ignored on success/failure alike -- see the enumeration
  // note above. A real infra error (e.g. Supabase's email provider is
  // down) fails silently from the user's point of view, same tradeoff
  // sendSignInOtpAction already accepts for SMS.
  void error;

  return { message: 'If an account exists for that email, a reset link is on its way.' };
}

/**
 * Forgot-password, step 2: sets a new password once the user has
 * followed the emailed link. That link signs the browser into a
 * short-lived "recovery" session (Supabase's own mechanism, handled
 * client-side by the browser Supabase client reading the URL) — this
 * action runs after that, using the already-established recovery
 * session's cookies, exactly like changePasswordAction reuses an
 * existing session rather than taking one as input. No current-password
 * re-check here (unlike changePasswordAction): proving control of the
 * recovery link already IS the re-authentication step.
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: 'This reset link has expired or was already used — request a new one.' };
  }

  const newPassword = String(formData.get('newPassword') ?? '');
  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };

  return { message: 'Password updated — you can sign in with it now.' };
}
