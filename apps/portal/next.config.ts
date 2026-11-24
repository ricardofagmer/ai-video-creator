import type { NextConfig } from 'next';

/**
 * The portal is a static export (ADR 0010, plan rev 3 ticket 06): one HTML page and its assets,
 * no server routes, no middleware, no image optimizer, no analytics. Response headers cannot be
 * set from here under `output: 'export'`; `vercel.json` sets them, and the Content-Security-Policy
 * that limits `connect-src` to 127.0.0.1 and the manifest origin is a `<meta>` tag built from the
 * same configuration in `src/app/layout.tsx`.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  // @studio/ui ships TypeScript source and CSS Modules; @studio/shared ships zod schemas.
  transpilePackages: ['@studio/ui', '@studio/shared'],
  images: { unoptimized: true },
};

export default nextConfig;
