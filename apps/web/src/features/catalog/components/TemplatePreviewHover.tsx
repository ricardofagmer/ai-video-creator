'use client';

import { Badge } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import { templatePreviewMediaUrls } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { useTemplatePreview } from '../hooks/useTemplatePreview';
import { templateCategories, type CatalogCategory } from '../template-categories';
import { CardHoverPopover } from './CardHoverPopover';
import { GlyphVisual } from './CatalogPreviewHover';
import styles from './CardHoverPopover.module.css';

const POPOVER_WIDTH_PX = 220;

export interface TemplatePreviewHoverProps {
  version: AssetVersionView;
  /** Picks the fallback description; a user-created category uses the generic one. */
  category: CatalogCategory;
}

/**
 * Template preview (2026-11-25): while the pointer or focus is on a template card, a small popover
 * beside the card plays the template's muted sample clip with what the template is for. While the
 * watcher is still rendering the clip, the popover shows a "rendering" badge; a template without a
 * clip shows its glyph. The description is the version's purpose, else its category's description.
 */
export function TemplatePreviewHover({ version, category }: TemplatePreviewHoverProps): ReactElement {
  const t = useWebMessages().catalog;
  const phase = useTemplatePreview(version.id, version.version);
  const purpose = version.purpose.trim();
  const description = purpose !== '' ? purpose : t.templatePreview.descriptions[templateCategories.find((known) => known === category) ?? 'other'];
  return (
    <CardHoverPopover width={POPOVER_WIDTH_PX}>
      {phase.kind === 'ready' ? (
        <div className={`${styles.screen} ${styles.portrait}`}>
          <PreviewClip assetId={version.id} version={version.version} cacheKey={phase.cacheKey} label={t.templatePreview.clipLabel(version.name)} />
        </div>
      ) : phase.kind === 'rendering' ? (
        <div className={`${styles.screen} ${styles.portrait}`}>
          <Badge tone="info" dot="live">
            {t.templatePreview.rendering}
          </Badge>
        </div>
      ) : (
        <GlyphVisual version={version} />
      )}
      <p className={styles.title}>{version.name}</p>
      <p className={styles.description}>{description}</p>
    </CardHoverPopover>
  );
}

function PreviewClip({ assetId, version, cacheKey, label }: { assetId: string; version: number; cacheKey: string; label: string }): ReactElement {
  const urls = templatePreviewMediaUrls(assetId, version, cacheKey);
  return <video className={styles.clip} src={urls.clip} poster={urls.poster} muted loop playsInline autoPlay preload="auto" aria-label={label} />;
}
