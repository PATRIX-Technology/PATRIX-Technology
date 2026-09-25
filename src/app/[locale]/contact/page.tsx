import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/brand/Logo';
import { whatsappLink } from '@/lib/config/contact';

export default function ContactPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('contactPage');
  const brand = useTranslations('brand');
  const link = whatsappLink();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md text-center">
        <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-lagoon-900/50">
          <Logo size={30} variant="flat" />
        </span>
        <h1 className="mb-3 font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mb-6 text-ink-600">{t('body')}</p>

        {link ? (
          <a href={link} target="_blank" rel="noreferrer">
            <Button size="lg" leadingIcon={<WhatsAppIcon />}>
              {t('whatsappCta')}
            </Button>
          </a>
        ) : (
          <p className="rounded-lg border border-dashed border-[rgb(var(--color-border))] px-4 py-3 text-sm text-ink-500">
            {t('unavailable')}
          </p>
        )}

        <p className="mt-6 text-xs text-ink-500">{t('responseTime')}</p>

        <Link
          href={`/${params.locale}`}
          className="focus-ring mt-8 inline-block text-sm text-lagoon-600 hover:text-lagoon-500"
        >
          ← {brand('name')}
        </Link>
      </Card>
    </main>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.1 8.1 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5s-.6-1.5-.9-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3Z" />
    </svg>
  );
}
