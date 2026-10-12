import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getPrintOrderLeadTime } from '@/lib/domain/print-orders';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  pending: 'neutral',
  paid: 'warning',
  printing: 'info',
  shipped: 'success',
  cancelled: 'danger',
};

interface OrderBatch {
  batchId: string;
  status: string;
  currency: string;
  totalAmountMinor: number;
  createdAt: string;
  items: { childName: string; storyTitle: string; locale: string }[];
}

/**
 * The tenant's own print-order tracking view -- "where did my order go"
 * for a nursery or family, mirroring the owner Orders tab's grouping
 * logic but scoped to this tenant via RLS (print_orders_tenant_select),
 * no service-role client needed since this is a read of the tenant's
 * own rows. See docs/DECISIONS.md "Order tracking: owner Orders tab +
 * status notifications".
 */
export default async function OrdersPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const t = await getTranslations('dashboard.orders');

  const { data: orderRows } = await supabase
    .from('print_orders')
    .select(
      'id, batch_id, status, currency, amount_minor, created_at, stories!print_orders_story_id_fkey(theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name))',
    )
    .eq('tenant_id', context.tenantId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: templateRows } = await supabase.from('story_theme_templates').select('theme_key, locale, title');
  const titleByThemeLocale = new Map((templateRows ?? []).map((row) => [`${row.theme_key}:${row.locale}`, row.title]));

  const batches = new Map<string, OrderBatch>();
  for (const row of orderRows ?? []) {
    const key = row.batch_id ?? row.id;
    const story = row.stories as unknown as {
      theme_key: string;
      locale: string;
      children: { first_name: string; arabic_first_name: string | null } | null;
    };
    const childName =
      (story.locale === 'ar' && story.children?.arabic_first_name) || story.children?.first_name || '';
    const storyTitle = titleByThemeLocale.get(`${story.theme_key}:${story.locale}`) ?? story.theme_key.replace(/_/g, ' ');

    const existing = batches.get(key);
    if (existing) {
      existing.totalAmountMinor += row.amount_minor;
      existing.items.push({ childName, storyTitle, locale: story.locale });
    } else {
      batches.set(key, {
        batchId: key,
        status: row.status,
        currency: row.currency,
        totalAmountMinor: row.amount_minor,
        createdAt: row.created_at,
        items: [{ childName, storyTitle, locale: story.locale }],
      });
    }
  }

  const sorted = [...batches.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">{t('pageTitle')}</h1>
      {sorted.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <Card>
          <CardTitle>{t('title', { count: sorted.length })}</CardTitle>
          <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
            {sorted.map((batch) => {
              const leadTime = getPrintOrderLeadTime(batch.items.length);
              return (
                <li key={batch.batchId} className="flex flex-col gap-1 py-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-800">
                      {t('copiesCount', { count: batch.items.length })} — {(batch.totalAmountMinor / 100).toFixed(2)}{' '}
                      {batch.currency.toUpperCase()}
                    </p>
                    <Badge tone={STATUS_TONE[batch.status] ?? 'neutral'}>{t(`status.${batch.status}`)}</Badge>
                  </div>
                  <p className="text-sm text-ink-600">
                    {batch.items.map((item) => `${item.storyTitle} (${item.childName}, ${item.locale.toUpperCase()})`).join(' · ')}
                  </p>
                  <p className="text-xs text-ink-500">
                    {new Date(batch.createdAt).toLocaleDateString()}
                    {batch.status === 'paid' &&
                      ` · ${t('leadTimeNote', { ready: leadTime.readyDays[1], delivery: leadTime.deliveryDays[1] })}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
