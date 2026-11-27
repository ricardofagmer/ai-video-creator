'use client';

import type { InstallPlatform } from '@studio/shared/api';
import { Alert, buttonClassName } from '@studio/ui';
import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';
import { isUpdateAvailable } from '@/release/compare-versions';
import type { ReleaseState } from '@/release/release-loader';
import { assetFor } from '@/release/release-manifest';

export interface UpdateNoticeProps {
  installedVersion: string;
  platform: InstallPlatform;
  release: ReleaseState;
}

/** DI-AC-17: shown over the installed states when `latest.json` names a newer version. */
export function UpdateNotice({ installedVersion, platform, release }: UpdateNoticeProps): ReactElement | null {
  const t = usePortalMessages();
  if (release.kind !== 'ready' || !isUpdateAvailable(installedVersion, release.manifest.version)) return null;
  const asset = assetFor(release.manifest, platform);
  return (
    <Alert
      variant="info"
      title={t.update.title}
      actions={
        asset === undefined ? undefined : (
          <a href={asset.url} rel="noopener noreferrer" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
            {t.update.download}
          </a>
        )
      }
    >
      <p>{t.update.body(installedVersion, release.manifest.version)}</p>
    </Alert>
  );
}
