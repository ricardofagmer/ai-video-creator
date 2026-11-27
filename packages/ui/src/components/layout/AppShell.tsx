'use client';

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { Icon } from '../icon/Icon';
import styles from './AppShell.module.css';

/** One row of the drawer's Preferences section, for example the language switch. */
export interface AppShellPreference {
  id: string;
  label: string;
  /** Usually an `<Icon />`, shown before the label. */
  icon?: ReactNode;
  control: ReactNode;
}

/** The account footer pinned at the bottom of the drawer. */
export interface AppShellAccount {
  /** Shown bold; its first letter fills the avatar. */
  name: string;
  /** Muted second line under the name. */
  detail?: ReactNode;
  /** Account actions shown when the footer is expanded, for example the logout button. */
  menu: ReactNode;
}

export interface AppShellProps {
  /** Usually `<Logo />` inside a link to the home route. */
  brand: ReactNode;
  /**
   * Drawer navigation: `DrawerSection`s holding links styled with `navLinkClassName` (an icon, then
   * the label in a `<span>`); the current one carries `aria-current="page"`.
   */
  navigation: ReactNode;
  /**
   * Desktop rail: the same destinations as a flat column of links styled with `railLinkClassName`
   * (an icon above the label in a `<span>`). Hidden below the desktop breakpoint, where the drawer
   * is the navigation.
   */
  rail?: ReactNode;
  /** Persistent status, for example `<WatcherIndicator />`. */
  status?: ReactNode;
  /** Rows of the drawer's Preferences section, below the navigation. */
  preferences?: readonly AppShellPreference[];
  /** Account footer of the drawer. */
  account?: AppShellAccount;
  children: ReactNode;
  /** Id of `<main>`, target of the skip link. */
  mainId?: string;
}

/**
 * Private layout: skip link, sticky one-row navbar (menu button, brand, status), a menu drawer, then
 * the page content. On desktop a floating rail carries the navigation and its last item opens the
 * drawer, which keeps Preferences and the account; the navbar's menu button is then hidden. The drawer is a native modal `<dialog>`: `showModal()` gives the focus trap and
 * the inert page; it closes on Escape, a backdrop click, a link click and browser back/forward, and
 * focus returns to the menu button. Inside it: a header, a body that scrolls on its own (navigation
 * groups, then Preferences) and an account footer that stays pinned; the footer's chevron expands
 * the account menu, and Escape closes that menu before the drawer. While open, the page scroll is
 * locked and a classic scrollbar's width is added as padding so the page does not shift.
 */
