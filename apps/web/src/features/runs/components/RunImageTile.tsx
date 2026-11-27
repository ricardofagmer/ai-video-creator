'use client';

import { classNames } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import { imageLinkOf } from '@/features/catalog/image-link-draft';
import { referencePostOf, videoThumbnailHref } from '@/features/catalog/reference-post';
import { storedImageHref } from '@/features/catalog/stored-image';
import styles from '../runs.module.css';

/** Same-origin or owner-linked picture of a version; null when the catalog has no preview for it. */
export function runImageThumbnailOf(version: AssetVersionView): { src: string; external: boolean } | null {
  const stored = storedImageHref(version);
  if (stored !== null) return { src: stored, external: false };
  const link = imageLinkOf(version);
  // Straight from the owner's link (CSP `img-src https:`); the server never fetches it.
  if (link !== null) return { src: link.href, external: true };
  const post = referencePostOf(version);
  return post === null ? null : { src: videoThumbnailHref(post), external: false };
}

interface RunImageTileProps {
  version: AssetVersionView | undefined;
  /** Shown as the tooltip and, without a picture, as the square's initial. */
  name: string;
  /** Accessible name of the button: the action plus the item's name. */
  actionLabel: string;
  pressed?: boolean;
  /** Draws the remove mark instead of the added check. */
  removable?: boolean;
  disabled: boolean;
  onClick: () => void;
}

/** One small square of the run picture picker: the picture only, the name on hover and for screen readers. */
export function RunImageTile({ version, name, actionLabel, pressed, removable = false, disabled, onClick }: RunImageTileProps): ReactElement {
  const thumbnail = version === undefined ? null : runImageThumbnailOf(version);
  return (
    <button
      type="button"
      className={classNames(styles.imageTile, pressed === true && styles.imageTileAdded)}
      title={name}
      aria-label={actionLabel}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {thumbnail !== null ? (
        <img
          src={thumbnail.src}
          alt=""
          width={88}
          height={88}
          loading="lazy"
          decoding="async"
          referrerPolicy={thumbnail.external ? 'no-referrer' : undefined}
        />
      ) : (
        <span className={styles.imageTileInitial} aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
      {(pressed === true || removable) && (
        <span className={styles.imageTileMark} aria-hidden="true">
          {removable ? '×' : '✓'}
        </span>
      )}
    </button>
  );
}
