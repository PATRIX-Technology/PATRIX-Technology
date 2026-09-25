import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/**
 * Shared split-panel shell for the auth pages (sign in, sign up, family
 * sign up): brand art on one side, the form on the other. The art panel
 * collapses away on small screens so mobile just gets the form.
 */
export function AuthShell({
  locale,
  eyebrow,
  tagline,
  children,
}: {
  locale: string;
  eyebrow: string;
  tagline: string;
  children: ReactNode;
}) {
  const heroImage = locale === 'ar' ? '/images/marketing/hero-ar.jpg' : '/images/marketing/hero-en.jpg';

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex"
        style={{
          background:
            'radial-gradient(1.5px 1.5px at 15% 20%, rgba(244,241,232,0.5) 0, transparent 60%),' +
            'radial-gradient(1px 1px at 40% 75%, rgba(244,241,232,0.4) 0, transparent 60%),' +
            'radial-gradient(1.5px 1.5px at 75% 30%, rgba(244,241,232,0.45) 0, transparent 60%),' +
            'radial-gradient(1px 1px at 88% 65%, rgba(244,241,232,0.35) 0, transparent 60%),' +
            'linear-gradient(160deg, #1c1e42 0%, #14152b 55%, #100f22 100%)',
        }}
      >
        <Link href={`/${locale}`} className="focus-ring flex items-center gap-2.5 font-display text-lg text-ink-900">
          <Logo size={28} variant="flat" />
          Khayali
        </Link>
        <div className="relative mx-auto w-full max-w-xs">
          <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-ink-100 shadow-card">
            <Image src={heroImage} alt="" fill sizes="320px" className="object-cover" />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-saffron-400">{eyebrow}</p>
          <p className="max-w-sm font-display text-xl text-ink-900">{tagline}</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[rgb(var(--color-bg))] px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            href={`/${locale}`}
            className="focus-ring mb-8 flex items-center gap-2.5 font-display text-lg text-ink-900 lg:hidden"
          >
            <Logo size={26} variant="flat" />
            Khayali
          </Link>
          {children}
        </div>
      </div>
    </main>
  );
}
