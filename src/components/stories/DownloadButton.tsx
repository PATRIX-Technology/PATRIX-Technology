'use client';

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL yields "data:<mime>;base64,<data>" -- Filesystem.writeFile
      // wants just the base64 payload.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves/shares a fetched file using whichever mechanism actually works on
 * the platform running it, in order of preference:
 *
 * 1. Inside the Capacitor-wrapped native app (Android/iOS), a plain
 *    `<a download>` on a blob URL mostly does nothing — WebViews don't
 *    have a download manager hooked up the way a real browser does. So
 *    write the bytes to disk with @capacitor/filesystem and hand the
 *    real file:// path to @capacitor/share's native OS share sheet,
 *    which always offers "Save to Files" alongside WhatsApp/Telegram/
 *    Messenger/etc. — an actual file, not a link of any kind.
 * 2. A mobile browser that supports the Web Share API's file payload
 *    (iOS Safari 15+, Android Chrome) gets the same real-file share
 *    sheet via `navigator.share({ files })`. This is also the only
 *    reliable way to get a real download on iOS Safari specifically —
 *    it often just opens a blob PDF inline instead of saving it, and if
 *    that inline view's own Share button is then used, THAT is where a
 *    bare blob: URL (unopenable outside the tab that created it) can
 *    end up getting passed to WhatsApp/Telegram instead of the file
 *    itself. Sharing actual `File` bytes through the Web Share API
 *    sidesteps that blob-URL problem entirely.
 * 3. Everywhere else (desktop Windows/macOS/Linux browsers, older
 *    mobile browsers) — the original blob-URL-and-`<a download>` trick,
 *    which is well-supported there.
 */
async function saveOrShareFile(blob: Blob, fileName: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64Data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Cache });
    await Share.share({ title, files: [uri] });
    return;
  }

  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err) {
      // AbortError (the person cancelled the share sheet) is not a
      // failure -- nothing more to do. Any other error falls through
      // to the plain download below rather than leaving them stuck.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * A plain `<a href download>` to an API route gives no feedback at all
 * when the request fails - the browser either silently does nothing or,
 * worse, navigates the tab to a raw error response. Fetching the file
 * ourselves lets a failure surface as a toast instead. See
 * docs/DECISIONS.md "Toast notifications replace inline red errors".
 */
export function DownloadButton({
  href,
  fallbackFileName,
  failedTitle,
  failedBody,
  children,
  ...buttonProps
}: {
  href: string;
  fallbackFileName: string;
  failedTitle: string;
  failedBody: string;
} & Omit<ButtonProps, 'onClick' | 'isLoading'>) {
  const showToast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const response = await fetch(href);
      if (!response.ok) {
        // Surface the server's actual reason (e.g. a specific preflight
        // issue) instead of a one-size-fits-all toast — a nursery seeing
        // "page 2 has no generated image" can act on that; "something
        // went wrong" they can only retry blindly.
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || `Download failed with status ${response.status}`);
      }

      // Prefer the RFC 5987 filename* (the real Unicode name, e.g. an
      // Arabic child's name) over the plain filename="..." fallback,
      // which is ASCII-only — see src/lib/http/content-disposition.ts.
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const utf8Match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const plainMatch = /filename="([^"]+)"/.exec(disposition);
      const fileName = (utf8Match && decodeURIComponent(utf8Match[1]!)) || plainMatch?.[1] || fallbackFileName;

      const blob = await response.blob();
      await saveOrShareFile(blob, fileName, fileName);
    } catch (err) {
      // A server-provided reason (a specific preflight issue, a real
      // exception) is more useful than the generic fallback below, which
      // only fires for network failures that never reached the server.
      const serverReason = err instanceof Error ? err.message : '';
      showToast({
        title: failedTitle,
        description: serverReason || failedBody,
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} isLoading={loading} {...buttonProps}>
      {children}
    </Button>
  );
}
