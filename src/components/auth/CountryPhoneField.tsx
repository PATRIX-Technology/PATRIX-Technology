'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getPhoneCountryOptions, normalizePhoneNumber, type CountryCode } from '@/lib/domain/phone';

/**
 * A country picker + national-number input that together resolve to a
 * single E.164 phone number, reported via `onChange`. Every country
 * libphonenumber-js knows a numbering plan for is selectable — not just
 * the UAE — so someone can type their number however it's normally
 * written in their own country (with or without a leading trunk 0) and
 * this resolves it correctly either way.
 */
export function CountryPhoneField({
  label,
  defaultCountry = 'AE',
  onChange,
}: {
  label: string;
  defaultCountry?: CountryCode;
  onChange: (e164: string | null) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('auth.phone');
  const options = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [nationalNumber, setNationalNumber] = useState('');

  function update(nextCountry: CountryCode, nextNationalNumber: string) {
    setCountry(nextCountry);
    setNationalNumber(nextNationalNumber);
    onChange(nextNationalNumber ? normalizePhoneNumber(nextNationalNumber, nextCountry) : null);
  }

  const selected = options.find((option) => option.code === country);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-700">{label}</label>
      <div className="flex gap-2">
        <select
          aria-label={t('countryLabel')}
          value={country}
          onChange={(event) => update(event.target.value as CountryCode, nationalNumber)}
          className="focus-ring w-36 shrink-0 truncate rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-2 text-sm text-ink-900 sm:w-48"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name} (+{option.callingCode})
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={(event) => update(country, event.target.value)}
          placeholder={selected ? `+${selected.callingCode} …` : undefined}
          className="focus-ring min-w-0 flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-ink-900 placeholder:text-ink-400"
          required
        />
      </div>
    </div>
  );
}
