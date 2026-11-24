'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { type ScheduleStatus } from '@studio/shared/schedules';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { browserSchedulesApi } from '../schedules-api';
import styles from '../schedules.module.css';

interface ScheduleControlsProps {
  scheduleId: string;
  status: ScheduleStatus;
}

type ScheduleAction = 'pause' | 'resume' | 'delete';

type ControlState =
  | { status: 'idle' }
  | { status: 'confirming-delete' }
  | { status: 'sending'; action: ScheduleAction }
  | { status: 'failed'; message: string };

/**
 * "Pausar", "Retomar" and "Excluir" (SPEC 0006 sections 5.5 and 5.7): each is one atomic rewrite of
 * `schedule.json` by the api. Resuming starts a new window, so no slot of the paused period fires
 * or is logged. Deleting is final; the folder and its slot log stay as the record. Nothing here
 * touches a run that already exists.
 */
export function ScheduleControls({ scheduleId, status }: ScheduleControlsProps): ReactElement | null {
  const t = useWebMessages();
  const texts = t.schedules.controls;
  const router = useRouter();
  const [state, setState] = useState<ControlState>({ status: 'idle' });
  const sending = state.status === 'sending';

  async function send(action: ScheduleAction): Promise<void> {
    if (sending) return;
    setState({ status: 'sending', action });
    try {
      await browserSchedulesApi.patchSchedule(scheduleId, { action });
      if (action === 'delete') {
        router.push('/agendamentos');
        return;
      }
      setState({ status: 'idle' });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describeApiError(error, t) });
    }
  }

  function closeDelete(): void {
    if (!sending) setState({ status: 'idle' });
  }

  if (status === 'deleted') return null;
  const busyWith = state.status === 'sending' ? state.action : null;

  return (
    <div className={styles.controls}>
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <div className={styles.actions}>
        {status === 'active' ? (
          <Button variant="secondary" loading={busyWith === 'pause'} loadingLabel={texts.pausing} disabled={sending} onClick={() => void send('pause')}>
            {texts.pause}
          </Button>
        ) : (
          <Button variant="primary" loading={busyWith === 'resume'} loadingLabel={texts.resuming} disabled={sending} onClick={() => void send('resume')}>
            {texts.resume}
          </Button>
        )}
        <Button variant="danger" disabled={sending} onClick={() => setState({ status: 'confirming-delete' })}>
          {texts.delete}
        </Button>
      </div>
      <Dialog
        open={state.status === 'confirming-delete' || busyWith === 'delete'}
        onClose={closeDelete}
        role="alertdialog"
        title={texts.deleteTitle}
        description={texts.deleteDescription}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={closeDelete}>
              {texts.cancel}
            </Button>
            <Button variant="danger" loading={busyWith === 'delete'} loadingLabel={texts.deleting} onClick={() => void send('delete')}>
              {texts.deleteSchedule}
            </Button>
          </>
        }
      />
    </div>
  );
}
