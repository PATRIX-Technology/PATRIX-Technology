'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
  message?: string;
}

export async function signUpAction(locale: string, formData: FormData): Promise<ActionResult> {
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
