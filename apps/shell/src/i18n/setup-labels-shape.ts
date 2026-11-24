import { type UninstallPart } from '../setup/setup-log';
import { type AppLocationProblem, type OptionalComponentId, type SetupStepId, type StepFailureReason, type StepReport } from '../setup/setup-types';

/** Every text key of the setup window and the uninstall flow; each locale must fill all of them. */
export interface SetupLabels {
  readonly windowTitle: string;
  readonly heading: string;
  readonly intro: string;
  readonly steps: Readonly<Record<SetupStepId, string>>;
  readonly status: Readonly<Record<StepReport['status'], string>>;
  readonly reasons: Readonly<Record<StepFailureReason, string>>;
  readonly refusedHeading: string;
  readonly refused: Readonly<Record<AppLocationProblem, string>>;
  readonly refusedAction: string;
  readonly gatekeeperHeading: string;
  readonly gatekeeperHelp: string;
  readonly passphraseHeading: string;
  readonly passphraseHint: string;
  readonly passphraseLabel: string;
  readonly passphraseRepeatLabel: string;
  readonly passphraseTooShort: string;
  readonly passphraseTooLong: string;
  readonly passphraseMismatch: string;
  readonly passphraseSubmit: string;
  readonly passphraseCancel: string;
  readonly components: Readonly<Record<OptionalComponentId, string>>;
  readonly consentHeading: string;
  readonly consentBody: string;
  readonly consentHost: string;
  readonly consentSize: string;
  readonly consentAccept: string;
  readonly consentDecline: string;
  readonly completeHeading: string;
  readonly componentInstalled: string;
  readonly componentNotInstalled: string;
  readonly failedHeading: string;
  readonly retry: string;
  readonly close: string;
  readonly uninstall: UninstallLabels;
}

export interface UninstallLabels {
  readonly message: string;
  readonly detail: string;
  readonly deleteDataCheckbox: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly deleteDataMessage: string;
  readonly deleteDataDetail: string;
  readonly deleteDataConfirm: string;
  readonly deleteDataKeep: string;
  readonly finishedMessage: string;
  readonly finishedKeptData: string;
  readonly partialMessage: string;
  /** Uninstall stopped on an unexpected error before it could list what is left. */
  readonly failedMessage: string;
  readonly parts: Readonly<Record<UninstallPart, string>>;
  readonly ok: string;
}
