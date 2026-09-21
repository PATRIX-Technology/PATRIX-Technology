'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import type { ActionResult } from './auth';

const AUTH_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

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
