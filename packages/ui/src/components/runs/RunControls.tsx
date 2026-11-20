'use client';

import { useState, type ReactElement } from 'react';
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
  const [confirmingStop, setConfirmingStop] = useState(false);
  const busy = pendingAction !== undefined;

  function confirmStop(): void {
    setConfirmingStop(false);
    onAction('stop');
  }

  return (
    <div role="group" aria-label="Controles da execução" className={classNames(styles.controls, className)}>
      {available.pause && (
        <Button
          variant="secondary"
          loading={pendingAction === 'pause'}
          loadingLabel="Pausando…"
          disabled={busy}
          onClick={() => onAction('pause')}
        >
          Pausar
        </Button>
      )}
      {available.resume && (
        <Button loading={pendingAction === 'resume'} loadingLabel="Retomando…" disabled={busy} onClick={() => onAction('resume')}>
          Retomar
        </Button>
      )}
      {available.stop && (
        <Button
          variant="ghost"
          loading={pendingAction === 'stop'}
          loadingLabel="Parando…"
          disabled={busy}
          onClick={() => setConfirmingStop(true)}
          className={styles.stop}
        >
          Parar
        </Button>
      )}
      <Dialog
        open={confirmingStop}
        onClose={() => setConfirmingStop(false)}
        role="alertdialog"
        title="Parar a execução?"
        description={
          <p>
            A execução termina depois do passo atual. Os arquivos já gerados continuam na pasta da execução.
          </p>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingStop(false)}>
              Continuar executando
            </Button>
            <Button variant="danger" onClick={confirmStop}>
              Parar execução
            </Button>
          </>
        }
      />
    </div>
  );
}
