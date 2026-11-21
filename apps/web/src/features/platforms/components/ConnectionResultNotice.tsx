'use client';

import { Alert } from '@studio/ui';
import { type ConnectionResultQuery } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { useSyncExternalStore, type ReactElement } from 'react';
import { rev7ReasonText } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import { readConnectingPlatform } from '../connecting-platform';

interface ConnectionResultNoticeProps {
  result: ConnectionResultQuery;
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function serverPlatform(): Platform | null {
  return null;
}

/**
 * The answer of a connect, after the api's callback sent the browser to
 * `/contas?resultado=<conectada | falhou>&motivo=<reason id>` (SPEC 0007 section 4.4). The reason's
 * pt-BR text is the contract's; the platform's own error text never reaches this page.
 */
export function ConnectionResultNotice({ result }: ConnectionResultNoticeProps): ReactElement {
  const platform = useSyncExternalStore(subscribeToNothing, readConnectingPlatform, serverPlatform);
  if (result.resultado === 'conectada') {
    return <Alert variant="success">{platform === null ? 'Conta conectada.' : `Conta de ${platformLabels[platform]} conectada.`}</Alert>;
  }
  return (
    <Alert variant="error">
      {result.motivo === undefined ? 'Não foi possível concluir a conexão. Tente de novo.' : rev7ReasonText(result.motivo, { platform })}
    </Alert>
  );
}
