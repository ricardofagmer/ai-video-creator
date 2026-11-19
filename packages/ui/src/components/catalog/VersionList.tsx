import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import { shortenHash } from '../../utils/format';
import { StatusBadge } from '../status/StatusBadge';
import type { AssetStatus } from '../status/status-types';
import styles from './VersionList.module.css';

export interface VersionListItem {
  version: number;
  status: AssetStatus;
  /** Already formatted, for example "18/11/2026 14:32". */
  createdAtLabel: string;
  /** sha-256 hex digest; shown shortened, full value in the tooltip and for screen readers. */
  contentHash: string;
  /** Already formatted, for example "12,4 MB" (`formatBytes`). */
  sizeLabel: string;
  /** Short change note of this version. */
  notes?: string;
  /** Link to open this version (`next/link`). */
  link?: ReactNode;
  /** Version actions: "Ativar", "Descontinuar". */
  actions?: ReactNode;
}

export interface VersionListProps {
  items: readonly VersionListItem[];
  /** Version shown on the page; it gets `aria-current="true"`. */
  currentVersion?: number;
  label?: string;
  className?: string;
}

/** Immutable versions of one asset, newest first (PRD 5.4). */
export function VersionList({ items, currentVersion, label = 'Versões', className }: VersionListProps): ReactElement {
  return (
    <ol aria-label={label} className={classNames(styles.list, className)}>
      {items.map((item) => {
        const isCurrent = item.version === currentVersion;
        return (
          <li key={item.version} aria-current={isCurrent ? 'true' : undefined} className={classNames(styles.item, isCurrent && styles.current)}>
            <div className={styles.main}>
              <div className={styles.titleLine}>
                <span className={styles.version}>v{item.version}</span>
                <StatusBadge kind="asset" status={item.status} />
                {isCurrent && <span className="caption">(versão aberta)</span>}
              </div>
              <p className={classNames('caption', styles.meta)}>
                <span>{item.createdAtLabel}</span>
                <span aria-hidden="true"> · </span>
                <span>{item.sizeLabel}</span>
                <span aria-hidden="true"> · </span>
                <span className="mono" title={item.contentHash}>
                  <span className="visually-hidden">Hash </span>
                  {shortenHash(item.contentHash)}
                </span>
              </p>
              {item.notes && <p className={classNames('body-sm', styles.notes)}>{item.notes}</p>}
              {item.link}
            </div>
            {item.actions && <div className={styles.actions}>{item.actions}</div>}
          </li>
        );
      })}
    </ol>
  );
}
