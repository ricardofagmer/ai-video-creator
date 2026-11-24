'use client';

import { Badge, classNames } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { CATALOG_PANEL_ID } from '../catalog-groups';
import styles from '../catalog.module.css';

export interface CatalogKindTab {
  id: string;
  label: string;
  /** Already formatted; null when the count is not known (search by meaning, or more than one page). */
  count: string | null;
  href: string;
  selected: boolean;
}

interface CatalogKindTabsProps {
  label: string;
  tabs: readonly CatalogKindTab[];
  /** Id of the tab panel; the template category tabs nest their own panel inside the kind panel. */
  panelId?: string;
  /** `underline` for the top level; `segmented` for a nested row, so it never reads as a second top row. */
  appearance?: 'underline' | 'segmented';
  children: ReactNode;
}

/** The tab to focus once the navigation it started has rendered (the loading boundary may remount the page). */
let focusAfterNavigation: string | null = null;

/**
 * design/telas/02 kind tabs: WAI-ARIA tabs with manual activation, since each tab is a page in the URL
 * (`?tipo=`). Arrow keys, Home and End move focus; Enter (native link) and Space open the tab.
 */
export function CatalogKindTabs({
  label,
  tabs,
  panelId = CATALOG_PANEL_ID,
  appearance = 'underline',
  children,
}: CatalogKindTabsProps): ReactElement {
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const selected = tabs.find((tab) => tab.selected) ?? tabs[0];
  const selectedId = selected?.id;

  useEffect(() => {
    if (selectedId === undefined || focusAfterNavigation !== selectedId) return;
    focusAfterNavigation = null;
    document.getElementById(selectedId)?.focus();
  }, [selectedId]);

  function focusTab(index: number): void {
    const count = tabs.length;
    refs.current[(index + count) % count]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = refs.current.findIndex((element) => element === document.activeElement);
    if (index === -1) return;
    if (event.key === 'ArrowRight') focusTab(index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(tabs.length - 1);
    else if (event.key === ' ') {
      const tab = tabs[index];
      if (tab === undefined) return;
      focusAfterNavigation = tab.id;
      router.push(tab.href, { scroll: false });
    } else return;
    event.preventDefault();
  }

  return (
    <>
      <div role="tablist" aria-label={label} className={appearance === 'segmented' ? styles.segmentList : styles.tabList} onKeyDown={handleKeyDown}>
        {tabs.map((tab, index) => (
          <Link
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={tab.id}
            href={tab.href}
            scroll={false}
            role="tab"
            aria-selected={tab.selected}
            aria-controls={panelId}
            tabIndex={tab.selected ? 0 : -1}
            className={
              appearance === 'segmented'
                ? classNames(styles.segment, tab.selected && styles.segmentSelected)
                : classNames(styles.tab, tab.selected && styles.tabSelected)
            }
            onClick={() => {
              focusAfterNavigation = tab.id;
            }}
          >
            <span className="label">{tab.label}</span>
            {tab.count !== null && <Badge tone="neutral">{tab.count}</Badge>}
          </Link>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={selectedId} className={layout.stack}>
        {children}
      </div>
    </>
  );
}
