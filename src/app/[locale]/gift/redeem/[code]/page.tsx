import Link from 'next/link';
import { getGiftStatus } from '@/lib/actions/gifts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RedeemGiftButton } from '@/components/gifts/RedeemGiftButton';

export default async function RedeemGiftPage({
  params,
}: {
  params: { locale: string; code: string };
}) {
  const gift = await getGiftStatus(params.code);
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md text-center">
        {!gift.found ? (
          <p className="text-coral-600">This gift code is invalid.</p>
        ) : gift.status === 'redeemed' ? (
          <p className="text-ink-600">This gift has already been redeemed.</p>
        ) : gift.status !== 'paid' ? (
          <p className="text-ink-600">This gift is still being processed. Please try again shortly.</p>
        ) : !context ? (
          <>
            <h1 className="mb-2 font-display text-xl text-ink-900">You&apos;ve received a gift!</h1>
            <p className="mb-6 text-ink-600">
              {gift.storyCredits} personalised story credit{gift.storyCredits === 1 ? '' : 's'} — sign in or
              create a free family account to redeem it.
            </p>
            <div className="flex flex-col gap-2">
              <Link href={`/${params.locale}/family/sign-up`}>
                <Button className="w-full">Create a family account</Button>
              </Link>
              <Link href={`/${params.locale}/sign-in`}>
                <Button variant="secondary" className="w-full">
                  Sign in
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-2 font-display text-xl text-ink-900">You&apos;ve received a gift!</h1>
            <p className="mb-6 text-ink-600">
              {gift.storyCredits} personalised story credit{gift.storyCredits === 1 ? '' : 's'} for{' '}
              {context.tenantName}.
            </p>
            <RedeemGiftButton code={params.code} />
          </>
        )}
      </Card>
    </main>
  );
}
