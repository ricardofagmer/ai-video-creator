'use client';

import { Button, ErrorState } from '@studio/ui';

interface AccountsErrorProps {
  reset: () => void;
}

/** SPEC 0007 section 5.9, "Erro": the failure is shown, never its stack or message. */
export default function AccountsError({ reset }: AccountsErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar as contas"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
