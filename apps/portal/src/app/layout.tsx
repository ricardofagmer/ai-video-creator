import '@studio/ui/styles.css';
import { DEFAULT_LOCALE } from '@studio/ui';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { contentSecurityPolicy, readPortalConfig } from '@/config/portal-config';

export const metadata: Metadata = {
  title: 'EngineOS Video Creator',
  description: 'Download EngineOS Video Creator and check the studio installed on this computer.',
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

/**
 * Static shell. The theme follows the operating system (`color-scheme: light dark` in the kit's
 * tokens); the portal stores no preference, so it never writes the kit's theme cookie. The CSP
 * meta tag is computed at build from the same public configuration the page uses.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const csp = contentSecurityPolicy(readPortalConfig(), process.env.NODE_ENV === 'development' ? 'development' : 'production');
  return (
    <html lang={DEFAULT_LOCALE}>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </head>
      <body>{children}</body>
    </html>
  );
}
