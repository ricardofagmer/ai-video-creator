'use client';

import { classNames } from '@studio/ui';
import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import catalogStyles from '@/features/catalog/catalog.module.css';
import runStyles from '../runs.module.css';

export interface RunImageCategoryTab {
  key: string;
  label: string;
}

interface RunImageCategoryTabsProps {
  label: string;
  tabs: readonly RunImageCategoryTab[];
  /** Null while search results are shown: no category tab is current then. */
  selected: string | null;
  panelId: string;
  onSelect: (key: string) => void;
}

/**
 * The category row above the run picture grid, in the catalog's segmented style. WAI-ARIA tabs with
 * automatic activation: each tab only changes which category the grid loads, never the URL.
 */
export function RunImageCategoryTabs({ label, tabs, selected, panelId, onSelect }: RunImageCategoryTabsProps): ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusable = selected ?? tabs[0]?.key;

  function move(index: number): void {
    const count = tabs.length;
    const next = tabs[(index + count) % count];
    if (next === undefined) return;
    onSelect(next.key);
    refs.current[(index + count) % count]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = refs.current.findIndex((element) => element === document.activeElement);
    if (index === -1) return;
    if (event.key === 'ArrowRight') move(index + 1);
    else if (event.key === 'ArrowLeft') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={label} className={catalogStyles.segmentList} onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          aria-selected={tab.key === selected}
          aria-controls={panelId}
          tabIndex={tab.key === focusable ? 0 : -1}
          className={classNames(catalogStyles.segment, runStyles.categoryTab, tab.key === selected && catalogStyles.segmentSelected)}
          onClick={() => onSelect(tab.key)}
        >
          <span className="label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
