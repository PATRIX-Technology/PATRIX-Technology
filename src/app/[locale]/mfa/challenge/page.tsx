import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';

/** See src/app/[locale]/mfa/enroll/page.tsx for why this is a standalone
 * top-level route rather than nested under (dashboard). */
export default async function DashboardMfaChallengePage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/${params.locale}/sign-in`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <MfaChallengeForm redirectTo={`/${params.locale}/dashboard`} />
    </main>
  );
}
