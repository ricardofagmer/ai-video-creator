'use client';

import { Button, Dialog } from '@studio/ui';
import { type RecipeVersionView, type ScheduleView } from '@studio/shared/api';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { SCHEDULE_SAFETY_TEXT, scheduleHref } from '../schedule-labels';
import { ScheduleCreateForm } from './ScheduleCreateForm';

interface NewScheduleButtonProps {
  recipes: readonly RecipeVersionView[];
  /** The 10-schedule limit is reached (`scheduleBounds.maxSchedules`); the api refuses an 11th. */
  atLimit: boolean;
}

const FORM_ID = 'novo-agendamento';

/**
 * "Novo agendamento" and its dialog (SPEC 0006 section 5.7). The form is mounted only while the
 * dialog is open, so each opening starts clean. After creation the owner lands on the schedule
 * page; nothing runs until its first slot, and every fired run waits at the plan gate.
 */
export function NewScheduleButton({ recipes, atLimit }: NewScheduleButtonProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function close(): void {
    if (!pending) setOpen(false);
  }

  function created(schedule: ScheduleView): void {
    router.push(scheduleHref(schedule.scheduleId));
  }

  return (
    <>
      <Button variant="primary" disabled={recipes.length === 0 || atLimit} onClick={() => setOpen(true)}>
        Novo agendamento
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Novo agendamento"
        description={SCHEDULE_SAFETY_TEXT}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" loading={pending} loadingLabel="Criando…">
              Criar agendamento
            </Button>
          </>
        }
      >
        {open && (
          <ScheduleCreateForm formId={FORM_ID} recipes={recipes} pending={pending} onPendingChange={setPending} onCreated={created} />
        )}
      </Dialog>
    </>
  );
}
