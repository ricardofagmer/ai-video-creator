'use client';

import { Button, ErrorState } from '@studio/ui';

interface CurationsErrorProps {
  reset: () => void;
}

/** SPEC 0005 section 5.9, "Erro": the failure is shown, never its stack or message. */
export default function CurationsError({ reset }: CurationsErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar a proposta do curador"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
