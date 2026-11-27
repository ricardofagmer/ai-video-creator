'use client';

import type { InstallPresence, InstallStatus } from '@studio/shared/api';
import { Alert, Button, Card, DescriptionList, Spinner, formatDateTime, useI18n } from '@studio/ui';
import type { ReactElement } from 'react';
import type { DetectionState, PairingPhase } from '@/detection/detection-machine';
import { usePortalMessages } from '@/messages';
import type { ReleaseState } from '@/release/release-loader';
import { ComponentStates } from './ComponentStates';
import { OpenStudioLink } from './OpenStudioLink';
import { UpdateNotice } from './UpdateNotice';
import styles from './portal.module.css';

export interface DetectionPanelProps {
  state: DetectionState;
  release: ReleaseState;
  studioUrl: string;
  onCheckAgain: () => void;
}

/** One view per detection state; the switch is exhaustive over the discriminated union. */
export function DetectionPanel({ state, release, studioUrl, onCheckAgain }: DetectionPanelProps): ReactElement {
  const t = usePortalMessages();
  const checkAgain = (
    <Button variant="secondary" onClick={onCheckAgain}>
      {t.detection.checkAgain}
    </Button>
  );
  const openStudio = <OpenStudioLink studioUrl={studioUrl} />;

  return (
    // No `aria-live` here: the status poll would re-announce the component list every 10 seconds;
    // each state's Alert carries its own `status` or `alert` role instead.
    <Card title={t.detection.heading}>
      <div className={styles.stack}>{renderState()}</div>
    </Card>
  );

  function renderState(): ReactElement {
    switch (state.kind) {
      case 'checking':
        return (
          <div className={styles.checking}>
            <Spinner size="sm" decorative />
            <p className={`body ${styles.paragraph}`}>{t.detection.checking}</p>
          </div>
        );
      case 'loopback-blocked':
        // DI-AC-18: an explanation with a way forward, never an error.
        return (
          <Alert variant="info" title={t.detection.loopbackBlocked.title} actions={openStudio}>
            <p>{t.detection.loopbackBlocked.body}</p>
          </Alert>
        );
      case 'permission-prompt':
        return (
          <Alert variant="info" title={t.detection.permissionPrompt.title}>
            <p>{t.detection.permissionPrompt.body}</p>
          </Alert>
        );
      case 'permission-denied':
        return (
          <Alert variant="warning" title={t.detection.permissionDenied.title} actions={<>{checkAgain}{openStudio}</>}>
            <p>{t.detection.permissionDenied.body}</p>
          </Alert>
        );
      case 'not-installed':
        return (
          <Alert variant="info" title={t.detection.notInstalled.title} actions={checkAgain}>
            <p>{t.detection.notInstalled.body}</p>
          </Alert>
        );
      case 'installed-unpaired':
        return (
          <Installed presence={state.presence} release={release} actions={openStudio}>
            <UnpairedMessage pairing={state.pairing} />
          </Installed>
        );
      case 'paired':
        return (
          <Installed presence={state.presence} status={state.status} release={release} actions={openStudio}>
            <PairedDetails status={state.status} />
          </Installed>
        );
      case 'unknown-contract':
        return (
          <Alert variant="warning" title={t.detection.unknownContract.title} actions={<>{checkAgain}{openStudio}</>}>
            <p>{t.detection.unknownContract.body}</p>
          </Alert>
        );
    }
  }
}

interface InstalledProps {
  presence: InstallPresence;
  status?: InstallStatus;
  release: ReleaseState;
  actions: ReactElement;
  children: ReactElement;
}

function Installed({ presence, status, release, actions, children }: InstalledProps): ReactElement {
  const t = usePortalMessages();
  const { locale } = useI18n();
  const version = status?.version ?? presence.version;
  const platform = status?.platform ?? presence.platform;
  const facts = [
    { term: t.detection.facts.version, description: version, mono: true },
    { term: t.detection.facts.platform, description: t.detection.platforms[platform] },
    ...(status === undefined ? [] : [{ term: t.detection.facts.checkedAt, description: formatDateTime(status.checkedAt, locale) }]),
  ];
  return (
    <>
      <UpdateNotice installedVersion={version} platform={platform} release={release} />
      <DescriptionList items={facts} columns={2} />
      {children}
      <div className={styles.actions}>{actions}</div>
    </>
  );
}

function UnpairedMessage({ pairing }: { pairing: PairingPhase }): ReactElement {
  const t = usePortalMessages();
  switch (pairing) {
    case 'pairing':
      return (
        <div className={styles.checking}>
          <Spinner size="sm" decorative />
          <p className={`body ${styles.paragraph}`}>{t.detection.unpaired.pairing}</p>
        </div>
      );
    case 'rejected':
      return (
        <Alert variant="warning" title={t.detection.unpaired.title}>
          <p>{t.detection.unpaired.rejected}</p>
        </Alert>
      );
    case 'idle':
      return (
        <Alert variant="info" title={t.detection.unpaired.title}>
          <p>{t.detection.unpaired.body}</p>
        </Alert>
      );
  }
}

function PairedDetails({ status }: { status: InstallStatus | undefined }): ReactElement {
  const t = usePortalMessages();
  if (status === undefined) {
    return (
      <div className={styles.checking}>
        <Spinner size="sm" decorative />
        <p className={`body ${styles.paragraph}`}>{t.detection.paired.waitingStatus}</p>
      </div>
    );
  }
  return (
    <>
      <p className={`body ${styles.paragraph}`}>{t.detection.paired.title}</p>
      {status.setup === 'pending' && (
        <Alert variant="warning">
          <p>{t.detection.paired.setupPending}</p>
        </Alert>
      )}
      <ComponentStates components={status.components} />
    </>
  );
}
