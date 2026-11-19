import type { ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import { formatUsd } from '../../utils/format';
import styles from './CostMeter.module.css';

export interface CostMeterProps {
  /** Spent so far (from `cost.json` totals), in USD. */
  spentUsd: number;
  /** Ceiling (`limits.costPerRunUsd` or the month's limit), in USD. */
  limitUsd: number;
  /** Plan estimate, drawn as a tick on the track when given. */
  estimateUsd?: number;
  label?: string;
  className?: string;
}

/** Share of the cost ceiling at which the meter turns to warning. */
const warningShare = 0.8;

function percentOf(value: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, (value / limit) * 100));
}

/** Spend against a cost ceiling; turns warning at 80 % and danger at 100 %. */
export function CostMeter({ spentUsd, limitUsd, estimateUsd, label = 'Custo da execução', className }: CostMeterProps): ReactElement {
  const share = limitUsd > 0 ? spentUsd / limitUsd : 1;
  const level = share >= 1 ? 'danger' : share >= warningShare ? 'warning' : 'normal';
  const valueText = `${formatUsd(spentUsd)} de ${formatUsd(limitUsd)}`;

  return (
    <div className={classNames(styles.meter, styles[level], className)}>
      <div className={styles.header}>
        <span className="label">{label}</span>
        <span className={styles.value}>{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limitUsd}
        aria-valuenow={Math.min(spentUsd, limitUsd)}
        aria-valuetext={valueText}
        className={styles.track}
      >
        <span className={styles.fill} style={{ width: `${percentOf(spentUsd, limitUsd)}%` }} />
        {estimateUsd !== undefined && (
          <span aria-hidden="true" className={styles.estimate} style={{ left: `${percentOf(estimateUsd, limitUsd)}%` }} />
        )}
      </div>
      {estimateUsd !== undefined && <p className={classNames('caption', styles.note)}>Estimativa do plano: {formatUsd(estimateUsd)}</p>}
      {level === 'danger' && <p className={classNames(styles.note, styles.alertText)}>Limite de custo atingido.</p>}
    </div>
  );
}
