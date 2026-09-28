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
 * one at all, in which case `window.open` just does nothing.
 *
 * One confirmed, WebKit-only exception: on iPhone/iPad Safari (and every
 * other iOS browser — Apple requires all of them to use WebKit under the
 * hood), Safari deliberately overrides BOTH `Content-Disposition:
 * attachment` and the HTML `download` attribute for file types it can
 * render itself, PDFs included — it always opens its own inline PDF
 * viewer instead. This is a longstanding, still-open WebKit limitation
 * (see e.g. https://bugs.webkit.org/show_bug.cgi?id=167341 and
 * https://developer.apple.com/forums/thread/803421), not something
 * fixable from page code — every website that serves a PDF behaves the
 * same way on an iPhone. See isIOS()/showIOSSaveHint() below for how
 * this app tells the user what to do next instead of pretending it
 * downloaded silently like it does elsewhere.
 */
function downloadDirectly(href: string) {
  window.location.assign(href);
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Saves/shares an already-fetched file via the Capacitor native share
 * sheet where one is available, falling back to downloadDirectly()
 * (see above) everywhere else:
 *
 * Inside the Capacitor-wrapped native app (Android/iOS), write the
 * bytes to disk with @capacitor/filesystem and hand the real file://
 * path to @capacitor/share's native share sheet — a real OS API call,
 * not a browser one.
 *
 * Deliberately NOT using the browser's own Web Share API
 * (`navigator.share({ files })`) for this: it looked like the right
 * tool (a real `File`, not a blob: link), but on a real iPhone its
 * "Save to Files" option silently failed to save anything at all —
 * this is a known, still-unreliable WebKit implementation of Web
 * Share's file support, not something this app's own code can fix.
 * downloadDirectly()'s plain navigation, relying on the server's own
 * `Content-Disposition: attachment` header, is the one path that's
 * actually held up across real desktop and mobile testing so far.
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
 * file bytes are actually needed — i.e. only inside the Capacitor
 * native app. Every ordinary browser, mobile included, skips it
 * entirely in favour of downloadDirectly() straight away, fired
 * synchronously inside this click handler so it's never at risk of
 * losing "user activation".
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
    if (!Capacitor.isNativePlatform()) {
      // On iOS, Safari (and every other iOS browser, which are all
      // WebKit under the hood) always opens its own PDF viewer here
      // instead of downloading — a platform limitation, not a bug in
      // this app, and true of every website's PDF links on an iPhone.
      // The one thing genuinely fixable from here is not leaving the
      // person guessing why nothing landed in Files: telling them the
      // one working path (Safari's own Share button, not this app's
      // JS) up front.
      if (isIOS()) {
        showToast({
          title: 'Opening your PDF',
          description: 'To save it, tap the Share icon in Safari, then "Save to Files".',
          tone: 'info',
        });
      }
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
