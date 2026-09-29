'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Uses the anon key only — every table it can
 * reach is protected by RLS, so this client can never read across tenants
 * regardless of what the client-side code does.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Keep in sync with src/lib/supabase/server.ts's COOKIE_OPTIONS —
      // see its comment for why secure/maxAge are tightened but httpOnly
      // stays false. Both must agree: whichever set the cookie last
      // (server render vs. a client-side auth call) determines its
      // actual attributes for the browser.
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      },
    },
  );
}
