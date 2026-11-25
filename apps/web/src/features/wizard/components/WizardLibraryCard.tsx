import { Badge, Button, StatusBadge, uiMessages, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import { cartKindArtwork } from '@/features/cart/cart-kind-artwork';
import catalogStyles from '@/features/catalog/catalog.module.css';
import { formatDate } from '@/features/catalog/catalog-labels';
import { referencePostOf, videoThumbnailHref } from '@/features/catalog/reference-post';
import { PosterCard } from '@/features/common/components/PosterCard';
import poster from '@/features/common/poster-card.module.css';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { type WebMessages } from '@/messages';

interface WizardLibraryCardProps {
  version: AssetVersionView;
  added: boolean;
  /** The video already holds as many references as a run takes. */
  full: boolean;
  onAdd: () => void;
  t: WebMessages;
  locale: Locale;
}

/**
 * The catalog card as the wizard dialog shows it: the same cover and facts, with no link at all
 * (the dialog never leaves the wizard) and one action, "Add" to the video.
 */
export function WizardLibraryCard({ version, added, full, onAdd, t, locale }: WizardLibraryCardProps): ReactElement {
  const post = referencePostOf(version);
  const ui = uiMessages[locale].catalog;
  const ref = `${version.id}@${version.version}`;
  const media =
    post !== null ? (
      <img
        src={videoThumbnailHref(post)}
        alt={t.catalog.asset.thumbnailAlt(t.catalog.linkBox.platforms[post.platform])}
        width={320}
        height={180}
        loading="lazy"
        decoding="async"
      />
    ) : undefined;
  return (
    <PosterCard artwork={cartKindArtwork[version.kind]} media={media} density="compact">
      <p className={poster.meta}>
        <span className="overline">{t.catalog.kinds[version.kind]}</span>
        <StatusBadge kind="asset" status={version.status} />
        {version.sensitivity !== 'normal' && <StatusBadge kind="sensitivity" status={version.sensitivity} />}
      </p>
      <h3 className={`heading-3 ${poster.name}`}>{version.name}</h3>
      <p className="caption mono">{ref}</p>
      {version.tags.length > 0 && (
        <ul className={catalogStyles.posterTags} aria-label={ui.tags}>
          {version.tags.map((tag) => (
            <li key={tag}>
              <Badge tone="neutral">{tag}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="caption">
        {ui.usedIn(version.usageCount)}
        <span aria-hidden="true"> · </span>
        {ui.updatedAt(formatDate(version.updatedAt, locale))}
      </p>
      <p className="caption">
        <QualityScore
          qualityScore={version.qualityScore}
          qualitySampleSize={version.qualitySampleSize}
          qualityPlatformSampleSize={version.qualityPlatformSampleSize}
          label={t.catalog.quality.score}
        />
      </p>
      <div className={poster.links}>
        <Button size="sm" variant="secondary" disabled={added || full} onClick={onAdd}>
          {added ? t.runs.references.added : t.runs.references.add}
          <span className="visually-hidden"> {ref}</span>
        </Button>
      </div>
    </PosterCard>
  );
}
