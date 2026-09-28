'use client';

import { useState } from 'react';
import { adminSetTenantSubscriptionAction } from '@/lib/actions/owner-subscriptions';
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
}: {
  tenantId: string;
  planId: string | null;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  storiesUsed: number;
  storiesIncluded: number;
  periodEnd: string | null;
  planOptions: { id: string; name: string; label: string }[];
}) {
  const [current, setCurrent] = useState({ planId, status, cancelAtPeriodEnd, storiesUsed, storiesIncluded, periodEnd });
  const [selectedPlanId, setSelectedPlanId] = useState(planId ?? planOptions[0]?.id ?? '');
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [cancelAtEnd, setCancelAtEnd] = useState(cancelAtPeriodEnd);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const dirty =
    selectedPlanId !== (current.planId ?? planOptions[0]?.id ?? '') ||
    selectedStatus !== current.status ||
    cancelAtEnd !== current.cancelAtPeriodEnd;

  const currentPlan = planOptions.find((p) => p.id === current.planId);

  async function handleSave() {
    if (!selectedPlanId) return;
    setPending(true);
    setFeedback(null);
    const result = await adminSetTenantSubscriptionAction(tenantId, selectedPlanId, selectedStatus, cancelAtEnd);
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
        <p className="text-ink-800">{currentPlan ? currentPlan.name : 'No plan'}</p>
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
