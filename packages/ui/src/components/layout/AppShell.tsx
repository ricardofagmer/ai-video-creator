import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** Usually `<Logo />` inside a link to the home route. */
  brand: ReactNode;
  /** Navigation links styled with `navLinkClassName`; the current one carries `aria-current="page"`. */
  navigation: ReactNode;
  /** Persistent status, for example `<WatcherIndicator />`. */
  status?: ReactNode;
  /** Right-side actions, for example "Sair". */
  actions?: ReactNode;
  children: ReactNode;
  /** Id of `<main>`, target of the skip link. */
  mainId?: string;
}

/** Private layout: skip link, sticky top bar with navigation and status, then the page content. */
export function AppShell({ brand, navigation, status, actions, children, mainId = 'conteudo' }: AppShellProps): ReactElement {
  return (
    <div className={styles.shell}>
      <a href={`#${mainId}`} className={styles.skipLink}>
        Pular para o conteúdo
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>{brand}</div>
          <nav aria-label="Principal" className={styles.nav}>
            {navigation}
          </nav>
          <div className={styles.end}>
            {status}
            {actions}
          </div>
        </div>
      </header>
      <main id={mainId} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}

export interface NavLinkClassNameOptions {
  active?: boolean;
  className?: string;
}

/** Classes for a top bar navigation link (`next/link`). */
export function navLinkClassName({ active = false, className }: NavLinkClassNameOptions = {}): string {
  return classNames(styles.navLink, active && styles.navLinkActive, className);
}
