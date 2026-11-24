import { AssetCard, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { cartItemOf } from '@/features/cart/cart-item';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import layout from '@/features/common/layout.module.css';
import { FavoriteToggleButton } from '@/features/favorites/components/FavoriteToggleButton';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { isVoiceVersion } from '@/features/voices/voice-asset';
import { type WebMessages } from '@/messages';
import { formatDate } from '../catalog-labels';
import { imageLinkOf } from '../image-link-draft';
import { referencePostOf, videoThumbnailHref } from '../reference-post';
import { siteLinkOf } from '../site-link-draft';
import { storedImageHref } from '../stored-image';

interface CatalogAssetItemProps {
  version: AssetVersionView;
  /** Link to this exact version (`?versao=N`) instead of the asset's default version. */
  linkToVersion: boolean;
  /** Extra caption line, e.g. the similarity of a search by meaning. */
  detail?: string;
  /** Catalog texts of the active locale; passed in so the card renders on the server and in the client panel. */
  t: WebMessages['catalog'];
  locale: Locale;
  /** `h3` when the card sits under a category heading. */
  headingLevel?: 'h2' | 'h3';
}

/**
 * One catalog card with the version's score and both sample sizes under it (R2-AC-05, R3-AC-07). Every value is
 * rendered as text through React's escaping; nothing here is HTML from the api.
 */
export function CatalogAssetItem({ version, linkToVersion, detail, t, locale, headingLevel = 'h2' }: CatalogAssetItemProps): ReactElement {
  const href = linkToVersion ? `/catalogo/${version.id}?versao=${version.version}` : `/catalogo/${version.id}`;
  const post = referencePostOf(version);
  const imageLink = imageLinkOf(version);
  const siteLink = siteLinkOf(version);
  const storedImage = storedImageHref(version);
  const media =
    post !== null ? (
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img
          src={videoThumbnailHref(post)}
          alt={t.asset.thumbnailAlt(t.linkBox.platforms[post.platform])}
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
        />
      </Link>
    ) : imageLink !== null ? (
      // Straight from the owner's link (CSP `img-src https:`); the server never fetches it.
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img src={imageLink.href} alt={t.imageLink.previewAlt} width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </Link>
    ) : storedImage !== null ? (
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img src={storedImage} alt={t.imageLink.previewAlt} width={320} height={180} loading="lazy" decoding="async" />
      </Link>
    ) : undefined;
  return (
    <div className={layout.stack}>
      <AssetCard
        title={<Link href={href}>{version.name}</Link>}
        kindLabel={t.kinds[version.kind]}
        assetRef={`${version.id}@${version.version}`}
        status={version.status}
        sensitivity={version.sensitivity}
        tags={version.tags}
        usageCount={version.usageCount}
        updatedAtLabel={formatDate(version.updatedAt, locale)}
        headingLevel={headingLevel}
        media={media}
      />
      {siteLink !== null && (
        // The host only, as text: the server never fetched the page, so there is no preview to show.
        <p className="caption" title={siteLink.href}>
          {t.siteLink.host(siteLink.hostname)}
        </p>
      )}
      <div className={layout.row}>
        <CartToggleButton item={cartItemOf(version)} />
        {/* Marked per asset, so every version of one asset shares the star. */}
        <FavoriteToggleButton scope="catalog" id={version.id} name={version.name} />
        {isVoiceVersion(version) && <VoiceSampleButton assetId={version.id} version={version.version} name={version.name} />}
      </div>
      <p className="caption">
        <QualityScore
          qualityScore={version.qualityScore}
          qualitySampleSize={version.qualitySampleSize}
          qualityPlatformSampleSize={version.qualityPlatformSampleSize}
          label={t.quality.score}
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
