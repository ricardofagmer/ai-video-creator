'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { Badge, type BadgeTone } from '../badge/Badge';
import styles from './QaResultList.module.css';

export type QaResult = 'pass' | 'warning' | 'fail';

export interface QaResultItem {
  /** Check id from the recipe (`CheckId`, C3). */
  id: string;
  /** pt-BR name, for example "Loudness integrado". */
  label: string;
  result: QaResult;
  /** For example "-16,2 LUFS". */
  measuredLabel?: string;
  /** For example "-16 LUFS ± 1". */
  expectedLabel?: string;
  /** Link to the evidence file under `qa/`. */
  evidence?: ReactNode;
}

export interface QaResultListProps {
  items: readonly QaResultItem[];
  label?: string;
  className?: string;
}

const resultTones: Readonly<Record<QaResult, BadgeTone>> = {
  pass: 'success',
  warning: 'warning',
  fail: 'danger',
};

/** QA evidence of the review screen: one row per media check, with measured vs expected. */
export function QaResultList({ items, label, className }: QaResultListProps): ReactElement {
  const { ui } = useI18n();
  const passed = items.filter((item) => item.result === 'pass').length;
  return (
    <div className={classNames(styles.wrapper, className)}>
      <p className={classNames('caption', styles.summary)}>
        {ui.review.qaSummary(passed, items.length)}
      </p>
      <ul aria-label={label ?? ui.review.qaLabel} className={styles.list}>
        {items.map((item) => {
          const tone = resultTones[item.result];
          return (
            <li key={item.id} className={styles.item}>
              <Badge tone={tone} dot>
                {ui.review.qaResults[item.result]}
              </Badge>
              <span className={styles.label}>{item.label}</span>
              {(item.measuredLabel || item.expectedLabel) && (
                <span className={classNames('caption', styles.values)}>
                  {item.measuredLabel && <span>
                      {ui.review.measured} {item.measuredLabel}
                    </span>}
                  {item.measuredLabel && item.expectedLabel && <span aria-hidden="true"> · </span>}
                  {item.expectedLabel && <span>
                      {ui.review.expected} {item.expectedLabel}
                    </span>}
                </span>
              )}
              {item.evidence && <span className={styles.evidence}>{item.evidence}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
