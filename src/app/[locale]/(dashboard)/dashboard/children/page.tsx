import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClickableRow } from '@/components/ui/ClickableRow';
import { AddChildDialog } from '@/components/children/AddChildDialog';
import { CsvImportDialog } from '@/components/children/CsvImportDialog';
import { AvatarPreview } from '@/components/children/AvatarPreview';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import type { ConsentStatus } from '@/types/database';

const CONSENT_TONE: Record<ConsentStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  not_requested: 'neutral',
  pending: 'warning',
  granted: 'success',
  declined: 'danger',
  withdrawn: 'danger',
};

export default async function ChildrenPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('children');
  if (!context) return null;

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        <div className="flex gap-2">
          <CsvImportDialog locale={params.locale} />
          <AddChildDialog locale={params.locale} />
        </div>
      </div>

      {!children || children.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
                <th className="p-4">{t('table.avatar')}</th>
                <th className="p-4">{t('table.firstNameEn')}</th>
                <th className="p-4">{t('table.lastNameEn')}</th>
                <th className="p-4">{t('table.firstNameAr')}</th>
                <th className="p-4">{t('table.lastNameAr')}</th>
                <th className="p-4">{t('table.class')}</th>
                <th className="p-4">{t('table.language')}</th>
                <th className="p-4">{t('table.consent')}</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <ClickableRow
                  key={child.id}
                  href={`/${params.locale}/dashboard/children/${child.id}`}
                  className="border-b border-[rgb(var(--color-border))] last:border-0"
                >
                  <td className="p-4">
                    <AvatarPreview config={parseAvatarConfig(child.avatar_config)} className="h-10 w-10" />
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/${params.locale}/dashboard/children/${child.id}`}
                      className="focus-ring font-medium text-ink-900 hover:text-lagoon-700"
                    >
                      {child.first_name}
                    </Link>
                  </td>
                  <td className="p-4 text-ink-600">{child.last_name ?? '—'}</td>
                  <td dir="rtl" className="p-4 text-ink-600">
                    {child.arabic_first_name ?? '—'}
                  </td>
                  <td dir="rtl" className="p-4 text-ink-600">
                    {child.arabic_last_name ?? '—'}
                  </td>
                  <td className="p-4 text-ink-600">{child.class_name ?? '—'}</td>
                  <td className="p-4 text-ink-600">{child.preferred_language.toUpperCase()}</td>
                  <td className="p-4">
                    <Badge tone={CONSENT_TONE[child.consent_status as ConsentStatus]}>
                      {t(`consentStatus.${child.consent_status}`)}
                    </Badge>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
