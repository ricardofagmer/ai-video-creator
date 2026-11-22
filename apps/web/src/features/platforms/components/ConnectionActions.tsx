'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { type PlatformMode, type RevokeOutcome } from '@studio/shared/platforms';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactElement } from 'react';
import { describePlatformApiError } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import { IMPORT_FALLBACK_TEXT } from '../platform-labels';
import { rememberConnectingPlatform } from '../connecting-platform';
import { browserPlatformsApi } from '../platforms-api';
import styles from '../platforms.module.css';

interface ConnectionActionsProps {
  platform: Platform;
  mode: PlatformMode;
  /** Some capability is `disconnected` or `needs-reconnect`: a (re)connect would help. */
  canConnect: boolean;
  /** An account is stored for the platform. */
  hasAccount: boolean;
}

type ActionState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'confirming-disconnect' }
  | { status: 'disconnecting' }
  | { status: 'disconnected'; revoke: RevokeOutcome }
  | { status: 'failed'; message: string };

/**
 * Section 5.2: the revoke at the platform is best effort. The api answer names its outcome (owner
 * decision 2026-11-21), so the owner is asked to remove the app's access on the platform only when
 * the platform did not confirm the revoke (`skipped` or `failed`).
 */
function disconnectedText(name: string, revoke: RevokeOutcome): string {
  if (revoke === 'revoked') {
    return `O acesso guardado no estúdio foi apagado e a conta de ${name} confirmou a remoção do acesso do aplicativo.`;
  }
  return `O acesso guardado no estúdio foi apagado. Para garantir, remova também o acesso do aplicativo nas configurações da sua conta de ${name}.`;
}

/**
 * "Conectar", "Reconectar" and "Desconectar" on `/contas` (SPEC 0007 sections 5.2 and 5.9). Connect
 * asks the api for the authorize URL and navigates this same tab there; the platform comes back
 * to the api's callback, which answers 303 to `/contas?resultado=...`. Disconnect is final for the
 * stored access and asks first.
 */
export function ConnectionActions({ platform, mode, canConnect, hasAccount }: ConnectionActionsProps): ReactElement | null {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const busyRef = useRef(false);
  const name = platformLabels[platform];
  const busy = state.status === 'connecting' || state.status === 'disconnecting';

  async function connect(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ status: 'connecting' });
    try {
      const started = await browserPlatformsApi.startConnection(platform);
      rememberConnectingPlatform(platform);
      // The button stays busy: this tab is leaving for the platform's consent page.
      window.location.assign(started.authorizeUrl);
    } catch (error) {
      busyRef.current = false;
      setState({ status: 'failed', message: describePlatformApiError(error, { platform, mode }) });
    }
  }

  async function disconnect(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ status: 'disconnecting' });
    try {
      const result = await browserPlatformsApi.disconnect(platform);
      setState({ status: 'disconnected', revoke: result.revoke });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describePlatformApiError(error, { platform, mode }) });
    } finally {
      busyRef.current = false;
    }
  }

  function closeDisconnect(): void {
    if (state.status !== 'disconnecting') setState({ status: 'idle' });
  }

  if (!canConnect && !hasAccount && state.status !== 'disconnected') return null;

  return (
    <div className={styles.connection}>
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      {state.status === 'disconnected' && <Alert variant="info">{disconnectedText(name, state.revoke)}</Alert>}
      <div className={styles.actions}>
        {canConnect && (
          <Button
            variant="primary"
            loading={state.status === 'connecting'}
            loadingLabel="Abrindo a plataforma…"
            disabled={busy}
            onClick={() => void connect()}
          >
            {hasAccount ? 'Reconectar' : 'Conectar'}
          </Button>
        )}
        {hasAccount && (
          <Button variant="secondary" disabled={busy} onClick={() => setState({ status: 'confirming-disconnect' })}>
            Desconectar
          </Button>
        )}
      </div>
      <Dialog
        open={state.status === 'confirming-disconnect' || state.status === 'disconnecting'}
        onClose={closeDisconnect}
        role="alertdialog"
        title={`Desconectar ${name}?`}
        description={`O estúdio apaga o acesso guardado no Keychain e para de coletar métricas e de publicar em ${name}. ${IMPORT_FALLBACK_TEXT}`}
        footer={
          <>
            <Button variant="secondary" disabled={state.status === 'disconnecting'} onClick={closeDisconnect}>
              Cancelar
            </Button>
            <Button variant="danger" loading={state.status === 'disconnecting'} loadingLabel="Desconectando…" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </>
        }
      />
    </div>
  );
}
