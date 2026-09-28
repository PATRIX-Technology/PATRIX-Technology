import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMfaStatus } from '@/lib/domain/mfa';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OwnerTabs } from '@/components/dashboard/OwnerTabs';
import { SuggestionStatusControl } from '@/components/dashboard/SuggestionStatusControl';
import type { StorySuggestionStatus } from '@/types/database';

// New ideas first (what actually needs the founder's attention), then
// everything else by recency within its own status.
const STATUS_ORDER: Record<StorySuggestionStatus, number> = { new: 0, reviewed: 1, added: 2, declined: 3 };

export default async function OwnerSuggestionsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = userData.user
    ? await supabase.from('profiles').select('is_platform_owner').eq('id', userData.user.id).maybeSingle()
    : { data: null };

  if (!userData.user || !profile?.is_platform_owner) {
    redirect(`/${params.locale}/dashboard`);
  }

  // Mandatory MFA gate — see docs/DECISIONS.md "Owner MFA is mandatory".
  // No owner-dashboard data is fetched or rendered below this check.
  const mfaGate = await getMfaStatus(supabase);
  if (mfaGate.status === 'needs_enrollment') {
    redirect(`/${params.locale}/owner/mfa-enroll`);
  }
  if (mfaGate.status === 'needs_challenge') {
    redirect(`/${params.locale}/owner/mfa-challenge`);
  }

  const { data: suggestions } = await supabase
    .from('story_template_suggestions')
    .select('id, topic, description, status, created_at, tenants(name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);

  const sorted = [...(suggestions ?? [])].sort((a, b) => {
    const statusDiff =
      STATUS_ORDER[a.status as StorySuggestionStatus] - STATUS_ORDER[b.status as StorySuggestionStatus];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const newCount = sorted.filter((s) => s.status === 'new').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Platform owner dashboard</h1>
        <Badge tone="success">Two-factor verified this session</Badge>
      </div>

      <OwnerTabs locale={params.locale} newSuggestionCount={newCount} />

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Story idea suggestions ({sorted.length})</CardTitle>
          {newCount > 0 && <Badge tone="warning">{newCount} new</Badge>}
        </div>
        <p className="mt-2 text-sm text-ink-500">
          Ideas nurseries and families suggested from the Stories page, newest unreviewed ones first.
          Marking one &quot;added&quot; is just a note for you — building the actual template still
          happens in a session.
        </p>
        <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
          {sorted.map((suggestion) => {
            const tenant = suggestion.tenants as unknown as { name: string } | null;
            const submitter = suggestion.profiles as unknown as { full_name: string } | null;
            return (
              <li key={suggestion.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-800">{suggestion.topic}</p>
                    {suggestion.status === 'new' && <Badge tone="warning">New</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{suggestion.description}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {tenant?.name ?? 'Unknown'} — {submitter?.full_name ?? 'Unknown'} ·{' '}
                    {new Date(suggestion.created_at).toLocaleDateString()}
                  </p>
                </div>
                <SuggestionStatusControl suggestionId={suggestion.id} status={suggestion.status} />
              </li>
            );
          })}
          {sorted.length === 0 && <p className="py-3 text-sm text-ink-500">No suggestions yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
