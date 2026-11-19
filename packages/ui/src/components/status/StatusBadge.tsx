import type { ReactElement } from 'react';
import { Badge } from '../badge/Badge';
import {
  assetStatusAppearance,
  runStatusAppearance,
  sensitivityAppearance,
  stepStatusAppearance,
  type StatusAppearance,
} from './status-labels';
import type { AssetSensitivity, AssetStatus, RunStatus, StepStatus } from './status-types';

export type StatusBadgeProps =
  | { kind: 'asset'; status: AssetStatus; className?: string }
  | { kind: 'sensitivity'; status: AssetSensitivity; className?: string }
  | { kind: 'step'; status: StepStatus; className?: string }
  | { kind: 'run'; status: RunStatus; className?: string };

function appearanceOf(props: StatusBadgeProps): StatusAppearance {
  switch (props.kind) {
    case 'asset':
      return assetStatusAppearance[props.status];
    case 'sensitivity':
      return sensitivityAppearance[props.status];
    case 'step':
      return stepStatusAppearance[props.status];
    case 'run':
      return runStatusAppearance[props.status];
  }
}

/** Status of an asset version, a step or a run, as text plus tone (never colour alone). */
export function StatusBadge(props: StatusBadgeProps): ReactElement {
  const appearance = appearanceOf(props);
  return (
    <Badge tone={appearance.tone} dot={appearance.live ? 'live' : true} className={props.className}>
      {appearance.label}
    </Badge>
  );
}
