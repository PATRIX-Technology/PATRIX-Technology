'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

export interface StoryCarouselPage {
  pageNumber: number;
  imageSrc: string;
  /** Drawn as an overlay caption band, in the script-appropriate font
   * (Fraunces for English, Noto Kufi Arabic for Arabic). Unlike the
   * printed PDF -- where the Arabic caption is baked into the
   * illustration itself by Gemini, since no PDF text-drawing approach
   * shapes Arabic correctly (see docs/DECISIONS.md "Arabic captions
   * baked into the illustration") -- this carousel draws BOTH languages
   * itself: Gemini kept adding tashkeel/harakat to the baked-in Arabic
   * caption despite the prompt explicitly forbidding it (confirmed
   * across two separate real generations), so the source images here
   * have that band cropped off and this clean, correctly-shaped,
   * diacritic-free text drawn in its place instead -- the same reliable
   * path English already uses. See docs/DECISIONS.md "Real sample
   * stories generated for the landing/home page carousel". */
  caption?: string;
}

/** Same caption-band colour as the printed PDF's CAPTION_BANNER_COLOR
 * (src/lib/providers/pdf/render.ts) -- rgb(0.855, 0.914, 0.851). */
const CAPTION_BAND_COLOR = '#dae9d9';
/** Same caption-text colour as the PDF's INK_COLOR -- a literal dark
 * ink, not this app's `ink-900` token: that token means "near-white,
 * for text on this app's own dark surfaces" (see tailwind.config.ts),
 * which is illegible on this light caption band. The band is styled to
 * match a printed page, not the app's dark-first chrome around it. */
const CAPTION_TEXT_COLOR = '#241c16';

/**
 * A framed, swipeable preview of a real generated story (not a PDF) —
 * used identically on the public landing page and the dashboard home
 * tab. Styled as a plain instance of this app's own `Card` (same
 * border/surface/shadow tokens) rather than a bespoke frame, and the
 * image itself carries no overlay decoration -- both pages already
 * show the Ownly logo in their own header, so repeating it as a badge
 * on top of the illustration read as a sticker, not a frame. Deliberately
 * its own small state machine (not a full carousel library) since it
 * only ever needs four pages and prev/next/dot navigation — see
 * docs/DECISIONS.md "Real sample stories generated for the landing/home
 * page carousel".
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
      <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-3 shadow-card">
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
            <div
              className="absolute inset-x-0 bottom-0 px-5 py-4 text-center"
              style={{ backgroundColor: CAPTION_BAND_COLOR, opacity: 0.96 }}
            >
              <p
                className={`text-sm font-semibold sm:text-base ${dir === 'rtl' ? 'font-arabic' : 'font-display'}`}
                style={{ color: CAPTION_TEXT_COLOR }}
              >
                {page.caption}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label={common('previous')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-100 disabled:pointer-events-none disabled:opacity-30"
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
                  i === index ? 'w-5 bg-lagoon-500' : 'w-1.5 bg-ink-200'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label={common('next')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-ink-100 disabled:pointer-events-none disabled:opacity-30"
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