export function AppShell({ brand, navigation, rail, status, preferences, account, children, mainId = 'conteudo' }: AppShellProps): ReactElement {
  const { ui } = useI18n();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Whichever button opened the drawer (navbar or rail) gets the focus back when it closes.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const titleId = useId();
  const accountMenuId = useId();

  // Syncs `open` with the imperative showModal()/close() API and owns the side effects of an open drawer.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!open || !drawer) return undefined;
    const opener = openerRef.current ?? menuButtonRef.current;
    const root = document.documentElement;
    // Measured before locking: a classic scrollbar disappears with `overflow: hidden`.
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    if (!drawer.open) drawer.showModal();
    closeButtonRef.current?.focus();
    const previousOverflow = root.style.overflow;
    const previousPaddingRight = root.style.paddingRight;
    root.style.overflow = 'hidden';
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;
    // Back/forward changes the route without a click inside the drawer.
    const handlePopState = (): void => setOpen(false);
    window.addEventListener('popstate', handlePopState);
    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPaddingRight;
      window.removeEventListener('popstate', handlePopState);
      if (drawer.open) drawer.close();
      opener?.focus();
    };
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    // React owns `open`; Escape asks it to close instead of closing behind its back.
    event.preventDefault();
    if (accountOpen) {
      setAccountOpen(false);
      accountButtonRef.current?.focus();
      return;
    }
    setOpen(false);
  }

  function handleDrawerClick(event: MouseEvent<HTMLDialogElement>): void {
    const { target } = event;
    // The panel fills the dialog, so a click on the dialog itself is a click on the backdrop.
    const onBackdrop = target === event.currentTarget;
    // Following a navigation link changes the route: close so the new page is not covered.
    const onLink = target instanceof Element && target.closest('a[href]') !== null;
    if (onBackdrop || onLink) setOpen(false);
  }

  function openDrawer(event: MouseEvent<HTMLButtonElement>): void {
    openerRef.current = event.currentTarget;
    setAccountOpen(false);
    setOpen(true);
  }

  const menuLabel = open ? ui.shell.closeMenu : ui.shell.openMenu;
  const initial = account ? (Array.from(account.name.trim())[0]?.toLocaleUpperCase() ?? '') : '';

  return (
    <div className={classNames(styles.shell, rail !== undefined && styles.shellWithRail)}>
      <a href={`#${mainId}`} className={styles.skipLink}>
        {ui.shell.skipLink}
      </a>
      {rail !== undefined && (
        <aside className={styles.rail}>
          <nav aria-label={ui.shell.mainNavigation} className={styles.railNav}>
            {rail}
          </nav>
          <button
            type="button"
            className={classNames(styles.railLink, styles.railMenuButton)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={menuLabel}
            title={menuLabel}
            onClick={openDrawer}
          >
            {account !== undefined ? (
              <span className={classNames(styles.avatar, styles.railAvatar)} aria-hidden="true">
                {initial}
              </span>
            ) : (
              <Icon name="menu" />
            )}
            <span>{ui.shell.menuTitle}</span>
          </button>
        </aside>
      )}
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <button
            ref={menuButtonRef}
            type="button"
            className={classNames(styles.iconButton, styles.menuButton)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={menuLabel}
            title={menuLabel}
            onClick={openDrawer}
          >
            <Icon name="menu" />
          </button>
          <div className={styles.brand}>{brand}</div>
          <div className={styles.end}>{status}</div>
        </div>
      </header>
      <dialog
        ref={drawerRef}
        id={drawerId}
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.drawer}
        onCancel={handleCancel}
        onClose={() => setOpen(false)}
        onClick={handleDrawerClick}
      >
        <div className={styles.drawerPanel}>
          <div className={styles.drawerHeader}>
            <h2 id={titleId} className="heading-3">
              {ui.shell.menuTitle}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.iconButton}
              aria-label={ui.shell.closeMenu}
              title={ui.shell.closeMenu}
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className={styles.drawerBody}>
            <nav aria-label={ui.shell.mainNavigation} className={styles.drawerNav}>
              {navigation}
            </nav>
            {preferences !== undefined && preferences.length > 0 && (
              <DrawerSection title={ui.shell.preferences}>
                {preferences.map((preference) => (
                  <div key={preference.id} className={styles.settingRow}>
                    {preference.icon}
                    <span className={styles.settingLabel}>{preference.label}</span>
                    {preference.control}
                  </div>
                ))}
              </DrawerSection>
            )}
          </div>
          {account !== undefined && (
            <div className={styles.drawerFooter}>
              <button
                ref={accountButtonRef}
                type="button"
                className={styles.accountButton}
                aria-expanded={accountOpen}
                aria-controls={accountMenuId}
                onClick={() => setAccountOpen((value) => !value)}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {initial}
                </span>
                <span className={styles.accountText}>
                  <span className={styles.accountName}>{account.name}</span>
                  {account.detail !== undefined && <span className={styles.accountDetail}>{account.detail}</span>}
                </span>
                <Icon name="chevron-down" className={styles.accountChevron} />
              </button>
              <div id={accountMenuId} role="group" aria-label={ui.shell.accountMenu} className={styles.accountMenu} hidden={!accountOpen}>
                {account.menu}
              </div>
            </div>
          )}
        </div>
      </dialog>
      <main id={mainId} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}

export interface DrawerSectionProps {
  /** Short heading, shown in small uppercase letters. */
  title: string;
  children: ReactNode;
}

/** A labelled group of drawer rows; groups after the first are separated by a full-width divider. */
export function DrawerSection({ title, children }: DrawerSectionProps): ReactElement {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className={styles.section}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {title}
      </h3>
      <div className={styles.sectionItems}>{children}</div>
    </div>
  );
}

export interface NavLinkClassNameOptions {
  active?: boolean;
  className?: string;
}

/** Classes for a menu drawer navigation link (`next/link`): an icon, then the label in a `<span>`. */
export function navLinkClassName({ active = false, className }: NavLinkClassNameOptions = {}): string {
  return classNames(styles.navLink, active && styles.navLinkActive, className);
}

/** Classes for a desktop rail link (`next/link`): an icon above the label in a `<span>`. */
export function railLinkClassName({ active = false, className }: NavLinkClassNameOptions = {}): string {
  return classNames(styles.railLink, active && styles.railLinkActive, className);
}

/** Row style for a `<button>` in the drawer: icon, then the label in a `<span>`. */
export function drawerItemClassName({ className }: { className?: string } = {}): string {
  return classNames(styles.navLink, styles.drawerItemButton, className);
}
