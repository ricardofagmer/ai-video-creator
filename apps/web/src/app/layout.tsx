import '@studio/ui/styles.css';
import { I18nProvider, THEME_COOKIE_NAME, parseThemePreference, themeAttribute } from '@studio/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { template: `%s · ${t.app.productName}`, default: t.app.productName },
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme and the language are rendered on the server from their cookies, so no inline script
  // and no flash.
  const preference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  const { locale } = await getI18n();
  return (
    <html lang={locale} data-theme={themeAttribute(preference)}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
