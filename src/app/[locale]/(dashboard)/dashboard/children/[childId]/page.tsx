import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { AvatarPreview } from '@/components/children/AvatarPreview';
import { ConsentPanel } from '@/components/children/ConsentPanel';
import { PhotoUpload } from '@/components/children/PhotoUpload';
import { EditChildDialog } from '@/components/children/EditChildDialog';
import { CreateStoryForm } from '@/components/stories/CreateStoryForm';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import { getSignedAssetUrl } from '@/lib/domain/storage';
import { flags } from '@/lib/flags';
import { Badge } from '@/components/ui/Badge';

// Generating a story's images runs synchronously inside createStoryAction
// (called from this page) so the demo/pilot flow feels immediate rather
// than waiting on a cron tick — see docs/DECISIONS.md "Job queue
// implementation". Real image generation calls can take well past
// Vercel's 10s default, so this raises the ceiling to the Hobby-plan max;
// bump the Vercel plan (and this number, up to 300s+) if a story ever
// needs more than 4-5 pages.
export const maxDuration = 60;

export default async function ChildDetailPage({
  params,
}: {
  params: { locale: string; childId: string };
}) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations();
  if (!context) return null;

  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('id', params.childId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!child) notFound();

  const { data: templates } = await supabase
    .from('story_theme_templates')
    .select('id, theme_key, title, locale, native_review_status')
    .eq('is_active', true)
    .eq('locale', child.preferred_language);

  const { data: stories } = await supabase
    .from('stories')
    .select('id, theme_key, status, created_at')
    .eq('child_id', child.id)
    .order('created_at', { ascending: false });

  const { data: tenant } = await supabase
    .from('tenants')
    .select('photo_personalization_opt_in')
    .eq('id', context.tenantId)
    .maybeSingle();

  // Whether the "also ask for photo consent" checkbox should even be
  // offered — feature flag + legal review + tenant opt-in. Actually
  // uploading a photo needs a fourth condition (granted consent covering
  // photo) checked below and again, authoritatively, in
  // uploadChildPhotoAction — see docs/DECISIONS.md "Photo personalisation
  // wiring".
  const photoOptionAvailable =
    flags.photoPersonalization &&
    flags.photoPersonalizationLegalReviewComplete &&
    Boolean(tenant?.photo_personalization_opt_in) &&
    context.tenantType !== 'family';

  let photoUploadAvailable = false;
  if (photoOptionAvailable) {
    const { data: hasPhotoConsent } = await supabase.rpc('has_granted_photo_consent', {
      target_child_id: child.id,
    });
    photoUploadAvailable = Boolean(hasPhotoConsent);
  }

  const photoUrl = child.photo_asset_path ? await getSignedAssetUrl(supabase, child.photo_asset_path) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <AvatarPreview config={parseAvatarConfig(child.avatar_config)} className="h-16 w-16" />
        <div className="flex-1">
          <h1 className="font-display text-2xl text-ink-900">
            {[child.first_name, child.last_name].filter(Boolean).join(' ')}
            {child.arabic_first_name && (
              <span dir="rtl" className="ms-2 text-ink-500">
                ({[child.arabic_first_name, child.arabic_last_name].filter(Boolean).join(' ')})
              </span>
            )}
          </h1>
          <p className="text-sm text-ink-500">{child.class_name ?? 'No class assigned'}</p>
        </div>
        <EditChildDialog
          locale={params.locale}
          childId={child.id}
          defaultValues={{
            firstName: child.first_name,
            lastName: child.last_name,
            arabicFirstName: child.arabic_first_name,
            arabicLastName: child.arabic_last_name,
            pronoun: child.pronoun,
            className: child.class_name,
            preferredLanguage: child.preferred_language,
            avatarConfig: parseAvatarConfig(child.avatar_config),
          }}
        />
      </div>

      {context.tenantType === 'family' ? (
        <Card>
          <CardTitle>Consent</CardTitle>
          <p className="mt-2 text-sm text-ink-600">
            As this child&apos;s parent/guardian, your consent was recorded automatically when you added
            them to your family account — see docs/DECISIONS.md &quot;Phase 4: families are tenants&quot;.
          </p>
        </Card>
      ) : (
        <Card>
          <CardTitle>{t('consent.requestTitle')}</CardTitle>
          <div className="mt-4">
            <ConsentPanel
              locale={params.locale}
              childId={child.id}
              consentStatus={child.consent_status}
              photoOptionAvailable={photoOptionAvailable}
            />
          </div>
        </Card>
      )}

      {photoUploadAvailable && (
        <Card>
          <CardTitle>Reference photo</CardTitle>
          <p className="mt-2 text-sm text-ink-600">
            Upload a clear photo of {child.first_name} so their illustrated character looks like them
            across every page. Only used for image generation — never shown to other families.
          </p>
          <div className="mt-4">
            <PhotoUpload
              locale={params.locale}
              childId={child.id}
              hasPhoto={Boolean(child.photo_asset_path)}
              photoUrl={photoUrl}
            />
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>{t('stories.create')}</CardTitle>
        <div className="mt-4">
          <CreateStoryForm
            locale={params.locale}
            childId={child.id}
            consentStatus={child.consent_status}
            templates={templates ?? []}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('stories.title')}</CardTitle>
        <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
          {(stories ?? []).map((story) => (
            <li key={story.id} className="flex items-center justify-between py-3">
              <Link
                href={`/${params.locale}/dashboard/stories/${story.id}`}
                className="focus-ring font-medium text-ink-800 hover:text-lagoon-700"
              >
                {story.theme_key.replace(/_/g, ' ')}
              </Link>
              <Badge tone="info">{t(`stories.status.${story.status}`)}</Badge>
            </li>
          ))}
          {(!stories || stories.length === 0) && <p className="py-4 text-sm text-ink-500">No stories yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
