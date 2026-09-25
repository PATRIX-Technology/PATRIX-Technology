import { describe, expect, it } from 'vitest';
import { renderStoryPdf } from '@/lib/providers/pdf/render';
import { runPreflight } from '@/lib/providers/pdf/preflight';

const onePxPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAAl21bKAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('renderStoryPdf + runPreflight (English)', () => {
  it('produces a PDF that passes preflight end-to-end', async () => {
    const pages = [
      { pageNumber: 1, text: 'Maya loves rainbow vegetables.', imageBytes: onePxPng, imageContentType: 'image/png' },
      { pageNumber: 2, text: 'She shared her lunch with a friend.', imageBytes: onePxPng, imageContentType: 'image/png' },
    ];

    const pdfBytes = await renderStoryPdf({
      title: 'The Rainbow Plate',
      childName: 'Maya',
      organisationName: 'Little Explorers Nursery',
      locale: 'en',
      pages,
    });

    expect(pdfBytes.length).toBeGreaterThan(0);

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: pages.length,
      locale: 'en',
      pageTexts: pages.map((p) => p.text),
      missingAssetPageNumbers: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  }, 30_000);

  it('passes preflight for a caption using an em dash or en dash', async () => {
    // Regression case: preflight used to reject these outright even
    // though both embedded fonts render them fine — see
    // tests/unit/font-coverage.test.ts and docs/DECISIONS.md.
    const pages = [
      {
        pageNumber: 1,
        text: 'Maya waited — then smiled, and tried the carrots–crunchy and sweet.',
        imageBytes: onePxPng,
        imageContentType: 'image/png',
      },
    ];

    const pdfBytes = await renderStoryPdf({
      title: 'Test',
      childName: 'Maya',
      organisationName: 'Org',
      locale: 'en',
      pages,
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: pages.length,
      locale: 'en',
      pageTexts: pages.map((p) => p.text),
      missingAssetPageNumbers: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  }, 30_000);
});

describe('renderStoryPdf + runPreflight (Arabic)', () => {
  it('produces a valid bleed-inclusive A5 PDF for an Arabic story', async () => {
    const pages = [
      { pageNumber: 1, text: 'أكلت مايا الخضروات الملونة.', imageBytes: onePxPng, imageContentType: 'image/png' },
    ];

    const pdfBytes = await renderStoryPdf({
      title: 'صحن قوس المطر',
      childName: 'مايا',
      organisationName: 'حضانة المستكشفين الصغار',
      locale: 'ar',
      pages,
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: pages.length,
      locale: 'ar',
      pageTexts: pages.map((p) => p.text),
      missingAssetPageNumbers: [],
    });

    expect(result.ok).toBe(true);
  }, 30_000);

  it('renders and passes preflight for a long Arabic caption embedding a Latin name, without drawing any Arabic PDF text', async () => {
    // Arabic captions are baked into the illustration by Gemini (see
    // src/lib/providers/image/prompts.ts) — render.ts never draws Arabic
    // text as PDF content at all, so there is no font-shaping/wrapping
    // logic left to break here, regardless of embedded Latin names like
    // "Hala" or punctuation. This just proves the pipeline still produces
    // a valid, correctly-paginated PDF for this shape of input.
    const pages = [
      {
        pageNumber: 1,
        text: 'وقف Hala عند باب test، وهو يمسك حقيبته بقوة. شعرت بالقلق قليلاً.',
        imageBytes: onePxPng,
        imageContentType: 'image/png',
      },
    ];

    const pdfBytes = await renderStoryPdf({
      title: 'first day school',
      childName: 'Hala',
      organisationName: 'test',
      locale: 'ar',
      pages,
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: pages.length,
      locale: 'ar',
      pageTexts: pages.map((p) => p.text),
      missingAssetPageNumbers: [],
    });

    expect(result.ok).toBe(true);
  }, 30_000);
});

describe('runPreflight failure modes', () => {
  it('fails loudly when a page is missing its image asset', async () => {
    const pdfBytes = await renderStoryPdf({
      title: 'Test',
      childName: 'Maya',
      organisationName: 'Org',
      locale: 'en',
      pages: [{ pageNumber: 1, text: 'Hello', imageBytes: onePxPng, imageContentType: 'image/png' }],
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: 1,
      locale: 'en',
      pageTexts: ['Hello'],
      missingAssetPageNumbers: [1],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_ASSET')).toBe(true);
  }, 30_000);

  it('fails when an English story contains Arabic characters', async () => {
    const pdfBytes = await renderStoryPdf({
      title: 'Test',
      childName: 'Maya',
      organisationName: 'Org',
      locale: 'en',
      pages: [{ pageNumber: 1, text: 'Hello مرحبا', imageBytes: onePxPng, imageContentType: 'image/png' }],
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: 1,
      locale: 'en',
      pageTexts: ['Hello مرحبا'],
      missingAssetPageNumbers: [],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'UNSUPPORTED_CHARACTER')).toBe(true);
  }, 30_000);

  it('fails on a wrong page count', async () => {
    const pdfBytes = await renderStoryPdf({
      title: 'Test',
      childName: 'Maya',
      organisationName: 'Org',
      locale: 'en',
      pages: [{ pageNumber: 1, text: 'Hello', imageBytes: onePxPng, imageContentType: 'image/png' }],
    });

    const result = await runPreflight({
      pdfBytes,
      expectedPageCount: 99,
      locale: 'en',
      pageTexts: ['Hello'],
      missingAssetPageNumbers: [],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'PAGE_COUNT_MISMATCH')).toBe(true);
  }, 30_000);

  it('fails loudly on a corrupt / unparseable PDF rather than crashing', async () => {
    const result = await runPreflight({
      pdfBytes: new TextEncoder().encode('this is not a pdf'),
      expectedPageCount: 1,
      locale: 'en',
      pageTexts: [],
      missingAssetPageNumbers: [],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'EMPTY_DOCUMENT')).toBe(true);
  });
});
