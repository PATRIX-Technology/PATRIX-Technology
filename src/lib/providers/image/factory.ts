import type { SupabaseClient } from '@supabase/supabase-js';
import { flags } from '@/lib/flags';
import type { ImageProvider } from './ImageProvider';
import { MockImageProvider } from './MockImageProvider';
import { GeminiImageProvider } from './GeminiImageProvider';

export function createImageProvider(supabase: SupabaseClient): ImageProvider {
  if (!flags.realImageProvider) {
    return new MockImageProvider();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FEATURE_REAL_IMAGE_PROVIDER is on but GEMINI_API_KEY is not set. Refusing to fall back ' +
        'silently to the mock provider for a flag that was explicitly enabled — fix the ' +
        'environment configuration.',
    );
  }

  return new GeminiImageProvider(supabase, {
    apiKey,
    stylePrompt: '', // built dynamically per-request — see prompts.ts
    costPerImageUsd: Number(process.env.GEMINI_COST_PER_IMAGE_USD ?? '0.02'),
  });
}
