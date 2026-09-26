import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RealImageProvider } from '@/lib/providers/image/RealImageProvider';
import { ImageGenerationError, SpendCapExceededError } from '@/lib/providers/image/ImageProvider';
import { UnconfiguredSafetyChecker, type ImageSafetyChecker, type ImageSafetyResult } from '@/lib/providers/image/safety';

const FAKE_BYTES = new Uint8Array([1, 2, 3]);
const FAKE_CONTENT_TYPE = 'image/jpeg';

class FakeVendorProvider extends RealImageProvider {
  constructor(supabase: SupabaseClient, safetyChecker?: ImageSafetyChecker) {
    super(supabase, { apiKey: 'test', stylePrompt: 'test', costPerImageUsd: 0.08 }, safetyChecker);
  }

  protected override async callVendorApi(): Promise<{ bytes: Uint8Array; contentType: string }> {
    return { bytes: FAKE_BYTES, contentType: FAKE_CONTENT_TYPE };
  }
}

function makeSupabase(overrides: { canSpend?: boolean; spendError?: Error }) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'can_spend') return { data: overrides.canSpend ?? true, error: null };
    if (fn === 'record_ai_spend') return { data: null, error: overrides.spendError ?? null };
    throw new Error(`Unexpected rpc ${fn}`);
  });
  return { rpc } as unknown as SupabaseClient;
}

const baseRequest = {
  tenantId: 'tenant-1',
  storyId: 'story-1',
  pageId: 'page-1',
  prompt: 'a fox in a garden',
  avatarConfig: {},
  pronoun: 'they' as const,
  captionText: 'The fox hid behind the garden gate.',
  locale: 'en' as const,
};

describe('RealImageProvider', () => {
  it('throws SpendCapExceededError before ever calling the vendor when can_spend is false', async () => {
    const supabase = makeSupabase({ canSpend: false });
    const provider = new FakeVendorProvider(supabase);
    await expect(provider.generate(baseRequest)).rejects.toThrow(SpendCapExceededError);
  });

  it('records spend and returns the image when the safety checker approves it', async () => {
    const supabase = makeSupabase({ canSpend: true });
    const approving: ImageSafetyChecker = { name: 'test', check: async () => ({ safe: true }) };
    const provider = new FakeVendorProvider(supabase, approving);

    const result = await provider.generate(baseRequest);
    expect(result.bytes).toBe(FAKE_BYTES);
    expect(result.costUsd).toBe(0.08);
    // Gemini's image models return JPEG, not PNG — this must come from
    // the vendor call's actual response, never a hardcoded assumption
    // (that assumption previously made every PDF/ZIP export fail with
    // "The input is not a PNG file!").
    expect(result.contentType).toBe(FAKE_CONTENT_TYPE);
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'record_ai_spend',
      expect.objectContaining({ target_tenant_id: 'tenant-1', amount: 0.08 }),
    );
  });

  it('blocks the image (non-retryable) when the safety checker rejects it, but spend was still recorded', async () => {
    const supabase = makeSupabase({ canSpend: true });
    const rejecting: ImageSafetyChecker = {
      name: 'test',
      check: async (): Promise<ImageSafetyResult> => ({ safe: false, reason: 'inappropriate content' }),
    };
    const provider = new FakeVendorProvider(supabase, rejecting);

    let caught: unknown;
    try {
      await provider.generate(baseRequest);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImageGenerationError);
    expect((caught as ImageGenerationError).retryable).toBe(false);
    expect((caught as ImageGenerationError).message).toContain('inappropriate content');
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'record_ai_spend',
      expect.anything(),
    );
  });

  it('fails closed: with no safety provider configured, every image is blocked by default', async () => {
    const supabase = makeSupabase({ canSpend: true });
    const provider = new FakeVendorProvider(supabase, new UnconfiguredSafetyChecker());
    await expect(provider.generate(baseRequest)).rejects.toThrow(ImageGenerationError);
  });

  it('wraps a vendor API failure as a retryable ImageGenerationError', async () => {
    const supabase = makeSupabase({ canSpend: true });
    class FailingVendorProvider extends RealImageProvider {
      constructor() {
        super(supabase, { apiKey: 'test', stylePrompt: 'test', costPerImageUsd: 0.08 });
      }
      protected override async callVendorApi(): Promise<{ bytes: Uint8Array; contentType: string }> {
        throw new Error('network timeout');
      }
    }
    const provider = new FailingVendorProvider();

    let caught: unknown;
    try {
      await provider.generate(baseRequest);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ImageGenerationError);
    expect((caught as ImageGenerationError).retryable).toBe(true);
  });
});
