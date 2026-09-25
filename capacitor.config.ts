import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Khayali is a server-rendered Next.js app (Server Actions, dynamic
 * per-tenant dashboard routes, API routes) - not a static site, so a
 * static `next export` bundle can't power these native shells (Server
 * Actions and dynamic rendering simply don't exist in a static export).
 * Instead the native app is a thin WebView shell that loads the real,
 * live deployment over the network, same as any browser would. See
 * docs/en/mobile.md "Why server.url, not a static export".
 */
const config: CapacitorConfig = {
  appId: 'com.khayali.app',
  appName: 'Khayali',
  webDir: 'mobile-www',
  server: {
    // TODO before building: point this at the real production domain
    // once one exists (see docs/NEEDS_FROM_ME.md) - a vercel.app preview
    // URL works for local testing in the meantime.
    url: 'https://khayali.example.com',
    cleartext: false,
  },
  backgroundColor: '#14152B',
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#14152B',
  },
};

export default config;
