import type { NextConfig } from 'next';

/**
 * The web is a loopback-only app (A9, PRD 12): the dev and start scripts bind 127.0.0.1, the
 * middleware refuses foreign Host headers, and no page may be framed.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @studio/ui ships TypeScript source and CSS Modules; @studio/shared ships zod schemas.
  transpilePackages: ['@studio/ui', '@studio/shared'],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
