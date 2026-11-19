import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'active' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Leading dot in the tone colour; `live` makes it pulse (running states). */
  dot?: boolean | 'live';
  /** The text carries the meaning: colour is never the only signal. */
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', dot = false, children, className }: BadgeProps): ReactElement {
  return (
    <span className={classNames(styles.badge, styles[tone], className)}>
      {dot !== false && <span aria-hidden="true" className={classNames(styles.dot, dot === 'live' && styles.live)} />}
      {children}
    </span>
  );
}
