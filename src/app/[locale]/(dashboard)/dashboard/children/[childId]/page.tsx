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
import { SuggestTemplateDialog } from '@/components/stories/SuggestTemplateDialog';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import { getSignedAssetUrl } from '@/lib/domain/storage';
import { flags } from '@/lib/flags';
import { Badge } from '@/components/ui/Badge';

// 60 is the Hobby plan's ceiling for this config value — see
// docs/DECISIONS.md "maxDuration must not exceed the Hobby ceiling" for
// why this was briefly set to 300 (a Pro-only value) and had to be
// reverted: it risks the deployment itself failing on Hobby, not just a
// runtime timeout. This page itself does no generation work (createStoryAction
// only inserts rows; AutoRefresh on the story page drives generation once
// there), so this ceiling is mostly headroom rather than a real constraint here.
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

  // The story list below shows each template's real title, not the raw
  // snake_case theme_key (always English regardless of locale) — see
  // docs/DECISIONS.md "Arabic gender-agreement audit of the story
  // templates" for why that distinction matters here specifically.
  const titleByThemeKey = new Map((templates ?? []).map((tpl) => [tpl.theme_key, tpl.title]));

  const { data: tenant } = await supabase
    .from('tenants')
    .select('photo_personalization_opt_in')
    .eq('id', context.tenantId)
    .maybeSingle();

  // Whether photo personalisation is switched on for this deployment at
  // all — feature flag + legal review, and for a nursery, that tenant's
  // own opt-in too. A family tenant has no separate opt-in toggle: the
  // account owner IS the child's parent/guardian, so there's no
  // tenant-level policy decision distinct from the per-child consent
  // checkbox itself — see docs/DECISIONS.md "Family photo consent: a
  // single checkbox at upload time" (this replaces the previous flat
  // `context.tenantType !== 'family'` block that disabled photo upload
  // for every family account outright).
  const photoOptionAvailable =
    flags.photoPersonalization &&
    flags.photoPersonalizationLegalReviewComplete &&
    (context.tenantType === 'family' || Boolean(tenant?.photo_personalization_opt_in));

  let hasPhotoConsent = false;
  if (photoOptionAvailable) {
    const { data } = await supabase.rpc('has_granted_photo_consent', {
      target_child_id: child.id,
    });
    hasPhotoConsent = Boolean(data);
  }

  // A nursery still needs the multi-party request/wait/respond flow
  // before any upload UI appears at all. A family tenant sees the
  // upload widget directly once photo personalisation is switched on —
  // PhotoUpload itself shows a one-time required consent checkbox until
  // hasPhotoConsent is true.
  const photoUploadAvailable =
    photoOptionAvailable && (context.tenantType === 'family' || hasPhotoConsent);

  const photoUrl = child.photo_asset_path ? await getSignedAssetUrl(supabase, child.photo_asset_path) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <AvatarPreview config={parseAvatarConfig(child.avatar_config)} animated className="h-16 w-16" />
        <div className="flex-1">
          <h1 className="font-display text-2xl text-ink-900">
            {[child.first_name, child.last_name].filter(Boolean).join(' ')}
            {child.arabic_first_name && (
              <span dir="rtl" className="ms-2 text-ink-500">
                ({[child.arabic_first_name, child.arabic_last_name].filter(Boolean).join(' ')})
              </span>
            )}
          </h1>
          <p className="text-sm text-ink-500">{child.class_name ?? t('children.noClassAssigned')}</p>
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
          <CardTitle>{t('children.familyConsentTitle')}</CardTitle>
          <p className="mt-2 text-sm text-ink-600">{t('children.familyConsentBody')}</p>
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
          <CardTitle>{t('children.referencePhotoTitle')}</CardTitle>
          <p className="mt-2 text-sm text-ink-600">
            {t('children.referencePhotoBody', { childName: child.first_name })}
          </p>
          <div className="mt-4">
            <PhotoUpload
              locale={params.locale}
              childId={child.id}
              hasPhoto={Boolean(child.photo_asset_path)}
              photoUrl={photoUrl}
              requireFamilyConsentCheckbox={context.tenantType === 'family' && !hasPhotoConsent}
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
        <div className="mt-4">
          <SuggestTemplateDialog tenantName={context.tenantName} fullName={context.fullName} />
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
                {titleByThemeKey.get(story.theme_key) ?? story.theme_key.replace(/_/g, ' ')}
              </Link>
              <Badge tone="info">{t(`stories.status.${story.status}`)}</Badge>
            </li>
          ))}
          {(!stories || stories.length === 0) && <p className="py-4 text-sm text-ink-500">{t('stories.noStoriesYet')}</p>}
        </ul>
      </Card>
    </div>
  );
}
