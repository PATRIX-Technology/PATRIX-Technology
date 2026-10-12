import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMfaStatus } from '@/lib/domain/mfa';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OwnerTabs } from '@/components/dashboard/OwnerTabs';
import { PrintOrderStatusControl } from '@/components/dashboard/PrintOrderStatusControl';
import { getPrintOrderLeadTime } from '@/lib/domain/print-orders';
import { getTranslations } from 'next-intl/server';

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  pending: 'neutral',
  paid: 'warning',
  printing: 'info',
  shipped: 'success',
  cancelled: 'danger',
};

// New paid orders first (what needs the founder's attention), then by
// recency within status -- same priority logic as OwnerSuggestionsPage.
const STATUS_ORDER: Record<string, number> = { paid: 0, printing: 1, shipped: 2, cancelled: 3, pending: 4 };

interface OrderBatch {
  batchId: string;
  status: string;
  tenantName: string;
  currency: string;
  totalAmountMinor: number;
  shippingName: string;
  shippingAddress: string;
  createdAt: string;
  items: { childName: string; storyTitle: string; locale: string }[];
}

export default async function OwnerOrdersPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const t = await getTranslations({ locale: params.locale, namespace: 'ownerOrders' });

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = userData.user
    ? await supabase.from('profiles').select('is_platform_owner').eq('id', userData.user.id).maybeSingle()
    : { data: null };

  if (!userData.user || !profile?.is_platform_owner) {
    redirect(`/${params.locale}/dashboard`);
  }

  const mfaGate = await getMfaStatus(supabase);
  if (mfaGate.status === 'needs_enrollment') {
    redirect(`/${params.locale}/owner/mfa-enroll`);
  }
  if (mfaGate.status === 'needs_challenge') {
    redirect(`/${params.locale}/owner/mfa-challenge`);
  }

  const { data: orderRows } = await supabase
    .from('print_orders')
    .select(
      'id, batch_id, status, currency, amount_minor, shipping_name, shipping_address_line1, shipping_city, shipping_country, created_at, tenants(name), stories!print_orders_story_id_fkey(theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name))',
    )
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: templateRows } = await supabase.from('story_theme_templates').select('theme_key, locale, title');
  const titleByThemeLocale = new Map((templateRows ?? []).map((row) => [`${row.theme_key}:${row.locale}`, row.title]));

  const { count: suggestionCount } = await supabase
    .from('story_template_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');

  const batches = new Map<string, OrderBatch>();
  for (const row of orderRows ?? []) {
    const key = row.batch_id ?? row.id;
    const tenant = row.tenants as unknown as { name: string } | null;
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
        tenantName: tenant?.name ?? 'Unknown organisation',
        currency: row.currency,
        totalAmountMinor: row.amount_minor,
        shippingName: row.shipping_name,
        shippingAddress: `${row.shipping_address_line1}, ${row.shipping_city}, ${row.shipping_country}`,
        createdAt: row.created_at,
        items: [{ childName, storyTitle, locale: story.locale }],
      });
    }
  }

  const sorted = [...batches.values()].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const paidCount = sorted.filter((b) => b.status === 'paid').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Platform owner dashboard</h1>
        <Badge tone="success">Two-factor verified this session</Badge>
      </div>

      <OwnerTabs locale={params.locale} newSuggestionCount={suggestionCount ?? 0} newOrderCount={paidCount} />

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{t('title', { count: sorted.length })}</CardTitle>
          {paidCount > 0 && <Badge tone="warning">{t('paidAwaitingAction', { count: paidCount })}</Badge>}
        </div>
        <p className="mt-2 text-sm text-ink-500">{t('subtitle')}</p>
        <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
          {sorted.map((batch) => {
            const leadTime = getPrintOrderLeadTime(batch.items.length);
            return (
              <li key={batch.batchId} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-800">{batch.tenantName}</p>
                    <Badge tone={STATUS_TONE[batch.status] ?? 'neutral'}>{t(`status.${batch.status}`)}</Badge>
                  </div>
                  <p className="text-sm text-ink-600">
                    {t('copiesCount', { count: batch.items.length })} —{' '}
                    {(batch.totalAmountMinor / 100).toFixed(2)} {batch.currency.toUpperCase()}
                  </p>
                  <p className="text-xs text-ink-500">
                    {batch.items.map((item) => `${item.storyTitle} (${item.childName}, ${item.locale.toUpperCase()})`).join(' · ')}
                  </p>
                  <p className="text-xs text-ink-500">
                    {t('shipTo', { name: batch.shippingName, address: batch.shippingAddress })}
                  </p>
                  <p className="text-xs text-ink-400">
                    {new Date(batch.createdAt).toLocaleDateString()} ·{' '}
                    {t('leadTimeNote', { ready: leadTime.readyDays[1], delivery: leadTime.deliveryDays[1] })}
                  </p>
                </div>
                <PrintOrderStatusControl locale={params.locale} batchId={batch.batchId} status={batch.status} />
              </li>
            );
          })}
          {sorted.length === 0 && <p className="py-3 text-sm text-ink-500">{t('empty')}</p>}
        </ul>
      </Card>
    </div>
  );
}
