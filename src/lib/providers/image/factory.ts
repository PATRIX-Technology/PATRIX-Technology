import type { SupabaseClient } from '@supabase/supabase-js';
import { flags } from '@/lib/flags';
import type { ImageProvider } from './ImageProvider';
import { MockImageProvider } from './MockImageProvider';
import { RealImageProvider } from './RealImageProvider';

export function createImageProvider(supabase: SupabaseClient): ImageProvider {
  if (!flags.realImageProvider) {
    return new MockImageProvider();
  }

  const apiKey = process.env.IMAGE_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FEATURE_REAL_IMAGE_PROVIDER is on but IMAGE_PROVIDER_API_KEY is not set. Refusing to ' +
        'fall back silently to the mock provider for a flag that was explicitly enabled — fix ' +
        'the environment configuration.',
    );
  }

  return new RealImageProvider(supabase, {
    apiKey,
    stylePrompt:
      'Warm, premium children\'s storybook illustration style, soft rounded shapes, gentle ' +
      'consistent lighting, culturally appropriate for the UAE, no text in the image.',
    costPerImageUsd: Number(process.env.IMAGE_PROVIDER_COST_PER_IMAGE_USD ?? '0.08'),
  });
}
