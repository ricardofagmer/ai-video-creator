'use client';

import { Button, ErrorState } from '@studio/ui';

interface ComparisonsErrorProps {
  reset: () => void;
}

/** SPEC 0003 section 5.3, "Erro": the failure is shown, never its stack or message. */
export default function ComparisonsError({ reset }: ComparisonsErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar as comparações"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
