import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Component / Route Handler / Server Action Supabase client. Still
 * uses only the anon key plus the caller's session cookie — RLS applies.
 * Never use this for operations that must bypass RLS; use
 * createSupabaseServiceRoleClient for that, and only in trusted server code
 * (webhooks, background workers, admin RPCs already gated on is_platform_owner()).
 */
/**
 * @supabase/ssr's own defaults are secure: false (no Secure attribute at
 * all, so the cookie would ride over plain HTTP too) and maxAge: 400 days
 * (its absolute ceiling — https://developer.chrome.com/blog/cookie-max-age-expires
 * — chosen so the library never silently exceeds what browsers allow, not
 * because 400 days is an appropriate session lifetime for this app).
 * httpOnly stays false deliberately, not by oversight: the browser
 * client (createSupabaseBrowserClient) reads this same cookie via
 * document.cookie to attach the session to its own requests — the SSR
 * cookie-based auth flow this app uses cannot work at all without that
 * read access. See docs/DECISIONS.md "Session cookie hardening".
 */
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days, not @supabase/ssr's 400-day ceiling
};

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: COOKIE_OPTIONS,
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
