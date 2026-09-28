import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MfaEnrollForm } from '@/components/auth/MfaEnrollForm';

/**
 * Optional MFA enrollment for regular tenant users (nursery/family/staff
 * accounts) — see docs/DECISIONS.md "Optional-but-recommended MFA for
 * regular users". Deliberately a standalone top-level route, not nested
 * under the (dashboard) route group's layout: that layout is exactly
 * what redirects here on a 'needs_challenge' status (see
 * src/app/[locale]/(dashboard)/layout.tsx), so nesting this page inside
 * it would create a redirect loop — same reasoning already documented
 * for why the owner MFA pages don't share a layout with /owner.
 */
export default async function DashboardMfaEnrollPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/${params.locale}/sign-in`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <MfaEnrollForm redirectTo={`/${params.locale}/dashboard`} />
    </main>
  );
}
