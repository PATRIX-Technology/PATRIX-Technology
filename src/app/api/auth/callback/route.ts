import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { capitalizeWords } from '@/lib/domain/names';
import { isLocale, defaultLocale } from '@/i18n/config';

/**
 * Single landing point for every Supabase PKCE redirect this app uses:
 * "Continue with Google" (sign-in, org sign-up, family sign-up) and the
 * forgot-password email link. Both hand back a `?code=...` that only a
 * server-side exchangeCodeForSession can redeem -- the PKCE code_verifier
 * that pairs with it lives in a cookie @supabase/ssr's browser client set
 * when the flow started, readable here because a Route Handler (unlike a
 * Server Component) can both read and write cookies on the response. See
 * docs/DECISIONS.md "Google sign-in and forgot-password" for why this
 * needed its own route rather than living on /sign-in or /reset-password
 * directly: exchanging the code IS what establishes the session: nothing
 * downstream can be a plain Server Component render.
 *
 * `flow` says what to do once a session exists:
 * - "recovery": nothing to provision -- send them straight to
 *   /reset-password, session already active from the exchange.
 * - "signin": require an existing tenant; a Google identity with none
 *   yet (first click ever, on the sign-in page specifically) is told to
 *   sign up instead, same as verifySignInOtpAction's phone equivalent.
 * - "family": Google's profile already gives us a name, but nowhere to
 *   show the mandatory legal-agreement checkbox (PDPL requires an explicit,
 *   recorded consent, not one implied by this redirect) -- so first arrival
 *   lands on /family/sign-up/complete instead of provisioning anything
 *   here, exactly like the "org" branch below. That page's own action
 *   calls create_family_tenant once the checkbox is accepted. Re-arriving
 *   with a tenant already provisioned (a returning user who clicked the
 *   sign-up button instead of sign-in) just signs them in.
 * - "org": Google's profile has no organisation name to give us, so
 *   first arrival lands on /sign-up/complete-organisation instead of
 *   provisioning anything here -- that page's own action calls
 *   create_tenant once the name is typed. This route never creates an
 *   org tenant itself.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const flow = url.searchParams.get('flow') ?? 'signin';
  const rawLocale = url.searchParams.get('locale') ?? '';
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const referralCode = url.searchParams.get('ref')?.trim() ?? '';
  const refQuery = referralCode ? `&ref=${encodeURIComponent(referralCode)}` : '';

  if (!code) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in?authError=1`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchangeData.session) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in?authError=1`, request.url));
  }

  if (flow === 'recovery') {
    return NextResponse.redirect(new URL(`/${locale}/reset-password`, request.url));
  }

  const existing = await getCurrentTenantContext(supabase);
  if (existing) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  if (flow === 'signin') {
    // Mirrors verifySignInOtpAction: a brand-new Google identity with no
    // tenant is a mistaken sign-in click, not something to provision --
    // leaves a harmless orphan auth user, same accepted tradeoff as the
    // phone-OTP path.
    return NextResponse.redirect(new URL(`/${locale}/sign-up?googleNoAccount=1`, request.url));
  }

  const user = exchangeData.session.user;
  const googleFullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split('@')[0] ??
    'User';
  const fullName = capitalizeWords(googleFullName);

  if (flow === 'family') {
    return NextResponse.redirect(
      new URL(`/${locale}/family/sign-up/complete?fullName=${encodeURIComponent(fullName)}${refQuery}`, request.url),
    );
  }

  if (flow === 'org') {
    return NextResponse.redirect(
      new URL(`/${locale}/sign-up/complete-organisation?fullName=${encodeURIComponent(fullName)}${refQuery}`, request.url),
    );
  }

  return NextResponse.redirect(new URL(`/${locale}/sign-in?authError=1`, request.url));
}
