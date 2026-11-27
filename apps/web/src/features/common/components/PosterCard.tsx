import type { ReactElement, ReactNode } from 'react';
import styles from '../poster-card.module.css';
import { type StudioArtwork, type StudioTone } from '../studio-artwork';
import { StudioGlyph } from './StudioGlyph';

export interface PosterCardProps {
  artwork: StudioArtwork;
  /** The card's text: usually a `heading-3` title holding a `cardLink`, a `meta` row, an `excerpt` and a `links` footer. */
  children: ReactNode;
  /** A badge on the cover's top right corner, such as a status or a duration. */
  coverBadge?: ReactNode;
  /** A real picture (thumbnail, image) that fills the cover in place of the glyph. */
  media?: ReactNode;
  /** `screen`: a 16:10 cover for media that is a page, such as a saved website; `band` (default) is the short strip. */
  coverShape?: 'band' | 'screen';
  /** `compact`: tight text lines and a footer tinted with the cover's colours, for dense grids such as the catalog. */
  density?: 'regular' | 'compact';
}

const toneClasses: Record<StudioTone, string | undefined> = {
  sunset: styles.toneSunset,
  flame: styles.toneFlame,
  magenta: styles.toneMagenta,
  violet: styles.toneViolet,
  dusk: styles.toneDusk,
};

/**
 * A poster card: a gradient cover with a media glyph, then the text. Style the text with the classes of
 * `common/poster-card.module.css`. The shared `Card` puts its header first, so a cover that reaches the
 * card's edge needs this markup.
 */
export function PosterCard({ artwork, children, coverBadge, media, coverShape = 'band', density = 'regular' }: PosterCardProps): ReactElement {
  return (
    <article className={`${styles.card} ${toneClasses[artwork.tone] ?? ''}${density === 'compact' ? ` ${styles.cardCompact}` : ''}`}>
      <div
        className={
          media === undefined
            ? styles.cover
            : `${styles.cover} ${styles.coverWithMedia}${coverShape === 'screen' ? ` ${styles.coverScreen}` : ''}`
        }
      >
        {media === undefined ? (
          <>
            <StudioGlyph name={artwork.glyph} className={styles.ghost} />
            <span className={styles.lens} aria-hidden="true">
              <StudioGlyph name={artwork.glyph} className={styles.lensGlyph} />
            </span>
          </>
        ) : (
          <div className={styles.coverMedia}>{media}</div>
        )}
        {coverBadge && <div className={styles.coverBadge}>{coverBadge}</div>}
      </div>
      <div className={styles.body}>{children}</div>
    </article>
  );
}
