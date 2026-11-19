import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Back link above the title (for example "← Catálogo"). */
  back?: ReactNode;
  /** Badges next to the title (status, version, sensitivity). */
  meta?: ReactNode;
  /** Page actions; at most one primary button. */
  actions?: ReactNode;
  className?: string;
}

/** Page title block: the page's single `<h1>`. */
export function PageHeader({ title, description, back, meta, actions, className }: PageHeaderProps): ReactElement {
  return (
    <div className={classNames(styles.header, className)}>
      {back && <div className={styles.back}>{back}</div>}
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.titleLine}>
            <h1 className="heading-1">{title}</h1>
            {meta && <div className={styles.meta}>{meta}</div>}
          </div>
          {description && <p className={classNames('caption', styles.description)}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
