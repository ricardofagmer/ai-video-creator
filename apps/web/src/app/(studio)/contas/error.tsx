'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface AccountsErrorProps {
  reset: () => void;
}

/** SPEC 0007 section 5.9, "Erro": the failure is shown, never its stack or message. */
export default function AccountsError({ reset }: AccountsErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.accounts.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
