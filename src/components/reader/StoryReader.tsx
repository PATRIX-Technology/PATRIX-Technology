'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { localeDirection, type Locale } from '@/i18n/config';

export interface ReaderPage {
  pageNumber: number;
  text: string;
  imageUrl: string | null;
}

export function StoryReader({
  title,
  locale,
  pages,
  onClose,
}: {
  title: string;
  locale: Locale;
  pages: ReaderPage[];
  onClose?: () => void;
}) {
  const t = useTranslations('reader');
  const dir = localeDirection[locale];
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, next));
      setIndex(clamped);
    },
    [pages.length],
  );

  // In RTL, "next" is visually left but logically still "forward" — map
  // arrow keys to logical direction, not screen direction, matching how a
  // physical RTL book is read.
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrevious = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        dir === 'rtl' ? goPrevious() : goNext();
      } else if (event.key === 'ArrowLeft') {
        dir === 'rtl' ? goNext() : goPrevious();
      } else if (event.key === 'Escape') {
        onClose?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dir, goNext, goPrevious, onClose]);

  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = t('pageOf', { current: index + 1, total: pages.length });
    }
  }, [index, pages.length, t]);

  const page = pages[index];
  if (!page) return null;

  return (
    <div dir={dir} className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex items-center justify-between p-4">
        <h2 className="font-display text-lg">{title}</h2>
        {onClose && (
          <button onClick={onClose} className="focus-ring rounded-full p-2 hover:bg-white/10" aria-label={t('close')}>
            ✕
          </button>
        )}
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-6"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const delta = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          const swipedForward = dir === 'rtl' ? delta > 50 : delta < -50;
          const swipedBackward = dir === 'rtl' ? delta < -50 : delta > 50;
          if (swipedForward) goNext();
          if (swipedBackward) goPrevious();
          touchStartX.current = null;
        }}
      >
        <button
          type="button"
          onClick={goPrevious}
          disabled={index === 0}
          aria-label={t('previous')}
          className="focus-ring absolute start-2 z-10 rounded-full bg-white/10 p-3 disabled:opacity-30"
        >
          {dir === 'rtl' ? '›' : '‹'}
        </button>

        <div
          key={page.pageNumber}
          className="motion-safe:animate-[fadeIn_0.4s_ease] flex max-h-full max-w-xl flex-col items-center gap-6 text-center"
        >
          {page.imageUrl ? (
            <img
              src={page.imageUrl}
              alt={`Illustration for page ${page.pageNumber}`}
              className="max-h-[50vh] rounded-2xl object-contain shadow-2xl"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-white/10 text-sm text-white/60">
              Image unavailable
            </div>
          )}
          <p className="text-lg leading-relaxed">{page.text}</p>
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={index === pages.length - 1}
          aria-label={t('next')}
          className="focus-ring absolute end-2 z-10 rounded-full bg-white/10 p-3 disabled:opacity-30"
        >
          {dir === 'rtl' ? '‹' : '›'}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 p-4" role="tablist" aria-label="Pages">
        {pages.map((p, i) => (
          <button
            key={p.pageNumber}
            role="tab"
            aria-selected={i === index}
            aria-label={`Page ${p.pageNumber}`}
            onClick={() => goTo(i)}
            className={`focus-ring h-2.5 w-2.5 rounded-full transition-colors ${
              i === index ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      <div ref={liveRegionRef} aria-live="polite" className="sr-only" />
    </div>
  );
}
