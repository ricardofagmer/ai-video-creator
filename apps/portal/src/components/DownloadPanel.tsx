'use client';

import { Alert, Button, Card, DescriptionList, Spinner, buttonClassName, formatBytes, formatDate, textLinkClassName, useI18n } from '@studio/ui';
import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';
import type { OperatingSystem } from '@/platform/browser-platform';
import type { ReleaseState } from '@/release/release-loader';
import { assetFor, ffmpegSource, type ReleaseManifest } from '@/release/release-manifest';
import { GatekeeperSteps } from './GatekeeperSteps';
import styles from './portal.module.css';

export interface DownloadPanelProps {
  release: ReleaseState;
  /** `undefined` until the page has read the user agent in the browser. */
  operatingSystem: OperatingSystem | undefined;
}

/** Downloads from `latest.json` (C2 rev 2). Every value shown comes from the parsed manifest. */
export function DownloadPanel({ release, operatingSystem }: DownloadPanelProps): ReactElement {
  const t = usePortalMessages();
  return (
    <Card title={t.downloads.heading}>
      <div className={styles.stack}>{renderRelease()}</div>
    </Card>
  );

  function renderRelease(): ReactElement {
    switch (release.kind) {
      case 'not-configured':
        return (
          <>
            <UnpublishedDownload />
            <Alert variant="info" title={t.downloads.notConfigured.title}>
              <p>{t.downloads.notConfigured.body}</p>
            </Alert>
          </>
        );
      case 'loading':
        return <Spinner size="sm" label={t.downloads.loading} />;
      case 'failed':
        return (
          <>
            <UnpublishedDownload />
            <Alert variant="warning" title={t.downloads.failed.title}>
              <p>{t.downloads.failed.body}</p>
            </Alert>
          </>
        );
      case 'ready':
        return <ReleaseDownloads manifest={release.manifest} operatingSystem={operatingSystem} />;
    }
  }
}

/** The macOS button stays visible, disabled, while no release can be read; it never links to a file that does not exist. */
function UnpublishedDownload(): ReactElement {
  const t = usePortalMessages();
  return (
    <div className={styles.stack}>
      <h3 className="heading-3">{t.downloads.macos.title}</h3>
      <p className={`caption ${styles.paragraph}`}>{t.downloads.macos.requirement}</p>
      <div className={styles.actions}>
        <Button disabled aria-describedby="download-not-published">
          {t.downloads.macos.download}
        </Button>
      </div>
      <p id="download-not-published" className={`body-sm ${styles.paragraph}`}>
        {t.downloads.macos.notPublished}
      </p>
    </div>
  );
}

function ReleaseDownloads({
  manifest,
  operatingSystem,
}: {
  manifest: ReleaseManifest;
  operatingSystem: OperatingSystem | undefined;
}): ReactElement {
  const t = usePortalMessages();
  const { locale } = useI18n();
  const macAsset = assetFor(manifest, 'darwin-arm64');
  return (
    <>
      <p className={`body ${styles.paragraph}`}>
        {t.downloads.release(manifest.version)} · {t.downloads.publishedAt} {formatDate(manifest.publishedAt, locale)}
      </p>
      {operatingSystem === 'other' && (
        <Alert variant="info">
          <p>{t.downloads.otherSystem}</p>
        </Alert>
      )}
      <div className={styles.stack}>
        <h3 className="heading-3">{t.downloads.macos.title}</h3>
        <p className={`caption ${styles.paragraph}`}>{t.downloads.macos.requirement}</p>
        {macAsset === undefined ? (
          <p className={`body-sm ${styles.paragraph}`}>{t.downloads.missingAsset}</p>
        ) : (
          <>
            <div className={styles.actions}>
              <a
                href={macAsset.url}
                rel="noopener noreferrer"
                className={buttonClassName({ variant: operatingSystem === 'windows' ? 'secondary' : 'primary' })}
              >
                {t.downloads.macos.download}
              </a>
            </div>
            <DescriptionList
              items={[
                { term: t.downloads.file, description: macAsset.file, mono: true },
                { term: t.downloads.size, description: formatBytes(macAsset.bytes, locale) },
                {
                  term: t.downloads.sha256,
                  description: <span className={styles.hash}>{macAsset.sha256.toLowerCase()}</span>,
                  mono: true,
                },
              ]}
            />
            <p className={`caption ${styles.paragraph}`}>{t.downloads.sha256Hint}</p>
            <GatekeeperSteps />
          </>
        )}
      </div>
      <div className={styles.stack}>
        <h3 className="heading-3">{t.downloads.windows.title}</h3>
        <p className={`body-sm ${styles.paragraph}`}>{t.downloads.windows.comingNext}</p>
      </div>
      <FfmpegSource manifest={manifest} />
    </>
  );
}

function FfmpegSource({ manifest }: { manifest: ReleaseManifest }): ReactElement {
  const t = usePortalMessages();
  const source = ffmpegSource(manifest);
  return (
    <div className={styles.stack}>
      <h3 className="heading-3">{t.downloads.ffmpeg.title}</h3>
      {source === undefined ? (
        <p className={`body-sm ${styles.paragraph}`}>{t.downloads.ffmpeg.missing}</p>
      ) : (
        <>
          <p className={`body-sm ${styles.paragraph}`}>{t.downloads.ffmpeg.body(source.licence)}</p>
          <p className={`body-sm ${styles.paragraph}`}>
            <a href={source.url} rel="noopener noreferrer" className={textLinkClassName()}>
              {t.downloads.ffmpeg.link}
            </a>
          </p>
          <DescriptionList
            items={[{ term: t.downloads.sha256, description: <span className={styles.hash}>{source.sha256.toLowerCase()}</span>, mono: true }]}
          />
        </>
      )}
    </div>
  );
}
