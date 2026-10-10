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

  // Bulk story generation (nursery-only, see the themeOptions prop below)
  // needs one option per theme_key, not per template row -- each child
  // renders in their OWN preferred_language, so the picker groups the
  // en/ar rows of the same theme together rather than listing them
  // separately. Only reviewed templates are offered, same gate as the
  // single-child create-story form.
  const { data: templateRows } = await supabase
    .from('story_theme_templates')
    .select('theme_key, locale, title, category')
    .eq('is_active', true)
    .eq('native_review_status', 'reviewed');
  interface ThemeOptionDraft {
    themeKey: string;
    titleEn?: string;
    titleAr?: string;
    category: string;
  }
  const themeOptionsByKey = new Map<string, ThemeOptionDraft>();
  for (const row of templateRows ?? []) {
    const existing: ThemeOptionDraft =
      themeOptionsByKey.get(row.theme_key) ?? { themeKey: row.theme_key, category: row.category };
    if (row.locale === 'en') existing.titleEn = row.title;
    if (row.locale === 'ar') existing.titleAr = row.title;
    themeOptionsByKey.set(row.theme_key, existing);
  }
  const themeOptions = Array.from(themeOptionsByKey.values()).sort((a, b) =>
    (a.titleEn ?? a.titleAr ?? '').localeCompare(b.titleEn ?? b.titleAr ?? ''),
  );

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
        <ChildrenListWithBulkConsent
          locale={params.locale}
          childrenList={children}
          themeOptions={context.tenantType === 'nursery' ? themeOptions : []}
        />
      )}
    </div>
  );
}
