import { GiftSuccessStatus } from '@/components/gifts/GiftSuccessStatus';

export default function GiftSuccessPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { code?: string };
}) {
  const code = searchParams.code ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      {code ? (
        <GiftSuccessStatus locale={params.locale} code={code} />
      ) : (
        <p className="text-ink-600">Missing gift code.</p>
      )}
    </main>
  );
}
