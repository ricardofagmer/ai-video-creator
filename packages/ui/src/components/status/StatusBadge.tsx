'use client';

import type { ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { UiMessages } from '../../i18n/messages';
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

function labelOf(props: StatusBadgeProps, ui: UiMessages): string {
  switch (props.kind) {
    case 'asset':
      return ui.status.asset[props.status];
    case 'sensitivity':
      return ui.status.sensitivity[props.status];
    case 'step':
      return ui.status.step[props.status];
    case 'run':
      return ui.status.run[props.status];
  }
}

/** Status of an asset version, a step or a run, as text plus tone (never colour alone). */
export function StatusBadge(props: StatusBadgeProps): ReactElement {
  const { ui } = useI18n();
  const appearance = appearanceOf(props);
  return (
    <Badge tone={appearance.tone} dot={appearance.live ? 'live' : true} className={props.className}>
      {labelOf(props, ui)}
    </Badge>
  );
}
