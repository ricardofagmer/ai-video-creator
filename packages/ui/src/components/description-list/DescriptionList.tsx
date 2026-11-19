import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './DescriptionList.module.css';

export interface DescriptionItem {
  term: string;
  description: ReactNode;
  /** Monospace value (hash, ref, path, MIME type). */
  mono?: boolean;
}

export interface DescriptionListProps {
  items: readonly DescriptionItem[];
  /** Two columns from `md` up. */
  columns?: 1 | 2;
  className?: string;
}

/** Read-only metadata as term/value pairs (asset metadata, manifest, run summary). */
export function DescriptionList({ items, columns = 1, className }: DescriptionListProps): ReactElement {
  return (
    <dl className={classNames(styles.list, columns === 2 && styles.twoColumns, className)}>
      {items.map((item) => (
        <div key={item.term} className={styles.item}>
          <dt className="caption">{item.term}</dt>
          <dd className={classNames(styles.description, item.mono && 'mono')}>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
