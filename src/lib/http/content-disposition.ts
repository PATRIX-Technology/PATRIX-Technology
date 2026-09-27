import 'server-only';

/**
 * HTTP header values must be ISO-8859-1 (Latin1) bytes — a bare
 * `filename="..."` containing an Arabic child's name throws
 * "Cannot convert argument to a ByteString" the moment the response is
 * constructed, after rendering/preflight/upload have all already
 * succeeded. RFC 6266 / RFC 5987's `filename*=UTF-8''<percent-encoded>`
 * carries the real Unicode name (every modern browser understands it);
 * `filename="..."` stays as an ASCII-safe fallback for anything that
 * doesn't.
 */
export function contentDispositionHeader(fileName: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_');
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
