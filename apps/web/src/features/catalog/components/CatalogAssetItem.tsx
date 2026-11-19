import { AssetCard } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { assetKindLabels, formatDate } from '../catalog-labels';

interface CatalogAssetItemProps {
  version: AssetVersionView;
  /** Link to this exact version (`?versao=N`) instead of the asset's default version. */
  linkToVersion: boolean;
  /** Extra caption line, e.g. the similarity of a search by meaning. */
  detail?: string;
}

/**
 * One catalog card with the version's score and both sample sizes under it (R2-AC-05, R3-AC-07). Every value is
 * rendered as text through React's escaping; nothing here is HTML from the api.
 */
export function CatalogAssetItem({ version, linkToVersion, detail }: CatalogAssetItemProps): ReactElement {
  const href = linkToVersion ? `/catalogo/${version.id}?versao=${version.version}` : `/catalogo/${version.id}`;
  return (
    <div className={layout.stack}>
      <AssetCard
        title={<Link href={href}>{version.name}</Link>}
        kindLabel={assetKindLabels[version.kind]}
        assetRef={`${version.id}@${version.version}`}
        status={version.status}
        sensitivity={version.sensitivity}
        tags={version.tags}
        usageCount={version.usageCount}
        updatedAtLabel={formatDate(version.updatedAt)}
      />
      <p className="caption">
        <QualityScore
          qualityScore={version.qualityScore}
          qualitySampleSize={version.qualitySampleSize}
          qualityPlatformSampleSize={version.qualityPlatformSampleSize}
        />
        {detail !== undefined && (
          <>
            <span aria-hidden="true"> · </span>
            <span>{detail}</span>
          </>
        )}
      </p>
    </div>
  );
}
