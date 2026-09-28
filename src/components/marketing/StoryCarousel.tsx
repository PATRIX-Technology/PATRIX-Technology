'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';

export interface StoryCarouselPage {
  pageNumber: number;
  imageSrc: string;
  /** English pages draw their caption as an overlay band (matches the
   * printed PDF); Arabic pages don't need this — the caption is already
   * baked into the illustration itself by Gemini, same as the PDF. */
  caption?: string;
}

/**
 * A framed, swipeable preview of a real generated story (not a PDF) —
 * used identically on the public landing page and the dashboard home
 * tab. Deliberately its own small state machine (not a full carousel
 * library) since it only ever needs four pages and prev/next/dot
 * navigation — see docs/DECISIONS.md "Real sample stories generated
 * for the landing/home page carousel".
 *
 * Reads its own translations via useTranslations rather than taking
 * prevLabel/nextLabel/pageLabel as props: this is a Client Component
 * rendered from Server Component pages (the landing page, the dashboard
 * home tab), and a function prop like `pageLabel` can't cross that
 * boundary -- Next.js can't serialize it and the page 500s.
 */
export function StoryCarousel({
  pages,
  dir,
  title,
}: {
  pages: StoryCarouselPage[];
  dir: 'ltr' | 'rtl';
  title?: string;
}) {
  const common = useTranslations('common');
  const [index, setIndex] = useState(0);
  const page = pages[index];
  if (!page) return null;

  // Deliberately NOT direction-aware: prev always decrements, next always
  // increments. The buttons' physical left/right position already flips
  // under dir="rtl" for free, because flexbox's row start/end are
  // inline-start/inline-end (the same mechanism that mirrors the dots
  // below without any index math). Swapping the increment direction too
  // would double-flip it back to the LTR physical layout.
  const canGoPrev = index > 0;
  const canGoNext = index < pages.length - 1;
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));
  const goNext = () => setIndex((i) => Math.min(i + 1, pages.length - 1));

  return (
    <div className="mx-auto w-full max-w-sm" dir={dir}>
      <div
        className="relative overflow-hidden rounded-[1.75rem] p-3 shadow-card"
        style={{
          background: 'linear-gradient(150deg, #1c1e42 0%, #14152b 55%, #100f22 100%)',
        }}
      >
        <div className="relative aspect-[5/7] w-full overflow-hidden rounded-2xl bg-[rgb(var(--color-surface))]">
          <Image
            key={page.imageSrc}
            src={page.imageSrc}
            alt=""
            fill
            sizes="(max-width: 768px) 90vw, 360px"
            className="object-cover"
          />
          {page.caption ? (
            <div className="absolute inset-x-0 bottom-0 bg-[#dbe9d9]/95 px-5 py-4 text-center">
              <p className="font-display text-sm text-ink-900 sm:text-base">{page.caption}</p>
            </div>
          ) : null}
          <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[#14152B]/85">
            <Logo size={16} variant="flat" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label={common('previous')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-opacity disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-1.5">
            {pages.map((p, i) => (
              <button
                key={p.pageNumber}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={common('pageOf', { current: i + 1, total: pages.length })}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-lagoon-400' : 'w-1.5 bg-white/25'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label={common('next')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-opacity disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {title ? <p className="mt-3 text-center text-sm font-medium text-ink-600">{title}</p> : null}
    </div>
  );
}
