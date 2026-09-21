'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';

export interface ActionResult {
  error?: string;
  message?: string;
}

/** Auth attempts: 10 per IP per 5 minutes — generous for a real user who
 * mistyped a password a few times, tight enough to blunt credential
 * stuffing / signup-spam against a single-instance or Upstash-backed
 * limiter (see docs/DECISIONS.md "Rate limiting"). */
const AUTH_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

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
  const slug = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const { error: rpcError } = await supabase.rpc('create_tenant', {
    tenant_name: orgName,
    tenant_slug: slug,
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

export async function signOutAction(locale: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/sign-in`);
}
