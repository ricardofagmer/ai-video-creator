'use client';

import { Button, ErrorState } from '@studio/ui';

interface SchedulesErrorProps {
  reset: () => void;
}

/** SPEC 0006 section 5.7, "Erro": the failure is shown, never its stack or message. */
export default function SchedulesError({ reset }: SchedulesErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar os agendamentos"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
