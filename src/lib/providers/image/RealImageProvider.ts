import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerateImageRequest, GenerateImageResult, ImageProvider } from './ImageProvider';
import { ImageGenerationError, SpendCapExceededError } from './ImageProvider';

export interface RealImageProviderConfig {
  apiKey: string;
  /** Fixed brand style prompt prepended to every request, so illustrations
   * stay visually consistent across every tenant and theme. */
  stylePrompt: string;
  costPerImageUsd: number;
}

/**
 * Skeleton for a real (paid) AI image provider. NOT wired to any live
 * vendor API yet — see docs/NEEDS_FROM_ME.md. Implementing this for real
 * means: picking a vendor, obtaining API credentials (founder action),
 * implementing the actual HTTP call in `callVendorApi`, and running this
 * behind FEATURE_REAL_IMAGE_PROVIDER after legal review.
 *
 * The parts that are NOT skeleton and must never be weakened:
 *   - the can_spend() pre-flight check (hard kill switch, not a warning)
 *   - recording spend via record_ai_spend() in the SAME request as the
 *     generation call, so a crash between "spent" and "recorded" is not
 *     possible to exploit for unlimited free generation
 */
export class RealImageProvider implements ImageProvider {
  readonly name = 'real';

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly config: RealImageProviderConfig,
  ) {}

  async generate(request: GenerateImageRequest): Promise<GenerateImageResult> {
    const { data: allowed, error } = await this.supabase.rpc('can_spend', {
      target_tenant_id: request.tenantId,
    });
    if (error) throw error;
    if (!allowed) {
      throw new SpendCapExceededError('tenant');
    }

    let bytes: Uint8Array;
    try {
      bytes = await this.callVendorApi(request);
    } catch (cause) {
      throw new ImageGenerationError(
        `Real image provider request failed: ${(cause as Error).message}`,
        true,
      );
    }

    const { error: spendError } = await this.supabase.rpc('record_ai_spend', {
      target_tenant_id: request.tenantId,
      target_story_id: request.storyId,
      target_page_id: request.pageId,
      provider_name: this.name,
      amount: this.config.costPerImageUsd,
    });
    if (spendError) throw spendError;

    return {
      bytes,
      contentType: 'image/png',
      provider: this.name,
      costUsd: this.config.costPerImageUsd,
    };
  }

  /** NOT IMPLEMENTED — placeholder for the chosen vendor's API call. */
  private async callVendorApi(_request: GenerateImageRequest): Promise<Uint8Array> {
    throw new Error(
      'RealImageProvider.callVendorApi is not implemented. Choose an image generation ' +
        'vendor, obtain API credentials, and implement this method before enabling ' +
        'FEATURE_REAL_IMAGE_PROVIDER. See docs/NEEDS_FROM_ME.md.',
    );
  }
}
