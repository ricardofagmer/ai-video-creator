'use client';

import type { ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Badge, type BadgeTone } from '../badge/Badge';
import type { WatcherState } from '../status/status-types';

export interface WatcherIndicatorProps {
  state: WatcherState;
  className?: string;
}

const tones: Readonly<Record<WatcherState, BadgeTone>> = {
  running: 'success',
  stopped: 'danger',
  unknown: 'neutral',
};

/** Persistent watcher state in the top bar; changes are announced politely. */
export function WatcherIndicator({ state, className }: WatcherIndicatorProps): ReactElement {
  const { ui } = useI18n();
  return (
    <span role="status" className={className}>
      <Badge tone={tones[state]} dot>
        {ui.status.watcher[state]}
      </Badge>
    </span>
  );
}
