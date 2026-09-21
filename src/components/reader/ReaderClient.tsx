'use client';

import { useRouter } from 'next/navigation';
import { StoryReader, type ReaderPage } from './StoryReader';
import type { Locale } from '@/i18n/config';

export function ReaderClient({
  locale,
  title,
  readerLocale,
  pages,
}: {
  locale: string;
  title: string;
  readerLocale: Locale;
  pages: ReaderPage[];
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50">
      <StoryReader
        title={title}
        locale={readerLocale}
        pages={pages}
        onClose={() => router.push(`/${locale}/dashboard/stories`)}
      />
    </div>
  );
}
