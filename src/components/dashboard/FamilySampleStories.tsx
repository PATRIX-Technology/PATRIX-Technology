import type { PlatformSampleStory } from '@/types/database';
import { Card, CardTitle } from '@/components/ui/Card';

/**
 * Shows the founder-chosen sample stories (one English, one Arabic) in
 * place of letting a new family account generate a free one — see
 * docs/DECISIONS.md "Removing the free trial story". Read-only: no
 * "create your own" action here, since the point is to demonstrate the
 * product before asking for a subscription, not to hand out a story.
 */
export function FamilySampleStories({
  samples,
  imageUrls,
}: {
  samples: PlatformSampleStory[];
  /** story_id -> signed URL, or undefined if that sample has no image yet. */
  imageUrls: Record<string, string>;
}) {
  if (samples.length === 0) {
    return (
      <Card>
        <CardTitle>Sample stories</CardTitle>
        <p className="mt-2 text-sm text-ink-500">
          Sample stories aren&apos;t set up on this deployment yet — see docs/NEEDS_FROM_ME.md.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {samples.map((sample) => (
        <Card key={sample.story_id} className="overflow-hidden p-0" dir={sample.locale === 'ar' ? 'rtl' : 'ltr'}>
          <div className="aspect-[4/3] w-full bg-[rgb(var(--color-surface))]">
            {imageUrls[sample.story_id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrls[sample.story_id]}
                alt={sample.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
                Preview coming soon
              </div>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-lagoon-600">
              {sample.locale === 'ar' ? 'نموذج قصة بالعربية' : 'Sample story in English'}
            </p>
            <p className="mt-1 font-display text-lg text-ink-900">{sample.title}</p>
            <p className="mt-1 text-sm text-ink-600">{sample.synopsis}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
