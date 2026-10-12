'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updatePrintOrderBatchStatusAction } from '@/lib/actions/print-orders';
import { canAdvancePrintOrderStatus } from '@/lib/domain/print-orders';

type AdvanceableStatus = 'printing' | 'shipped' | 'cancelled';
const ALL_ADVANCEABLE_STATUSES: AdvanceableStatus[] = ['printing', 'shipped', 'cancelled'];

export function PrintOrderStatusControl({
  locale,
  batchId,
  status,
}: {
  locale: string;
  batchId: string;
  status: string;
}) {
  const t = useTranslations('ownerOrders');
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextOptions = ALL_ADVANCEABLE_STATUSES.filter((option) => canAdvancePrintOrderStatus(current, option));

  async function handleChange(next: AdvanceableStatus) {
    setPending(true);
    setError(null);
    const result = await updatePrintOrderBatchStatusAction(locale, batchId, next);
    if (result.error) setError(result.error);
    else setCurrent(next);
    setPending(false);
  }

  if (nextOptions.length === 0) {
    // Terminal status (shipped/cancelled) -- nothing left to advance.
    return <span className="text-xs text-ink-500">{t(`status.${current}`)}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {nextOptions.map((option) => (
          <button
            key={option}
            type="button"
            disabled={pending}
            onClick={() => handleChange(option)}
            className={`focus-ring rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              option === 'cancelled'
                ? 'border-coral-700 text-coral-400 hover:bg-coral-900/30'
                : 'border-lagoon-700 text-lagoon-300 hover:bg-lagoon-900/30'
            }`}
          >
            {t(`markAs.${option}`)}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-coral-500">{error}</p>}
    </div>
  );
}
