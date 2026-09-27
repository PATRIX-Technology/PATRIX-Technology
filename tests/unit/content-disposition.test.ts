import { describe, expect, it } from 'vitest';
import { contentDispositionHeader } from '@/lib/http/content-disposition';

describe('contentDispositionHeader', () => {
  it('never puts a non-Latin1 character in the plain filename param', () => {
    // A raw Arabic filename in the plain `filename="..."` param throws
    // "Cannot convert argument to a ByteString" the moment the response
    // headers are constructed — this broke every Arabic child's PDF
    // download in production. Guard against it staying fixed.
    const header = contentDispositionHeader('بيسان-national_day_gratitude.pdf');
    const plainMatch = /filename="([^"]+)"/.exec(header);
    expect(plainMatch?.[1]).toMatch(/^[\x20-\x7e]+$/);
  });

  it('carries the real Unicode name via filename*=UTF-8', () => {
    const header = contentDispositionHeader('بيسان-national_day_gratitude.pdf');
    const utf8Match = /filename\*=UTF-8''([^;]+)/.exec(header);
    expect(utf8Match).not.toBeNull();
    expect(decodeURIComponent(utf8Match![1]!)).toBe('بيسان-national_day_gratitude.pdf');
  });

  it('leaves a plain ASCII filename unchanged in the fallback param', () => {
    const header = contentDispositionHeader('Aisha-national_day_gratitude.pdf');
    expect(header).toContain('filename="Aisha-national_day_gratitude.pdf"');
  });
});
