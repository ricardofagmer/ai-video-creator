'use client';

import { type AssetVersionView } from '@studio/shared/api';
import { useEffect, useState, type ReactElement } from 'react';
import { cartKindArtwork } from '@/features/cart/cart-kind-artwork';
import { StudioGlyph } from '@/features/common/components/StudioGlyph';
import { type StudioTone } from '@/features/common/studio-artwork';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { imageLinkOf } from '../image-link-draft';
import { purposeTextOf } from '../purpose-text';
import { referencePostOf, videoThumbnailHref } from '../reference-post';
import { siteLinkOf } from '../site-link-draft';
import { storedImageHref } from '../stored-image';
import { CardHoverPopover } from './CardHoverPopover';
import styles from './CardHoverPopover.module.css';

const POPOVER_WIDTH_PX = 260;
/** Lines of a prompt or skill shown in the popover; the rest is clipped. */
const EXCERPT_LINES = 9;
const WAVE_BARS = 24;
const MAX_SWATCHES = 12;

/** The kind's gradient, with the same stops as `common/poster-card.module.css`. */
const toneClasses: Record<StudioTone, string | undefined> = {
  sunset: styles.toneSunset,
  flame: styles.toneFlame,
  magenta: styles.toneMagenta,
  violet: styles.toneViolet,
  dusk: styles.toneDusk,
};

export interface CatalogPreviewHoverProps {
  version: AssetVersionView;
}

/**
 * Catalog hover preview (2026-11-25) for every kind but templates (those keep their clip in
 * `TemplatePreviewHover`): a visual of the item, its name and what it is for. The visual follows
 * the kind: the picture of an image, the poster frame of a video reference, the favicon and domain
 * of a site, the first lines of a prompt or skill, a waveform badge for music and sound effects,
 * the swatches of a brand kit, and the kind's glyph for the rest.
 */
export function CatalogPreviewHover({ version }: CatalogPreviewHoverProps): ReactElement {
  const t = useWebMessages().catalog;
  return (
    <CardHoverPopover width={POPOVER_WIDTH_PX}>
      <PreviewVisual version={version} />
      <p className={styles.title}>{version.name}</p>
      <p className={styles.description}>{purposeTextOf(version, t.purpose)}</p>
    </CardHoverPopover>
  );
}

function PreviewVisual({ version }: { version: AssetVersionView }): ReactElement {
  const post = referencePostOf(version);
  if (post !== null) {
    return (
      <div className={styles.screen}>
        <img className={styles.cover} src={videoThumbnailHref(post)} alt="" />
      </div>
    );
  }
  const imageLink = imageLinkOf(version);
  const picture = imageLink?.href ?? storedImageHref(version);
  if (picture !== null) {
    return (
      <div className={styles.screen}>
        <img className={styles.contain} src={picture} alt="" referrerPolicy={imageLink === null ? undefined : 'no-referrer'} />
      </div>
    );
  }
  const site = siteLinkOf(version);
  if (site !== null) return <SiteVisual hostname={site.hostname} />;
  if ((version.kind === 'prompt' || version.kind === 'skill') && version.sensitivity !== 'biometric') {
    return <ExcerptVisual assetId={version.id} version={version.version} fallback={<GlyphVisual version={version} />} />;
  }
  if (version.kind === 'music' || version.kind === 'sfx') return <WaveVisual version={version} durationMs={version.details.durationMs} />;
  if (version.kind === 'brand-kit') {
    return (
      <div className={styles.screen}>
        <div className={styles.swatches}>
          {version.details.colors.slice(0, MAX_SWATCHES).map((color) => (
            <span key={`${color.name}-${color.hex}`} className={styles.swatch} style={{ backgroundColor: color.hex }} />
          ))}
        </div>
      </div>
    );
  }
  return <GlyphVisual version={version} />;
}

function glyphScreenClass(version: AssetVersionView): string {
  return `${styles.screen} ${styles.glyphScreen} ${toneClasses[cartKindArtwork[version.kind].tone] ?? ''}`;
}

export function GlyphVisual({ version }: { version: AssetVersionView }): ReactElement {
  return (
    <div className={glyphScreenClass(version)}>
      <StudioGlyph name={cartKindArtwork[version.kind].glyph} className={styles.glyph} />
    </div>
  );
}

/** The site's own favicon, loaded by the viewer's browser from the owner's link like the card's embed. */
function SiteVisual({ hostname }: { hostname: string }): ReactElement {
  const [iconFailed, setIconFailed] = useState(false);
  return (
    <div className={`${styles.screen} ${styles.site}`}>
      {!iconFailed && (
        <img
          className={styles.favicon}
          src={`https://${hostname}/favicon.ico`}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setIconFailed(true)}
        />
      )}
      <span className={styles.domain}>{hostname}</span>
    </div>
  );
}

type ExcerptState = { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'absent' };

/** Read once when the popover first opens; a version is immutable, so the text never goes stale. */
function ExcerptVisual({ assetId, version, fallback }: { assetId: string; version: number; fallback: ReactElement }): ReactElement {
  const [state, setState] = useState<ExcerptState>({ kind: 'loading' });
  useEffect(() => {
    let current = true;
    browserStudioClient
      .readEntryFile(assetId, version)
      .then((file) => {
        if (!current) return;
        const text = firstLines(file.text, EXCERPT_LINES);
        setState(text === '' ? { kind: 'absent' } : { kind: 'ready', text });
      })
      .catch(() => {
        // A folder skill without its entry file, or a referenced prompt: the glyph stands in.
        if (current) setState({ kind: 'absent' });
      });
    return () => {
      current = false;
    };
  }, [assetId, version]);
  if (state.kind !== 'ready') return fallback;
  return (
    <div className={`${styles.screen} ${styles.excerpt}`}>
      <p className={styles.excerptText}>{state.text}</p>
    </div>
  );
}

function firstLines(text: string, count: number): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, count)
    .join('\n');
}

/** Decorative bars whose heights follow the asset id, so each track keeps its own shape. */
function WaveVisual({ version, durationMs }: { version: AssetVersionView; durationMs: number }): ReactElement {
  const heights = waveHeights(version.id);
  return (
    <div className={glyphScreenClass(version)}>
      <div className={styles.wave}>
        {heights.map((bar) => (
          <span key={bar.id} className={styles.waveBar} style={{ height: `${bar.height}%` }} />
        ))}
      </div>
      <span className={styles.duration}>{formatDuration(durationMs)}</span>
    </div>
  );
}

function waveHeights(seed: string): Array<{ id: string; height: number }> {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Array.from({ length: WAVE_BARS }, (_, index) => {
    const value = Math.imul(hash ^ (index * 2654435761), 1597334677) >>> 0;
    return { id: `bar-${index}`, height: 20 + (value % 81) };
  });
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
