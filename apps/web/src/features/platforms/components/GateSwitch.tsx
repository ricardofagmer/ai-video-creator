'use client';

import { Alert, Button, Checkbox, Dialog } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { type GateState, type PlatformCapability, type PlatformMode } from '@studio/shared/platforms';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactElement } from 'react';
import { describePlatformApiError } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import { capabilityLabels, gateOpeningConsequence } from '../platform-labels';
import { browserPlatformsApi } from '../platforms-api';
import styles from '../platforms.module.css';

interface GateSwitchProps {
  platform: Platform;
  capability: PlatformCapability;
  gate: GateState;
  mode: PlatformMode;
}

type SwitchState = { status: 'idle' } | { status: 'confirming' } | { status: 'sending' } | { status: 'failed'; message: string };

/**
 * One gate switch on `/contas` (SPEC 0007 section 5.3, OD2). Only the owner opens a gate, after the
 * platform approved the app; opening asks for a confirmation that names the consequence, closing
 * does not. The switch shows the stored gate and changes only after the api answers.
 */
export function GateSwitch({ platform, capability, gate, mode }: GateSwitchProps): ReactElement {
  const router = useRouter();
  const [state, setState] = useState<SwitchState>({ status: 'idle' });
  const sendingRef = useRef(false);
  const sending = state.status === 'sending';
  const enabled = gate === 'enabled';
  const name = platformLabels[platform];
  const inputId = `gate-${platform}-${capability}`;

  async function send(next: GateState): Promise<void> {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setState({ status: 'sending' });
    try {
      await browserPlatformsApi.changeGate(platform, { capability, state: next });
      setState({ status: 'idle' });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describePlatformApiError(error, { platform, mode }) });
    } finally {
      sendingRef.current = false;
    }
  }

  function handleToggle(): void {
    if (sending) return;
    if (enabled) {
      void send('awaiting-review');
      return;
    }
    setState({ status: 'confirming' });
  }

  function closeConfirmation(): void {
    if (!sending) setState({ status: 'idle' });
  }

  return (
    <div className={styles.gate}>
      <Checkbox
        id={inputId}
        role="switch"
        checked={enabled}
        disabled={sending}
        onChange={handleToggle}
        label={`Liberar ${capabilityLabels[capability].toLowerCase()}`}
        description={enabled ? 'Liberado por você.' : `Ligue só depois que ${name} aprovar o aplicativo.`}
      />
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <Dialog
        open={state.status === 'confirming' || (sending && !enabled)}
        onClose={closeConfirmation}
        title={`Liberar ${capabilityLabels[capability].toLowerCase()} em ${name}?`}
        description={gateOpeningConsequence(platform, capability)}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={closeConfirmation}>
              Cancelar
            </Button>
            <Button variant="primary" loading={sending} loadingLabel="Liberando…" onClick={() => void send('enabled')}>
              Liberar
            </Button>
          </>
        }
      />
    </div>
  );
}
