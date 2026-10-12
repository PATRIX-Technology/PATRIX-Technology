import { describe, expect, it } from 'vitest';
import { measureArabicTextLines } from '@/lib/providers/pdf/arabic-text-vector';

describe('measureArabicTextLines', () => {
  it('wraps a short caption onto a single line at a generous width', async () => {
    const lines = await measureArabicTextLines('مرحبا بك في القصة', 15, 400);
    expect(lines).toBe(1);
  });

  it('wraps onto more lines as the available width shrinks', async () => {
    const text = 'الثعلب الصغير اختبأ خلف بوابة الحديقة الجميلة في عصر يوم مشمس وهادئ';
    const wide = await measureArabicTextLines(text, 15, 400);
    const narrow = await measureArabicTextLines(text, 15, 120);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('never returns zero lines for non-empty text', async () => {
    expect(await measureArabicTextLines('نهاية', 14, 300)).toBeGreaterThanOrEqual(1);
  });
});
