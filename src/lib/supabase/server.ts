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
 *
 * @supabase/ssr 0.5.2's applyServerStorage always writes its OWN 400-day
 * maxAge onto the Set-Cookie it sends to our setAll below, discarding
 * whatever maxAge we pass in cookieOptions (verified by calling its
 * exported applyServerStorage directly) -- so the 30-day intent above
 * never actually reached the browser. setAll re-applies the real value
 * itself rather than trusting the options it's handed.
 */
const PERSISTED_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

/**
 * @param rememberMe When false, the session cookie is written with no
 * maxAge/expires at all, so the browser treats it as a session cookie
 * and drops it when the browser (not just the tab) closes -- the
 * "keep me signed in" checkbox's unchecked state. Defaults to true:
 * every call site without that checkbox (password reset, MFA, etc.)
 * keeps today's always-persistent behaviour.
 */
export async function createSupabaseServerClient(rememberMe = true) {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const { maxAge: _ignoredLibraryMaxAge, expires: _ignoredLibraryExpires, ...rest } = options;
            const sessionLifetime = options.maxAge === 0 ? { maxAge: 0 } : rememberMe ? { maxAge: PERSISTED_MAX_AGE } : {};
            cookieStore.set(name, value, { ...rest, ...sessionLifetime });
          });
        } catch {
          // Called from a Server Component with no request context to
          // mutate — safe to ignore, middleware refreshes the session.
        }
      },
    },
  });
}
