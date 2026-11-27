'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { Badge } from '../badge/Badge';
import { StatusBadge } from '../status/StatusBadge';
import type { AssetSensitivity, AssetStatus } from '../status/status-types';
import styles from './AssetCard.module.css';

export interface AssetCardProps {
  /** Asset name; pass a `next/link` so the whole title opens the asset detail. */
  title: ReactNode;
  /** Kind label in pt-BR (for example "Template", "Música"). */
  kindLabel: string;
  /** Pinned reference `assetId@version`, shown in monospace. */
  assetRef: string;
  status: AssetStatus;
  sensitivity?: AssetSensitivity;
  tags?: readonly string[];
  usageCount: number;
  /** Already formatted date, for example "18/11/2026". */
  updatedAtLabel: string;
  headingLevel?: 'h2' | 'h3';
  /** Optional picture at the top of the card (a video thumbnail); the title link still covers the whole card. */
  media?: ReactNode;
  className?: string;
}

/** One catalog item in the list or grid view. */
export function AssetCard({
  title,
  kindLabel,
  assetRef,
  status,
  sensitivity,
  tags = [],
  usageCount,
  updatedAtLabel,
  headingLevel: Heading = 'h2',
  media,
  className,
}: AssetCardProps): ReactElement {
  const { ui } = useI18n();
  const usageLabel = ui.catalog.usedIn(usageCount);
  return (
    <article className={classNames(styles.card, className)}>
      {media !== undefined && <div className={styles.media}>{media}</div>}
      <div className={styles.top}>
        <span className="overline">{kindLabel}</span>
        <div className={styles.badges}>
          <StatusBadge kind="asset" status={status} />
          {sensitivity && sensitivity !== 'normal' && <StatusBadge kind="sensitivity" status={sensitivity} />}
        </div>
      </div>
      <Heading className={classNames('heading-3', styles.title)}>{title}</Heading>
      <p className={classNames('mono', styles.ref)}>{assetRef}</p>
      {tags.length > 0 && (
        <ul className={styles.tags} aria-label={ui.catalog.tags}>
          {tags.map((tag) => (
            <li key={tag}>
              <Badge tone="neutral">{tag}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className={classNames('caption', styles.meta)}>
        <span>{usageLabel}</span>
        <span aria-hidden="true"> · </span>
        <span>{ui.catalog.updatedAt(updatedAtLabel)}</span>
      </p>
    </article>
  );
}
