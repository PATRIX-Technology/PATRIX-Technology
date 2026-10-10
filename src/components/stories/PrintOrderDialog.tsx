'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { PrintOrderCurrency } from '@/lib/domain/print-orders';

/**
 * Orders a physical printed copy of an already-approved story. The
 * mandatory bilingual consent/sales-terms checkbox is the single gate on
 * "Pay Now" -- unchecked, the button stays disabled, no server round
 * -trip needed to enforce that (the actual enforcement is still
 * server-side: /api/print-orders/checkout rejects consentAccepted !==
 * true regardless of what the client sends).
 */
export function PrintOrderDialog({ storyId }: { storyId: string }) {
  const t = useTranslations('printOrder');
  const locale = useLocale();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<PrintOrderCurrency>(locale === 'ar' ? 'aed' : 'usd');
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState({
    shippingName: '',
    shippingPhone: '',
    shippingAddressLine1: '',
    shippingAddressLine2: '',
    shippingCity: '',
    shippingCountry: locale === 'ar' ? 'AE' : '',
  });

  const requiredFieldsFilled =
    fields.shippingName.trim() &&
    fields.shippingPhone.trim() &&
    fields.shippingAddressLine1.trim() &&
    fields.shippingCity.trim() &&
    /^[A-Za-z]{2}$/.test(fields.shippingCountry.trim());

  function update<K extends keyof typeof fields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePay() {
    setSubmitting(true);
    try {
      const response = await fetch('/api/print-orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          currency,
          consentAccepted: consentChecked,
          locale,
          ...fields,
          shippingCountry: fields.shippingCountry.trim().toUpperCase(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) {
        showToast({ title: t('errorTitle'), description: data.error ?? t('errorGeneric'), tone: 'error' });
        setSubmitting(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      showToast({ title: t('errorTitle'), description: t('errorGeneric'), tone: 'error' });
      setSubmitting(false);
    }
  }

  const payDisabled = submitting || !consentChecked || !requiredFieldsFilled;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('orderButton')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('dialogTitle')}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex gap-2" role="radiogroup" aria-label={t('currencyLabel')}>
            {(['aed', 'usd'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={currency === c}
                onClick={() => setCurrency(c)}
                className={`focus-ring rounded-lg border px-4 py-2 text-sm font-medium ${
                  currency === c
                    ? 'border-lagoon-600 bg-lagoon-600 text-white'
                    : 'border-[rgb(var(--color-border))] text-ink-700'
                }`}
              >
                {t(`price.${c}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={fields.shippingName}
              onChange={(e) => update('shippingName', e.target.value)}
              placeholder={t('fields.name')}
              className="focus-ring col-span-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-ink-900"
            />
            <input
              value={fields.shippingPhone}
              onChange={(e) => update('shippingPhone', e.target.value)}
              placeholder={t('fields.phone')}
              className="focus-ring col-span-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-ink-900"
            />
            <input
              value={fields.shippingAddressLine1}
              onChange={(e) => update('shippingAddressLine1', e.target.value)}
              placeholder={t('fields.addressLine1')}
              className="focus-ring col-span-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-ink-900"
            />
            <input
              value={fields.shippingAddressLine2}
              onChange={(e) => update('shippingAddressLine2', e.target.value)}
              placeholder={t('fields.addressLine2')}
              className="focus-ring col-span-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-ink-900"
            />
            <input
              value={fields.shippingCity}
              onChange={(e) => update('shippingCity', e.target.value)}
              placeholder={t('fields.city')}
              className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-ink-900"
            />
            <input
              value={fields.shippingCountry}
              onChange={(e) => update('shippingCountry', e.target.value.toUpperCase().slice(0, 2))}
              placeholder={t('fields.countryCode')}
              maxLength={2}
              className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm uppercase text-ink-900"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="space-y-2">
              <span className="block">{t('consentEn')}</span>
              <span dir="rtl" className="block text-end">
                {t('consentAr')}
              </span>
            </span>
          </label>

          <Button variant="primary" onClick={handlePay} disabled={payDisabled} isLoading={submitting}>
            {t('payNow', { price: t(`price.${currency}`) })}
          </Button>
        </div>
      </Modal>
    </>
  );
}
