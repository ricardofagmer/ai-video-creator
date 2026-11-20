import type { ReactElement } from 'react';
import { Badge, type BadgeTone } from '../badge/Badge';
import type { WatcherState } from '../status/status-types';

export interface WatcherIndicatorProps {
  state: WatcherState;
  className?: string;
}

const appearance: Readonly<Record<WatcherState, { label: string; tone: BadgeTone }>> = {
  running: { label: 'Watcher ativo', tone: 'success' },
  stopped: { label: 'Watcher parado', tone: 'danger' },
  unknown: { label: 'Watcher sem resposta', tone: 'neutral' },
};

/** Persistent watcher state in the top bar; changes are announced politely. */
export function WatcherIndicator({ state, className }: WatcherIndicatorProps): ReactElement {
  const { label, tone } = appearance[state];
  return (
    <span role="status" className={className}>
      <Badge tone={tone} dot>
        {label}
      </Badge>
    </span>
  );
}
