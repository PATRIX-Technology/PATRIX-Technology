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
 * The one mechanism that reliably triggers an actual on-device download
 * on every browser, OS, and WebView, mobile included: a genuine
 * same-tab navigation to the real endpoint, which sets
 * `Content-Disposition: attachment` — so the BROWSER's own native
 * download handling takes over, exactly like any plain download link
 * on any site. Same-tab, not `window.open(..., '_blank')`: many mobile
 * browsers and in-app/WebView contexts (Capacitor's included) either
 * block a JS-initiated new tab outright or simply don't support opening
 * one at all, in which case `window.open` just does nothing —
 * confirmed on a real device, worse than the blob-URL fallback it
 * replaced. Same-tab navigation has no such requirement: when the
 * response really is `Content-Disposition: attachment`, the browser
 * intercepts it as a pure download and the current page never actually
 * changes — no popup blocker involved, and nothing to be unsupported.
 * The one tradeoff is the (rare) error case, where the response is a
 * plain JSON error with no attachment header and the tab genuinely
 * navigates to show it — recoverable via the dashboard's own corner
 * back button.
 */
function downloadDirectly(href: string) {
  window.location.assign(href);
}

/**
 * Saves/shares an already-fetched file via the OS's native share sheet
 * where one is available — letting the person pick WhatsApp/Telegram/
 * Messenger/"Save to Files" from a single action — falling back to
 * downloadDirectly() (see above) wherever it isn't:
 *
 * 1. Inside the Capacitor-wrapped native app (Android/iOS), write the
 *    bytes to disk with @capacitor/filesystem and hand the real
 *    file:// path to @capacitor/share's native share sheet — an actual
 *    file, never a link of any kind.
 * 2. A mobile browser that supports the Web Share API's file payload
 *    (iOS Safari 15+, Android Chrome) gets the same real-file share
 *    sheet via `navigator.share({ files })`. Sharing actual `File`
 *    bytes this way is also what stops a bare, unopenable `blob:` URL
 *    (only valid inside the tab that created it) from ending up in
 *    WhatsApp/Telegram if the browser's own inline PDF viewer's Share
 *    button gets used instead of this one.
 */
async function saveOrShareFile(blob: Blob, fileName: string, title: string, href: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Cache });
      await Share.share({ title, files: [uri] });
      return;
    } catch {
      downloadDirectly(href);
      return;
    }
  }

  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err) {
      // AbortError (the person cancelled the share sheet) is not a
      // failure -- nothing more to do.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  downloadDirectly(href);
}

/**
 * A plain `<a href download>` to an API route gives no feedback at all
 * when the request fails - the browser either silently does nothing or,
 * worse, navigates the tab to a raw error response. Fetching the file
 * ourselves lets a failure surface as a toast instead. See
 * docs/DECISIONS.md "Toast notifications replace inline red errors".
 *
 * That fetch-first approach is only worth its cost (an extra full
 * request, since this route re-renders the PDF/ZIP each call) when the
 * file bytes are actually needed for one of the share tiers above.
 * Otherwise — no Capacitor, no Web Share file support, which is most
 * desktop browsers and evidently some mobile ones too — it's skipped
 * entirely in favour of downloadDirectly() straight away, fired
 * synchronously inside this click handler so it's never at risk of
 * losing "user activation" the way an async fetch-then-share sequence
 * can (some browsers silently refuse navigator.share() once that
 * window has passed).
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
    const probeFile = new File([], fallbackFileName, { type: 'application/pdf' });
    const canUseFileShare =
      Capacitor.isNativePlatform() ||
      (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [probeFile] }));

    if (!canUseFileShare) {
      downloadDirectly(href);
      return;
    }

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
      await saveOrShareFile(blob, fileName, fileName, href);
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
