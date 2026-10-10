import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { EmptyState } from '@/components/ui/EmptyState';
import { AddChildDialog } from '@/components/children/AddChildDialog';
import { CsvImportDialog } from '@/components/children/CsvImportDialog';
import { ChildrenListWithBulkConsent } from '@/components/children/ChildrenListWithBulkConsent';

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk CSV import is a nursery/school workflow (a class
              roster) - a family account has one or two children and
              never needs it. */}
          {context.tenantType === 'nursery' && <CsvImportDialog locale={params.locale} />}
          <AddChildDialog locale={params.locale} />
        </div>
      </div>

      {!children || children.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ChildrenListWithBulkConsent locale={params.locale} childrenList={children} />
      )}
    </div>
  );
}
