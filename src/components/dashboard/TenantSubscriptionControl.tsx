'use client';

import { useState } from 'react';
import { adminSetTenantSubscriptionAction, adminSetFoundingPartnerFlagAction } from '@/lib/actions/owner-subscriptions';
import { Badge } from '@/components/ui/Badge';
import type { SubscriptionStatus } from '@/types/database';

const STATUS_OPTIONS: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'incomplete'];

const STATUS_TONE: Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  trialing: 'warning',
  past_due: 'danger',
  canceled: 'neutral',
  incomplete: 'neutral',
};

function formatMoney(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Defaults to today, formatted for a date input's value (YYYY-MM-DD).
function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Renders the Plan/Usage/Renews/Manage cells of one subscriptions-table
 * row as a single client component (see the owner subscriptions page),
 * so a save updates what the owner sees immediately from the action's own
 * return value — the same pattern SuggestionStatusControl uses, and for
 * the same reason: revalidatePath() + router.refresh() proved unreliable
 * here (see docs/DECISIONS.md "Owner subscriptions admin panel").
 */
export function TenantSubscriptionControl({
  tenantId,
  planId,
  status,
  cancelAtPeriodEnd,
  storiesUsed,
  storiesIncluded,
  periodEnd,
  planOptions,
  foundingPartnerDiscount,
  foundingPartnerPercentOff,
}: {
  tenantId: string;
  planId: string | null;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  storiesUsed: number;
  storiesIncluded: number;
  periodEnd: string | null;
  planOptions: {
    id: string;
    name: string;
    label: string;
    priceMonthlyCents: number;
    priceAnnualCents: number;
    currency: string;
  }[];
  foundingPartnerDiscount: boolean;
  /** FOUNDING10's live percent_off, e.g. 50 — read from the coupons table
   * so this display never drifts from what checkout actually applies. */
  foundingPartnerPercentOff: number;
}) {
  const [current, setCurrent] = useState({ planId, status, cancelAtPeriodEnd, storiesUsed, storiesIncluded, periodEnd });
  const [selectedPlanId, setSelectedPlanId] = useState(planId ?? planOptions[0]?.id ?? '');
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [cancelAtEnd, setCancelAtEnd] = useState(cancelAtPeriodEnd);
  const [periodStartDate, setPeriodStartDate] = useState(todayDateInputValue());
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [foundingPartner, setFoundingPartner] = useState(foundingPartnerDiscount);
  const [foundingPartnerPending, setFoundingPartnerPending] = useState(false);
  const [foundingPartnerError, setFoundingPartnerError] = useState<string | null>(null);

  async function handleFoundingPartnerToggle(next: boolean) {
    setFoundingPartnerPending(true);
    setFoundingPartnerError(null);
    const result = await adminSetFoundingPartnerFlagAction(tenantId, next);
    setFoundingPartnerPending(false);
    if ('error' in result) {
      setFoundingPartnerError(result.error);
      return;
    }
    setFoundingPartner(result.enabled);
  }

  const dirty =
    selectedPlanId !== (current.planId ?? planOptions[0]?.id ?? '') ||
    selectedStatus !== current.status ||
    cancelAtEnd !== current.cancelAtPeriodEnd ||
    periodStartDate !== todayDateInputValue();

  const currentPlan = planOptions.find((p) => p.id === current.planId);
  const selectedPlan = planOptions.find((p) => p.id === selectedPlanId);

  async function handleSave() {
    if (!selectedPlanId) return;
    setPending(true);
    setFeedback(null);
    const result = await adminSetTenantSubscriptionAction(
      tenantId,
      selectedPlanId,
      selectedStatus,
      cancelAtEnd,
      periodStartDate ? new Date(`${periodStartDate}T00:00:00Z`).toISOString() : undefined,
    );
    setPending(false);
    if ('error' in result) {
      setFeedback({ tone: 'error', text: result.error });
      return;
    }
    setCurrent({
      planId: result.planId,
      status: result.status,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      storiesUsed: 0,
      storiesIncluded: result.storiesIncluded,
      periodEnd: result.periodEnd,
    });
    setFeedback({ tone: 'ok', text: 'Saved — quota reset to the new plan’s allowance.' });
  }

  return (
    <>
      <td className="py-3 pe-4">
        <label className="flex items-center gap-1.5 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={foundingPartner}
            disabled={foundingPartnerPending}
            onChange={(event) => handleFoundingPartnerToggle(event.target.checked)}
          />
          Founding Partner
        </label>
        {foundingPartnerError && <p className="mt-1 text-xs text-coral-400">{foundingPartnerError}</p>}
      </td>
      <td className="py-3 pe-4">
        <p className="text-ink-800">{currentPlan ? currentPlan.name : 'No plan'}</p>
        {currentPlan && (
          <p className="mt-0.5 text-xs text-ink-500">
            {formatMoney(currentPlan.priceMonthlyCents, currentPlan.currency)}/mo ·{' '}
            {formatMoney(currentPlan.priceAnnualCents, currentPlan.currency)}/yr
            {foundingPartner && (
              <>
                {' '}
                <span className="text-lagoon-400">
                  (Founding Partner:{' '}
                  {formatMoney(
                    Math.round((currentPlan.priceMonthlyCents * (100 - foundingPartnerPercentOff)) / 100),
                    currentPlan.currency,
                  )}
                  /mo ·{' '}
                  {formatMoney(
                    Math.round((currentPlan.priceAnnualCents * (100 - foundingPartnerPercentOff)) / 100),
                    currentPlan.currency,
                  )}
                  /yr)
                </span>
              </>
            )}
          </p>
        )}
        <Badge tone={STATUS_TONE[current.status]} className="mt-1">
          {current.status}
        </Badge>
      </td>
      <td className="py-3 pe-4 text-ink-700">
        {current.storiesIncluded > 0 || current.storiesUsed > 0
          ? `${current.storiesUsed} / ${current.storiesIncluded} stories`
          : '—'}
      </td>
      <td className="py-3 pe-4 text-ink-700">
        {current.periodEnd ? new Date(current.periodEnd).toLocaleDateString() : '—'}
        {current.cancelAtPeriodEnd && (
          <Badge tone="warning" className="ms-2">
            Cancelling
          </Badge>
        )}
      </td>
      <td className="py-3 pe-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <select
              value={selectedPlanId}
              disabled={pending}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs text-ink-700"
            >
              {planOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectedPlan && foundingPartner && (
              <p className="mt-1 text-xs text-lagoon-400">
                Founding Partner: {formatMoney(
                  Math.round((selectedPlan.priceMonthlyCents * (100 - foundingPartnerPercentOff)) / 100),
                  selectedPlan.currency,
                )}
                /mo ·{' '}
                {formatMoney(
                  Math.round((selectedPlan.priceAnnualCents * (100 - foundingPartnerPercentOff)) / 100),
                  selectedPlan.currency,
                )}
                /yr — invoice this amount for bank transfer
              </p>
            )}
          </div>

          <select
            value={selectedStatus}
            disabled={pending}
            onChange={(event) => setSelectedStatus(event.target.value as SubscriptionStatus)}
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs text-ink-700"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            Starts
            <input
              type="date"
              value={periodStartDate}
              disabled={pending}
              onChange={(event) => setPeriodStartDate(event.target.value)}
              className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs text-ink-700"
            />
          </label>

          <button
            type="button"
            disabled={pending}
            onClick={() => setPeriodStartDate('2027-01-01')}
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs text-ink-600 disabled:opacity-40"
            title="Set the start date to real launch (1 Jan 2027) — for a bank-transfer Founding Partner paying before launch."
          >
            1 Jan 2027
          </button>

          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={cancelAtEnd}
              disabled={pending}
              onChange={(event) => setCancelAtEnd(event.target.checked)}
            />
            Cancel at period end
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !dirty}
            className="focus-ring rounded-lg bg-lagoon-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>

          {feedback && (
            <span className={`text-xs ${feedback.tone === 'error' ? 'text-coral-400' : 'text-lagoon-400'}`}>
              {feedback.text}
            </span>
          )}
        </div>
      </td>
    </>
  );
}
