'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function markMfaEnrolledAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from('profiles').update({ mfa_enrolled: true }).eq('id', data.user.id);
}
