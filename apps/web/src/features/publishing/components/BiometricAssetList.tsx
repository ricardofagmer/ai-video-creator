import { Alert } from '@studio/ui';
import { type PublishBiometricAssetView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { assetKindLabels } from '@/features/catalog/catalog-labels';
import { biometricIntroText } from '../publish-labels';
import styles from '../publishing.module.css';

interface BiometricAssetListProps {
  platform: Platform;
  assets: readonly PublishBiometricAssetView[];
}

/**
 * OD4, AC 46: every biometric asset version of the run, named by title, kind and `assetId@version`,
 * never by path; the view carries none. Clicking "Publicar em {plataforma}" with this list shown
 * is the per-action confirmation PRD 12 asks for.
 */
export function BiometricAssetList({ platform, assets }: BiometricAssetListProps): ReactElement | null {
  if (assets.length === 0) return null;
  return (
    <Alert variant="warning" title={biometricIntroText(platform)}>
      <ul className={styles.biometricList}>
        {assets.map((asset) => (
          <li key={asset.ref}>
            <span className="label">{asset.title}</span>
            {' · '}
            <span>{assetKindLabels[asset.kind]}</span>
            {' · '}
            <span className="mono">{asset.ref}</span>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
