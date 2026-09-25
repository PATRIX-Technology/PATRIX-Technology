import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { InviteStaffForm } from '@/components/dashboard/InviteStaffForm';

export default async function StaffPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('staffPage');
  if (!context) return null;

  const { data: members } = await supabase
    .from('tenant_members')
    .select('user_id, role, profiles(full_name)')
    .eq('tenant_id', context.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">{t('body')}</p>
      </div>

      <Card>
        <ul className="space-y-1.5 text-sm text-ink-600">
          <li>
            <span className="font-medium text-ink-800">{t('roleOwnerLabel')}</span> — {t('roleOwnerDesc')}
          </li>
          <li>
            <span className="font-medium text-ink-800">{t('roleAdminLabel')}</span> — {t('roleAdminDesc')}
          </li>
          <li>
            <span className="font-medium text-ink-800">{t('roleStaffLabel')}</span> — {t('roleStaffDesc')}
          </li>
        </ul>
      </Card>

      {context.role === 'nursery_owner' && (
        <Card>
          <CardTitle>{t('inviteTitle')}</CardTitle>
          <div className="mt-4">
            <InviteStaffForm locale={params.locale} />
          </div>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
              <th className="p-4">{t('table.name')}</th>
              <th className="p-4">{t('table.role')}</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <tr key={member.user_id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                <td className="p-4">{(member.profiles as unknown as { full_name: string } | null)?.full_name}</td>
                <td className="p-4">
                  <Badge tone="info">{member.role.replace('nursery_', '')}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
