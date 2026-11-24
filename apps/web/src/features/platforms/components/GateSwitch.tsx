'use client';

import { Alert, Button, Checkbox, Dialog, useI18n } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { type GateState, type PlatformCapability, type PlatformMode } from '@studio/shared/platforms';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactElement } from 'react';
import { describePlatformApiError } from '@/features/common/platform-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { platformLabels } from '@/features/metrics/metric-labels';
import { gateOpeningConsequence } from '../platform-labels';
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
  const t = useWebMessages();
  const texts = t.platforms.gate;
  const { locale } = useI18n();
  const [state, setState] = useState<SwitchState>({ status: 'idle' });
  const sendingRef = useRef(false);
  const sending = state.status === 'sending';
  const enabled = gate === 'enabled';
  const name = platformLabels[platform];
  const inputId = `gate-${platform}-${capability}`;
  const capabilityName = t.platforms.capabilities[capability].toLocaleLowerCase(locale);

  async function send(next: GateState): Promise<void> {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setState({ status: 'sending' });
    try {
      await browserPlatformsApi.changeGate(platform, { capability, state: next });
      setState({ status: 'idle' });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describePlatformApiError(error, { platform, mode }, t) });
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
        label={texts.enable(capabilityName)}
        description={enabled ? texts.enabledByYou : texts.enableAfterReview(name)}
      />
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <Dialog
        open={state.status === 'confirming' || (sending && !enabled)}
        onClose={closeConfirmation}
        title={texts.confirmTitle(capabilityName, name)}
        description={gateOpeningConsequence(platform, capability, t.platforms)}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={closeConfirmation}>
              {texts.cancel}
            </Button>
            <Button variant="primary" loading={sending} loadingLabel={texts.enabling} onClick={() => void send('enabled')}>
              {texts.confirm}
            </Button>
          </>
        }
      />
    </div>
  );
}
