'use client';

import { Alert, Badge, Button, Card } from '@studio/ui';
import { type RunPublishView } from '@studio/shared/api';
import { platformPublishSupport } from '@studio/shared/platforms';
import { useEffect, useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { rev7ReasonText } from '@/features/common/platform-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { platformLabels } from '@/features/metrics/metric-labels';
import { PUBLICATION_URL_INPUT_ID } from '@/features/metrics/publication-link';
import { capabilityStatusBadge } from '@/features/platforms/platform-labels';
import { useRunPublishView } from '../hooks/useRunPublishView';
import styles from '../publishing.module.css';
import { type RunPublishData } from '../run-publish-data';
import { LeftTheMachineCard } from './LeftTheMachineCard';
import { PublishAttemptList } from './PublishAttemptList';
import { PublishDialog } from './PublishDialog';

interface RunPublishSectionProps {
  runId: string;
  runTitle: string;
  data: RunPublishData;
}


/** OD8: the R3 pasted-link form, in "Publicações" further down the page. */
function openPastedLinkForm(): void {
  const input = document.getElementById(PUBLICATION_URL_INPUT_ID);
  if (input === null) return;
  input.scrollIntoView({ block: 'center' });
  input.focus();
}

/**
 * The publish card and "O que saiu da máquina" on an approved run's page (SPEC 0007 sections 5.4
 * and 5.9). Each read fails on its own; the rest of the run page is unaffected.
 */
export function RunPublishSection({ runId, runTitle, data }: RunPublishSectionProps): ReactElement {
  const texts = useWebMessages().publishing.section;
  if (data.publish.status === 'failed') {
    return (
      <>
        <Card title={texts.title} description={texts.description}>
          <Alert variant="warning">{texts.loadFailed(data.publish.message)}</Alert>
        </Card>
        <LeftTheMachineCard egress={data.egress} lines={null} />
      </>
    );
  }
  return <LivePublishSection runId={runId} runTitle={runTitle} data={data} initialView={data.publish.view} />;
}

function LivePublishSection({ runId, runTitle, data, initialView }: RunPublishSectionProps & { initialView: RunPublishView }): ReactElement {
  const live = useRunPublishView(runId, initialView);
  const t = useWebMessages();
  const texts = t.publishing.section;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pasteRequested, setPasteRequested] = useState(false);
  const { view } = live;
  const canOpen = view.approved && view.platforms.some((entry) => platformPublishSupport[entry.platform]);

  // After the dialog closed and handed focus back to its opener, move it on to the pasted-link form.
  useEffect(() => {
    if (dialogOpen || !pasteRequested) return;
    setPasteRequested(false);
    openPastedLinkForm();
  }, [dialogOpen, pasteRequested]);

  function pasteLink(): void {
    setDialogOpen(false);
    setPasteRequested(true);
  }

  return (
    <>
      <Card
        title={texts.title}
        description={texts.description}
        actions={
          <Button variant="primary" disabled={!canOpen} onClick={() => setDialogOpen(true)}>
            {texts.open}
          </Button>
        }
      >
        <div className={layout.stack}>
          {!view.approved && <Alert variant="info">{rev7ReasonText('publish-run-not-approved', { platform: null }, t)}</Alert>}
          {live.unreachable && <Alert variant="warning">{texts.unreachable}</Alert>}
          <ul className={styles.platformList}>
            {view.platforms.map((entry) => {
              const badge = capabilityStatusBadge(entry.status, t.platforms);
              return (
                <li key={entry.platform} className={styles.attemptLine}>
                  <span className="label">{platformLabels[entry.platform]}</span>
                  <Badge tone={badge.tone} dot>
                    {badge.label}
                  </Badge>
                  {entry.mode === 'mock' && <Badge tone="info">{t.platforms.mockBadge}</Badge>}
                  {!platformPublishSupport[entry.platform] && (
                    <Button variant="ghost" size="sm" onClick={openPastedLinkForm}>
                      {t.publishing.instagram}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <PublishAttemptList runId={runId} attempts={view.attempts} onAttempt={live.applyAttempt} />
        </div>
      </Card>
      <PublishDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        runId={runId}
        runTitle={runTitle}
        view={view}
        accountLabels={data.accountLabels}
        onAttempt={live.applyAttempt}
        onPasteLink={pasteLink}
      />
      <LeftTheMachineCard egress={data.egress} lines={view.leftTheMachine} />
    </>
  );
}
