import { describe, expect, it } from 'vitest';
import { sniffImageMimeType } from '@/lib/domain/children';

describe('sniffImageMimeType', () => {
  it('identifies a real JPEG by its magic bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageMimeType(bytes)).toBe('image/jpeg');
  });

  it('identifies a real PNG by its magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffImageMimeType(bytes)).toBe('image/png');
  });

  it('identifies a real WEBP by its magic bytes', () => {
    // RIFF <4-byte size> WEBP
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageMimeType(bytes)).toBe('image/webp');
  });

  it('rejects a file whose bytes do not match any allowed image format, regardless of a claimed type', () => {
    // The bytes a browser would send for an HTML file with a script tag --
    // this is exactly what uploadChildPhotoAction guards against: a
    // client can set file.type to 'image/jpeg' in the multipart request
    // no matter what the actual content is, so the server must never
    // trust that claim.
    const bytes = new TextEncoder().encode('<script>alert(1)</script>');
    expect(sniffImageMimeType(bytes)).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(sniffImageMimeType(new Uint8Array())).toBeNull();
  });

  it('rejects bytes that are merely a truncated/too-short signature', () => {
    expect(sniffImageMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMimeType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});
