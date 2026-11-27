'use client';

import { DEFAULT_LOCALE, I18nProvider, Logo, negotiateLocale, type Locale } from '@studio/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { readPortalConfig } from '@/config/portal-config';
import { useDetection } from '@/detection/use-detection';
import { usePortalMessages } from '@/messages';
import { detectOperatingSystem, type OperatingSystem } from '@/platform/browser-platform';
import { useRelease } from '@/release/use-release';
import { DetectionPanel } from './DetectionPanel';
import { DownloadPanel } from './DownloadPanel';
import { LanguagePicker } from './LanguagePicker';
import styles from './portal.module.css';

/** Read once per bundle: the values are inlined at build, so the object stays referentially stable. */
const portalConfig = readPortalConfig();

/**
 * The whole portal. The static HTML renders in pt-BR; in the browser the page switches to the
 * visitor's language (`navigator.languages`) and reads the user agent. No cookie is written.
 */
export function PortalPage(): ReactElement {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const negotiated = negotiateLocale(navigator.languages.join(','));
    if (negotiated !== undefined) setLocale(negotiated);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nProvider locale={locale}>
      <PortalContent onLocaleChange={setLocale} />
    </I18nProvider>
  );
}

function PortalContent({ onLocaleChange }: { onLocaleChange: (locale: Locale) => void }): ReactElement {
  const t = usePortalMessages();
  const detection = useDetection(portalConfig);
  const release = useRelease(portalConfig.releaseManifest);
  const [operatingSystem, setOperatingSystem] = useState<OperatingSystem | undefined>(undefined);

  useEffect(() => {
    setOperatingSystem(detectOperatingSystem(navigator.userAgent));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <LanguagePicker onChange={onLocaleChange} />
      </header>
      <main id="main" className={styles.stack}>
        {/* Brand kit v1 hero; decorative, the product name is already in the header. */}
        <img src="/brand/engineos-hero.png" alt="" aria-hidden="true" width={1446} height={217} className={styles.hero} />
        <h1 className="heading-1">{t.header.tagline}</h1>
        <DetectionPanel
          state={detection.state}
          release={release}
          studioUrl={portalConfig.studioUrl}
          onCheckAgain={detection.checkAgain}
        />
        <DownloadPanel release={release} operatingSystem={operatingSystem} />
      </main>
      <footer>
        <p className={`caption ${styles.footer}`}>{t.footer.privacy}</p>
      </footer>
    </div>
  );
}
