import { GiftPurchaseForm } from '@/components/gifts/GiftPurchaseForm';
import { Card } from '@/components/ui/Card';
import { flags } from '@/lib/flags';

export default function GiftPage({ params }: { params: { locale: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-lg">
        <h1 className="mb-2 font-display text-2xl text-ink-900">Give a personalised story</h1>
        <p className="mb-6 text-sm text-ink-600">
          Buy story credits for a family — they redeem the code with their own free family account and
          create a story starring their child.
        </p>
        {flags.billing ? (
          <GiftPurchaseForm locale={params.locale} />
        ) : (
          <p className="text-sm text-ink-500">
            Gift purchases aren&apos;t enabled on this deployment yet — see docs/NEEDS_FROM_ME.md. The
            purchase and redemption flow is built and tested; it activates once a Stripe account is
            connected.
          </p>
        )}
      </Card>
    </main>
  );
}
