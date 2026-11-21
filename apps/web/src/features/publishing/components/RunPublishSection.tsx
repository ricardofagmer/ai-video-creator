'use client';

import { Alert, Badge, Button, Card } from '@studio/ui';
import { type RunPublishView } from '@studio/shared/api';
import { platformPublishSupport } from '@studio/shared/platforms';
import { useEffect, useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { rev7ReasonText } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import { PUBLICATION_URL_INPUT_ID } from '@/features/metrics/publication-link';
import { MOCK_BADGE_TEXT, capabilityStatusBadge } from '@/features/platforms/platform-labels';
import { useRunPublishView } from '../hooks/useRunPublishView';
import { INSTAGRAM_PUBLISH_TEXT } from '../publish-labels';
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

const CARD_TITLE = 'Publicar';
const CARD_DESCRIPTION = 'Envie o vídeo aprovado para as suas contas. Nada é enviado sem o seu clique em Publicar.';

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
  if (data.publish.status === 'failed') {
    return (
      <>
        <Card title={CARD_TITLE} description={CARD_DESCRIPTION}>
          <Alert variant="warning">{`Não foi possível carregar a publicação. ${data.publish.message}`}</Alert>
        </Card>
        <LeftTheMachineCard egress={data.egress} lines={null} />
      </>
    );
  }
  return <LivePublishSection runId={runId} runTitle={runTitle} data={data} initialView={data.publish.view} />;
}

function LivePublishSection({ runId, runTitle, data, initialView }: RunPublishSectionProps & { initialView: RunPublishView }): ReactElement {
  const live = useRunPublishView(runId, initialView);
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
        title={CARD_TITLE}
        description={CARD_DESCRIPTION}
        actions={
          <Button variant="primary" disabled={!canOpen} onClick={() => setDialogOpen(true)}>
            Publicar…
          </Button>
        }
      >
        <div className={layout.stack}>
          {!view.approved && <Alert variant="info">{rev7ReasonText('publish-run-not-approved', { platform: null })}</Alert>}
          {live.unreachable && <Alert variant="warning">Não foi possível atualizar o envio agora. Tentando de novo…</Alert>}
          <ul className={styles.platformList}>
            {view.platforms.map((entry) => {
              const badge = capabilityStatusBadge(entry.status);
              return (
                <li key={entry.platform} className={styles.attemptLine}>
                  <span className="label">{platformLabels[entry.platform]}</span>
                  <Badge tone={badge.tone} dot>
                    {badge.label}
                  </Badge>
                  {entry.mode === 'mock' && <Badge tone="info">{MOCK_BADGE_TEXT}</Badge>}
                  {!platformPublishSupport[entry.platform] && (
                    <Button variant="ghost" size="sm" onClick={openPastedLinkForm}>
                      {INSTAGRAM_PUBLISH_TEXT}
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
