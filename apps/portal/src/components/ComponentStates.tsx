'use client';

import type { ComponentState, InstallComponents } from '@studio/shared/api';
import { Badge, type BadgeTone } from '@studio/ui';
import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';
import styles from './portal.module.css';

type ComponentName = keyof InstallComponents;

/** Display order of C1's components. */
const COMPONENT_ORDER: readonly ComponentName[] = [
  'api',
  'web',
  'watcher',
  'database',
  'ffmpeg',
  'dataHome',
  'searchModel',
  'captureBrowser',
];

/** C1: `not-installed` on an optional component is not an error. */
const OPTIONAL_COMPONENTS: ReadonlySet<ComponentName> = new Set<ComponentName>(['searchModel', 'captureBrowser']);

/** Pure: the badge tone of one component state; the text label always carries the meaning too. */
export function componentTone(name: ComponentName, state: ComponentState): BadgeTone {
  switch (state) {
    case 'ok':
      return 'success';
    case 'stopped':
    case 'degraded':
      return 'warning';
    case 'missing':
      return 'danger';
    case 'not-installed':
      return OPTIONAL_COMPONENTS.has(name) ? 'neutral' : 'danger';
  }
}

export interface ComponentStatesProps {
  components: InstallComponents;
}

export function ComponentStates({ components }: ComponentStatesProps): ReactElement {
  const t = usePortalMessages();
  return (
    <div className={styles.stack}>
      <h3 className="heading-3">{t.detection.paired.componentsHeading}</h3>
      <ul className={styles.componentList}>
        {COMPONENT_ORDER.map((name) => {
          const state = components[name];
          return (
            <li key={name} className={styles.componentRow}>
              <span className="body-sm">{t.detection.components[name]}</span>
              <Badge tone={componentTone(name, state)} dot>
                {t.detection.componentStates[state]}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
