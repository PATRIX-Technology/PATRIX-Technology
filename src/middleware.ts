import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from './i18n/config';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

/**
 * Supabase's access token expires after an hour; the SDK refreshes it
 * using a refresh token that ROTATES on every use — the old one stops
 * working the instant a new one is issued. Server Components can't set
 * cookies at all (a hard Next.js constraint), so any refresh that
 * happened while rendering one was silently discarded: the rotated
 * refresh token never made it back into the browser's cookie, so the
 * next request replayed the now-dead old one and got logged out
 * outright. This is why closing the tab and coming back later (or just
 * browsing for a while) demanded signing in again, even though cookies
 * were never actually cleared. Middleware is the one place per request
 * that CAN read and rewrite cookies before any Server Component
 * renders, so it's the only reliable place to keep the refresh in sync
 * -- this runs auth.getUser() (which refreshes if needed) and writes
 * any resulting cookies onto the exact response next-intl is about to
 * return, so a locale redirect/rewrite never drops a refreshed session.
 */
export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
