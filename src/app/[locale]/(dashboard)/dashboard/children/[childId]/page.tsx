import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { AvatarPreview } from '@/components/children/AvatarPreview';
import { ConsentPanel } from '@/components/children/ConsentPanel';
import { PhotoUpload } from '@/components/children/PhotoUpload';
import { CreateStoryForm } from '@/components/stories/CreateStoryForm';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import { getSignedAssetUrl } from '@/lib/domain/storage';
import { flags } from '@/lib/flags';
import { Badge } from '@/components/ui/Badge';

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
        <div>
          <h1 className="font-display text-2xl text-ink-900">{child.first_name}</h1>
          <p className="text-sm text-ink-500">{child.class_name ?? 'No class assigned'}</p>
        </div>
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
