import 'server-only';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';

export interface BulkZipEntry {
  fileName: string;
  pdfBytes: Uint8Array;
}

/**
 * Streams a set of already-rendered, already-preflighted story PDFs into
 * a single ZIP for class-level bulk download. Rendering/preflight happen
 * per-story beforehand — this module only concatenates the results.
 */
export async function buildBulkZip(entries: BulkZipEntry[]): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  archive.pipe(stream);

  for (const entry of entries) {
    archive.append(Buffer.from(entry.pdfBytes), { name: entry.fileName });
  }

  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });

  await archive.finalize();
  return done;
}

export function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
}
