import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    // No per-request nonce: that requires forcing every route to dynamic
    // rendering (Next.js docs' own CSP recipe), which this app doesn't
    // currently pay for -- several dashboard/auth pages are SSG. Without
    // a nonce, script-src needs 'unsafe-inline' because Next.js itself
    // injects real inline <script> tags for RSC hydration payloads on
    // every page (self.__next_f.push(...)), not just inert JSON --
    // confirmed by inspecting a production-built page's HTML. style-src
    // needs it too, for this app's own inline style={{...}} attributes.
    // Every other directive below still meaningfully narrows the attack
    // surface: no third-party script/object/frame origins, no cross-
    // origin fetch/XHR target besides this app's own Supabase project,
    // and no framing of this app by anyone. See docs/DECISIONS.md
    // "Content-Security-Policy header".
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
