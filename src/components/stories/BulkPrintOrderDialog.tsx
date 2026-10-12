'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  getNextPrintOrderTier,
  getPrintOrderBulkTier,
  getPrintOrderDeliveryFeeMinor,
  getPrintOrderUnitPriceMinor,
  type PrintOrderCurrency,
} from '@/lib/domain/print-orders';
import type { TenantType } from '@/types/database';

export interface BulkPrintOrderItem {
  storyId: string;
  childName: string;
  title: string;
  locale: string;
}

/**
 * Orders printed copies for several approved stories at once, paid for
 * together in a single Stripe Checkout session -- the bulk counterpart to
 * PrintOrderDialog (one story), opened from the stories list's "Select"
 * mode. One shared shipping address and currency for the whole batch,
 * same as a nursery shipping one box of books to one address. See
 * docs/DECISIONS.md "Bulk print ordering, paid online, replaces the
 * WhatsApp no-payment bypass" -- this is the real fix for "let nurseries
 * order a bulk batch and pay online, with the owner notified after
 * payment to forward to the printer", replacing the old per-story
 * WhatsApp flow that let a customer skip paying online entirely.
 */
export function BulkPrintOrderDialog({
  items,
  open,
  onClose,
  tenantType,
}: {
  items: BulkPrintOrderItem[];
  open: boolean;
  onClose: () => void;
  tenantType: TenantType;
}) {
  const t = useTranslations('printOrder');
  const locale = useLocale();
  const showToast = useToast();
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

  const unitPrice = getPrintOrderUnitPriceMinor(items.length, currency) / 100;
  const copiesTotal = unitPrice * items.length;
  const bulkTier = getPrintOrderBulkTier(items.length);
  const nextTier = getNextPrintOrderTier(items.length);
  const deliveryFeeMinor = getPrintOrderDeliveryFeeMinor(items.length, currency);
  const deliveryFee = deliveryFeeMinor / 100;
  const total = copiesTotal + deliveryFee;

  async function handlePay() {
    setSubmitting(true);
    try {
      const response = await fetch('/api/print-orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyIds: items.map((item) => item.storyId),
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

  const payDisabled = submitting || items.length === 0 || !consentChecked || !requiredFieldsFilled;

  return (
    <Modal open={open} onClose={onClose} title={t('bulkDialogTitle', { count: items.length })}>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-lg border border-[rgb(var(--color-border))] p-3 text-sm">
          {items.map((item) => (
            <div key={item.storyId} className="flex items-center justify-between gap-3 text-ink-700">
              <span className="truncate">
                {item.title} <span className="text-ink-500">— {item.childName}</span>
              </span>
              <span className="shrink-0 text-ink-500">{item.locale.toUpperCase()}</span>
            </div>
          ))}
        </div>

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

        <div className="space-y-0.5">
          <p className="text-sm text-ink-600">
            {t('bulkCopiesSubtotal', { count: items.length, total: `${copiesTotal.toFixed(2)} ${currency.toUpperCase()}` })}
          </p>
          <p className="text-xs text-ink-500">
            {t('bulkPerCopy', { price: `${unitPrice.toFixed(2)} ${currency.toUpperCase()}` })}
          </p>
          <p className="text-xs text-ink-500">
            {deliveryFeeMinor > 0
              ? t('deliveryFee', { price: `${deliveryFee.toFixed(2)} ${currency.toUpperCase()}` })
              : t('bulkFreeDelivery')}
          </p>
          <p className="text-sm font-semibold text-ink-900">
            {t('bulkGrandTotal', { total: `${total.toFixed(2)} ${currency.toUpperCase()}` })}
          </p>
        </div>
        {bulkTier && (
          <p className="rounded-lg bg-lagoon-900/30 px-3 py-2 text-xs text-lagoon-300">
            {locale === 'ar' ? bulkTier.label.ar : bulkTier.label.en}
            {bulkTier.freeDelivery && ` — ${t('bulkFreeDelivery')}`}
          </p>
        )}
        {nextTier && items.length > 0 && (
          <p className="rounded-lg bg-saffron-900/30 px-3 py-2 text-xs text-saffron-300">
            {t(nextTier.tier.freeDelivery ? 'bulkNextTierNudgeFreeDelivery' : 'bulkNextTierNudge', {
              count: nextTier.copiesNeeded,
              price: `${(nextTier.tier.priceMinor[currency] / 100).toFixed(2)} ${currency.toUpperCase()}`,
            })}
          </p>
        )}

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
            <span className="block">{t(tenantType === 'nursery' ? 'consentNurseryEn' : 'consentFamilyEn')}</span>
            <span dir="rtl" className="block text-end">
              {t(tenantType === 'nursery' ? 'consentNurseryAr' : 'consentFamilyAr')}
            </span>
          </span>
        </label>

        <Button variant="primary" onClick={handlePay} disabled={payDisabled} isLoading={submitting}>
          {t('bulkPayNow', { total: `${total.toFixed(2)} ${currency.toUpperCase()}` })}
        </Button>
      </div>
    </Modal>
  );
}
