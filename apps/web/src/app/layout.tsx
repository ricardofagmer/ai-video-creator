import '@studio/ui/styles.css';
import { THEME_COOKIE_NAME, parseThemePreference, themeAttribute } from '@studio/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { template: '%s · EngineOS Video Creator', default: 'EngineOS Video Creator' },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme is rendered on the server from the cookie, so no inline script and no flash.
  const preference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  return (
    <html lang="pt-BR" data-theme={themeAttribute(preference)}>
      <body>{children}</body>
    </html>
  );
}
