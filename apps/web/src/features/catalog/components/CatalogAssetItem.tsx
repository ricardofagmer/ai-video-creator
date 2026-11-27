import { Badge, StatusBadge, buttonClassName, uiMessages, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { cartKindArtwork } from '@/features/cart/cart-kind-artwork';
import { cartItemOf } from '@/features/cart/cart-item';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import { PosterCard } from '@/features/common/components/PosterCard';
import poster from '@/features/common/poster-card.module.css';
import { FavoriteToggleButton } from '@/features/favorites/components/FavoriteToggleButton';
import { MusicPreviewButton } from '@/features/music/components/MusicPreviewButton';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { SkillStage } from '@/features/skills/components/SkillStage';
import { skillStageOf } from '@/features/skills/skill-stage';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { isVoiceVersion } from '@/features/voices/voice-asset';
import { type WebMessages } from '@/messages';
import styles from '../catalog.module.css';
import { formatDate } from '../catalog-labels';
import { editHrefOf } from '../catalog-edit-href';
import { imageLinkOf } from '../image-link-draft';
import { referencePostOf, videoThumbnailHref } from '../reference-post';
import { siteLinkOf } from '../site-link-draft';
import { CatalogPreviewHover } from './CatalogPreviewHover';
import { DiscontinueAssetButton } from './DiscontinueAssetButton';
import { SiteEmbed } from './SiteEmbed';
import { TemplatePreviewHover } from './TemplatePreviewHover';
import { templateCategoryOf } from '../template-categories';
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
  // AP-11: the purpose names the picture for screen readers; an empty one keeps the old texts. The hover popover shows it to sighted users.
  const purpose = version.purpose.trim();
  const altOf = (fallback: string): string => (purpose === '' ? fallback : purpose);
  const media =
    post !== null ? (
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img
          src={videoThumbnailHref(post)}
          alt={altOf(t.asset.thumbnailAlt(t.linkBox.platforms[post.platform]))}
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
        />
      </Link>
    ) : imageLink !== null ? (
      // Straight from the owner's link (CSP `img-src https:`); the server never fetches it.
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img src={imageLink.href} alt={altOf(t.imageLink.previewAlt)} width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </Link>
    ) : storedImage !== null ? (
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <img src={storedImage} alt={altOf(t.imageLink.previewAlt)} width={320} height={180} loading="lazy" decoding="async" />
      </Link>
    ) : siteLink !== null ? (
      // The viewer's browser loads the page straight from the owner's link; the server never fetches it.
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <SiteEmbed href={siteLink.href} title={t.siteLink.embedTitle(siteLink.hostname)} mode="preview" />
      </Link>
    ) : version.kind === 'skill' ? (
      // Decoration only, so the card's own stretched link stays the one way in.
      <SkillStage kind={skillStageOf(version)} />
    ) : undefined;
  const ui = uiMessages[locale].catalog;
  const Heading = headingLevel;
  return (
    <PosterCard artwork={cartKindArtwork[version.kind]} media={media} coverShape={siteLink !== null ? 'screen' : 'band'} density="compact">
        <p className={poster.meta}>
          <span className="overline">{t.kinds[version.kind]}</span>
          <StatusBadge kind="asset" status={version.status} />
          {version.sensitivity !== 'normal' && <StatusBadge kind="sensitivity" status={version.sensitivity} />}
        </p>
        <Heading className={`heading-3 ${poster.name}`}>
          <Link href={href} className={poster.cardLink}>
            {version.name}
          </Link>
        </Heading>
        <p className="caption mono">{`${version.id}@${version.version}`}</p>
        {/* The hover preview shows a visual of the item and what it is for (purpose), per kind. */}
        {version.kind === 'template' ? (
          <TemplatePreviewHover version={version} category={templateCategoryOf(version)} />
        ) : (
          <CatalogPreviewHover version={version} />
        )}
        {version.tags.length > 0 && (
          <ul className={styles.posterTags} aria-label={ui.tags}>
            {version.tags.map((tag) => (
              <li key={tag}>
                <Badge tone="neutral">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        {version.kind === 'music' && version.details.categories.length > 0 && (
          <ul className={styles.posterTags} aria-label={t.musicChoice.categoriesLegend}>
            {version.details.categories.map((category) => (
              <li key={category}>
                <Badge tone="neutral">{t.musicChoice.categories[category]}</Badge>
              </li>
            ))}
          </ul>
        )}
        {siteLink !== null && (
          <p className="caption" title={siteLink.href}>
            {t.siteLink.host(siteLink.hostname)}
          </p>
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
            label={t.quality.score}
          />
          {detail !== undefined && (
            <>
              <span aria-hidden="true"> · </span>
              <span>{detail}</span>
            </>
          )}
        </p>
        <div className={poster.links}>
          <CartToggleButton item={cartItemOf(version)} />
          {/* Marked per asset, so every version of one asset shares the star. */}
          <FavoriteToggleButton scope="catalog" id={version.id} name={version.name} />
          {version.kind === 'music' && <MusicPreviewButton assetId={version.id} version={version.version} name={version.name} />}
          {isVoiceVersion(version) && <VoiceSampleButton assetId={version.id} version={version.version} name={version.name} />}
          <Link href={editHrefOf(version)} className={buttonClassName({ variant: 'secondary', size: 'sm' })} aria-label={t.list.editHidden(version.name)}>
            {t.list.edit}
          </Link>
          {/* Per asset, like the star: it deprecates every version, not only the one on the card. */}
          <DiscontinueAssetButton assetId={version.id} name={version.name} />
        </div>
    </PosterCard>
  );
}
