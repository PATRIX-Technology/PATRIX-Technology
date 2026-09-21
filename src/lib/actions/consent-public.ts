'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';

export interface ConsentLookup {
  found: boolean;
  childFirstName?: string;
  organisationName?: string;
  status?: string;
  expiresAt?: string;
}

export async function getConsentInfo(token: string): Promise<ConsentLookup> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_consent_request_info', { raw_token: token });
  if (error || !data || !data.found) return { found: false };
  return {
    found: true,
    childFirstName: data.child_first_name,
    organisationName: data.organisation_name,
    status: data.status,
    expiresAt: data.expires_at,
  };
}

export interface RespondToConsentResult extends ActionResult {
  success?: boolean;
}

export async function respondToConsentAction(
  token: string,
  decision: 'granted' | 'declined',
): Promise<RespondToConsentResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('respond_to_consent', { raw_token: token, decision });
  if (error) return { error: error.message };
  return { success: true };
}
