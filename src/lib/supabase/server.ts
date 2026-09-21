import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Component / Route Handler / Server Action Supabase client. Still
 * uses only the anon key plus the caller's session cookie — RLS applies.
 * Never use this for operations that must bypass RLS; use
 * createSupabaseServiceRoleClient for that, and only in trusted server code
 * (webhooks, background workers, admin RPCs already gated on is_platform_owner()).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component with no request context to
          // mutate — safe to ignore, middleware refreshes the session.
        }
      },
    },
  });
}
