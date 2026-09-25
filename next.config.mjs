import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // harfbuzzjs (real Arabic text shaping for PDF generation, see
    // src/lib/providers/pdf/harfbuzz-shape.ts) resolves its own WASM file
    // via `import.meta.url` internally. Letting webpack bundle/transform
    // that call bakes in the BUILD machine's absolute filesystem path,
    // which breaks the moment the built function runs somewhere else
    // (confirmed: a real deployment failed with "t is not a function" —
    // the minified stand-in for a rejected createRequire() call against a
    // path that only existed on the build machine). Excluding it here
    // makes Next.js load it via plain Node module resolution at runtime
    // instead, so it resolves relative to wherever node_modules actually
    // is when the function executes.
    serverComponentsExternalPackages: ['harfbuzzjs'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
