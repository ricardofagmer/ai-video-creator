import type { ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Logo.module.css';

/**
 * EngineOS brand kit v1 app tile. Every app that renders `<Logo />` serves this file from its own
 * `public/brand/` folder (web and portal today), so the path stays on the page's origin.
 */
const MARK_SRC = '/brand/engineos-mark.png';

export interface LogoProps {
  /** Hides the product name and keeps only the mark (the name stays for screen readers). */
  compact?: boolean;
  /** Below md (768px) only the mark shows; the name stays for screen readers. */
  compactBelowMd?: boolean;
}

/** Brand mark plus the product name. */
export function Logo({ compact = false, compactBelowMd = false }: LogoProps): ReactElement {
  return (
    <span className={styles.logo}>
      {/* A plain img: the portal is a static export with no image optimizer, and the mark is tiny. */}
      <img src={MARK_SRC} alt="" aria-hidden="true" width={32} height={32} className={styles.mark} />
      <span className={compact ? 'visually-hidden' : classNames(styles.name, compactBelowMd && styles.nameCollapsible)}>EngineOS Video Creator</span>
    </span>
  );
}
