import type { Metadata, Viewport } from 'next';
import { Fraunces, Manrope, Noto_Kufi_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { isLocale, localeDirection, locales } from '@/i18n/config';
import { notFound } from 'next/navigation';
import '../../styles/globals.css';
import { ToastProvider } from '@/components/ui/Toast';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const arabic = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'Khayali — Personalised storybooks for nurseries & schools',
  description:
    'Khayali creates personalised, illustrated storybooks that teach children values and habits — built for nurseries, schools, clinics and children\'s brands.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#2FBFA6',
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = localeDirection[params.locale];

  return (
    <html lang={params.locale} dir={dir} className={`${display.variable} ${body.variable} ${arabic.variable}`}>
      <body className="min-h-screen antialiased">
        <a href="#main-content" className="skip-link focus-ring">
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>
            <div id="main-content">{children}</div>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
