'use client';

import { useState } from 'react';
import Image from 'next/image';
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
 */
export function StoryCarousel({
  pages,
  dir,
  title,
  prevLabel,
  nextLabel,
  pageLabel,
}: {
  pages: StoryCarouselPage[];
  dir: 'ltr' | 'rtl';
  title?: string;
  prevLabel: string;
  nextLabel: string;
  /** e.g. "Page {current} of {total}" already interpolated by the caller. */
  pageLabel: (current: number, total: number) => string;
}) {
  const [index, setIndex] = useState(0);
  const page = pages[index];
  if (!page) return null;

  // The carousel's own prev/next always mean "visually left/right,"
  // regardless of reading direction, so RTL swaps both which arrow
  // moves the index forward AND which arrow is disabled at each end —
  // a plain `index === 0` check on the visually-left button would be
  // backwards in RTL, where that button is the one moving forward.
  const isRtl = dir === 'rtl';
  const canGoPrev = isRtl ? index < pages.length - 1 : index > 0;
  const canGoNext = isRtl ? index > 0 : index < pages.length - 1;
  const goPrev = () => setIndex((i) => (isRtl ? Math.min(i + 1, pages.length - 1) : Math.max(i - 1, 0)));
  const goNext = () => setIndex((i) => (isRtl ? Math.max(i - 1, 0) : Math.min(i + 1, pages.length - 1)));

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
            aria-label={prevLabel}
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
                aria-label={pageLabel(i + 1, pages.length)}
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
            aria-label={nextLabel}
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
