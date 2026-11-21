import type { NextConfig } from 'next';

/**
 * Browser features no page uses are off for every origin. Kept at their default (`self`) because
 * the app uses them: fullscreen and picture-in-picture of the video player, clipboard-write of the
 * publish form.
 */
const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

/**
 * The web is a loopback-only app (A9, PRD 12): the dev and start scripts bind 127.0.0.1, the
 * middleware refuses foreign Host headers, and no page may be framed. The Content-Security-Policy
 * is set per request by `src/middleware.ts`, because its script nonce changes on every page; a
 * second, static CSP here would be enforced alongside it and block every nonced script.
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
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
