import type { ReactElement } from 'react';
import styles from './Logo.module.css';

export interface LogoProps {
  /** Hides the product name and keeps only the monogram (the name stays for screen readers). */
  compact?: boolean;
}

/** "VC" monogram plus the product name, drawn with tokens only (no image file). */
export function Logo({ compact = false }: LogoProps): ReactElement {
  return (
    <span className={styles.logo}>
      <span aria-hidden="true" className={styles.monogram}>
        VC
      </span>
      <span className={compact ? 'visually-hidden' : styles.name}>EngineOS Video Creator</span>
    </span>
  );
}
