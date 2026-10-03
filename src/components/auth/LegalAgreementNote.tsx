import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Renders `auth.signUp.legalAgreement`'s two `{terms}`/`{privacy}` tokens as
// real links. Built as a manual split rather than `t.rich(...)` with
// function-returning tags: that pattern breaks RSC flight serialization on
// these server-rendered sign-up pages ("Functions are not valid as a child
// of Client Components") since the tag functions can't cross the boundary.
export function LegalAgreementNote({ locale }: { locale: string }) {
  const t = useTranslations('auth.signUp');
  const [beforeTerms, rest] = t.raw('legalAgreement').split('{terms}');
  const [betweenLinks, afterPrivacy] = rest.split('{privacy}');

  return (
    <p className="mt-4 text-center text-xs text-ink-500">
      {beforeTerms}
      <Link href={`/${locale}/legal?tab=tos`} className="font-medium text-lagoon-600">
        {t('termsLink')}
      </Link>
      {betweenLinks}
      <Link href={`/${locale}/legal?tab=privacy`} className="font-medium text-lagoon-600">
        {t('privacyLink')}
      </Link>
      {afterPrivacy}
    </p>
  );
}
