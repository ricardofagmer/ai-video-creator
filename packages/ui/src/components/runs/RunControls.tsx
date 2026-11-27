'use client';

import { useState, type ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { Button } from '../button/Button';
import { Dialog } from '../dialog/Dialog';
import styles from './RunControls.module.css';

export type RunAction = 'pause' | 'resume' | 'stop';

export interface RunControlsProps {
  /** Which actions the run's status allows (mapping in design/componentes-estudio.md, section 6). */
  available: Readonly<Record<RunAction, boolean>>;
  /** Action whose `control.json` write is in flight; its button shows the spinner. */
  pendingAction?: RunAction;
  onAction: (action: RunAction) => void;
  className?: string;
}

/** Pause, resume and stop. Stop asks for confirmation first. */
export function RunControls({ available, pendingAction, onAction, className }: RunControlsProps): ReactElement {
  const { ui } = useI18n();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const busy = pendingAction !== undefined;

  function confirmStop(): void {
    setConfirmingStop(false);
    onAction('stop');
  }

  return (
    <div role="group" aria-label={ui.runs.controlsLabel} className={classNames(styles.controls, className)}>
      {available.pause && (
        <Button
          variant="secondary"
          loading={pendingAction === 'pause'}
          loadingLabel={ui.runs.pausing}
          disabled={busy}
          onClick={() => onAction('pause')}
        >
          {ui.runs.pause}
        </Button>
      )}
      {available.resume && (
        <Button loading={pendingAction === 'resume'} loadingLabel={ui.runs.resuming} disabled={busy} onClick={() => onAction('resume')}>
          {ui.runs.resume}
        </Button>
      )}
      {available.stop && (
        <Button
          variant="ghost"
          loading={pendingAction === 'stop'}
          loadingLabel={ui.runs.stopping}
          disabled={busy}
          onClick={() => setConfirmingStop(true)}
          className={styles.stop}
        >
          {ui.runs.stop}
        </Button>
      )}
      <Dialog
        open={confirmingStop}
        onClose={() => setConfirmingStop(false)}
        role="alertdialog"
        title={ui.runs.stopTitle}
        description={
          <p>{ui.runs.stopDescription}</p>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingStop(false)}>
              {ui.runs.keepRunning}
            </Button>
            <Button variant="danger" onClick={confirmStop}>
              {ui.runs.stopRun}
            </Button>
          </>
        }
      />
    </div>
  );
}
