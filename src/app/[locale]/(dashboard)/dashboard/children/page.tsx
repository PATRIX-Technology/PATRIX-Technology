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
        <>
          {/* Card list — the roster's real surface on a phone. An 8-column
              table like the one below only fits a laptop-width viewport,
              and forcing it onto a phone meant an unreadable horizontal
              scroll with the page header overlapping the action buttons
              (reported from a real phone screenshot). Each card carries
              exactly what a parent/staff member scans for at a glance;
              everything else is one tap away on the child's own page. */}
          <div className="grid gap-3 md:hidden">
            {children.map((child) => {
              const enName = [child.first_name, child.last_name].filter(Boolean).join(' ');
              const arName = [child.arabic_first_name, child.arabic_last_name].filter(Boolean).join(' ');
              // An Arabic-locale viewer wants the Arabic name up front, not
              // buried as a secondary line under the English one -- falls
              // back to English when no Arabic name is on file.
              const showArabicFirst = params.locale === 'ar' && Boolean(arName);
              const primaryName = showArabicFirst ? arName : enName;
              const secondaryName = showArabicFirst ? enName : arName || null;
              return (
                <Link
                  key={child.id}
                  href={`/${params.locale}/dashboard/children/${child.id}`}
                  className="focus-ring block"
                >
                  <Card className="flex items-center gap-4 p-4 transition-colors hover:border-lagoon-700 active:bg-ink-50">
                    <AvatarPreview config={parseAvatarConfig(child.avatar_config)} className="h-12 w-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p dir={showArabicFirst ? 'rtl' : undefined} className="truncate font-medium text-ink-900">
                          {primaryName}
                        </p>
                        <Badge tone={CONSENT_TONE[child.consent_status as ConsentStatus]} className="shrink-0">
                          {t(`consentStatus.${child.consent_status}`)}
                        </Badge>
                      </div>
                      {secondaryName && (
                        <p dir={showArabicFirst ? undefined : 'rtl'} className="truncate text-sm text-ink-600">
                          {secondaryName}
                        </p>
                      )}
                      <p className="truncate text-sm text-ink-500">
                        {child.class_name ?? t('noClassAssigned')} · {child.preferred_language.toUpperCase()}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Full table — kept for a laptop/desktop viewport, where every
              column fits without scrolling. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
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
        </>
      )}
    </div>
  );
}
