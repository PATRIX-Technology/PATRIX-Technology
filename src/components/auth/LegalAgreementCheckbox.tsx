import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Renders `auth.signUp.legalAgreement`'s two `{terms}`/`{privacy}` tokens as
// real links, same manual-split reasoning as the old LegalAgreementNote (see
// docs/DECISIONS.md) — but as a required checkbox INSIDE the sign-up form,
// not passive text below it. PDPL calls for an explicit, recorded consent
// action, not one implied by continuing past a note; every sign-up/complete
// server action re-checks this server-side via hasAcceptedLegalTerms, since
// the `required` attribute alone is only a client-side nicety.
export function LegalAgreementCheckbox({
  locale,
  checked,
  onChange,
}: {
  locale: string;
  /** Pass both for a controlled checkbox (needed by the two-step phone
   * flows, which must carry the checked state across to step 2's form as
   * a hidden input). Omit both to use the input uncontrolled, which is
   * all a single-step form needs. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const t = useTranslations('auth.signUp');
  const [beforeTerms, rest] = t.raw('legalAgreement').split('{terms}');
  const [betweenLinks, afterPrivacy] = rest.split('{privacy}');

  return (
    <label className="flex items-start gap-2 text-xs text-ink-600">
      <input
        type="checkbox"
        name="legalAccepted"
        value="true"
        required
        {...(onChange
          ? { checked: checked ?? false, onChange: (event) => onChange(event.target.checked) }
          : {})}
        className="focus-ring mt-0.5 h-4 w-4 shrink-0 rounded border-[rgb(var(--color-border))]"
      />
      <span>
        {beforeTerms}
        <Link
          href={`/${locale}/legal?tab=tos`}
          target="_blank"
          className="font-medium text-lagoon-600 underline"
        >
          {t('termsLink')}
        </Link>
        {betweenLinks}
        <Link
          href={`/${locale}/legal?tab=privacy`}
          target="_blank"
          className="font-medium text-lagoon-600 underline"
        >
          {t('privacyLink')}
        </Link>
        {afterPrivacy}
      </span>
    </label>
  );
}
