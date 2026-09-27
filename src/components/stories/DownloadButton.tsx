'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

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

      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const fileName = match?.[1] ?? fallbackFileName;

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
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
