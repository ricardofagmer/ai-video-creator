'use client';

import { Badge, Button, Dialog, classNames } from '@studio/ui';
import { type PublishAttemptView, type RunPublishView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { platformPublishSupport } from '@studio/shared/platforms';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { platformLabels } from '@/features/metrics/metric-labels';
import { capabilityStatusBadge } from '@/features/platforms/platform-labels';
import { CANNOT_UNPUBLISH_TEXT, INSTAGRAM_PUBLISH_TEXT } from '../publish-labels';
import styles from '../publishing.module.css';
import { PublishPlatformTab } from './PublishPlatformTab';

interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  runId: string;
  runTitle: string;
  view: RunPublishView;
  accountLabels: Readonly<Record<Platform, string | null>>;
  onAttempt: (attempt: PublishAttemptView) => void;
  /** OD8: closes the dialog and opens the R3 pasted-link form. */
  onPasteLink: () => void;
}

/**
 * The publish dialog (SPEC 0007 section 5.4): one tab per platform whose publishing is supported
 * (YouTube and TikTok, OD8), each with its status badge. Instagram has no tab: the dialog says
 * "Publique no Instagram e cole o link" and opens the R3 pasted-link form. The body mounts only
 * while the dialog is open, so each opening creates fresh idempotency keys.
 */
export function PublishDialog({ open, onClose, runId, runTitle, view, accountLabels, onAttempt, onPasteLink }: PublishDialogProps): ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Publicar o vídeo aprovado"
      description={`O estúdio só envia quando você clica em Publicar. O envio é feito pelo vigia, entre as execuções. ${CANNOT_UNPUBLISH_TEXT}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {open && <PublishTabs runId={runId} runTitle={runTitle} view={view} accountLabels={accountLabels} onAttempt={onAttempt} onPasteLink={onPasteLink} />}
    </Dialog>
  );
}

type PublishTabsProps = Omit<PublishDialogProps, 'open' | 'onClose'>;

function PublishTabs({ runId, runTitle, view, accountLabels, onAttempt, onPasteLink }: PublishTabsProps): ReactElement {
  const tabs = view.platforms.filter((entry) => platformPublishSupport[entry.platform]);
  const [active, setActive] = useState<Platform | null>(tabs[0]?.platform ?? null);

  function focusTab(index: number): void {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (target === undefined) return;
    setActive(target.platform);
    document.getElementById(tabId(target.platform))?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((entry) => entry.platform === active);
    if (event.key === 'ArrowRight') focusTab(index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label="Plataformas" className={styles.tabList} onKeyDown={handleKeyDown}>
        {tabs.map((entry) => {
          const selected = entry.platform === active;
          const badge = capabilityStatusBadge(entry.status);
          return (
            <button
              key={entry.platform}
              id={tabId(entry.platform)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(entry.platform)}
              tabIndex={selected ? 0 : -1}
              className={classNames(styles.tab, selected && styles.tabSelected)}
              onClick={() => setActive(entry.platform)}
            >
              <span className="label">{platformLabels[entry.platform]}</span>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </button>
          );
        })}
      </div>
      {tabs.map((entry) => (
        <div
          key={entry.platform}
          id={panelId(entry.platform)}
          role="tabpanel"
          aria-labelledby={tabId(entry.platform)}
          hidden={entry.platform !== active}
          className={styles.tabPanel}
        >
          <PublishPlatformTab
            runId={runId}
            runTitle={runTitle}
            view={view}
            platform={entry}
            accountLabel={accountLabels[entry.platform]}
            onAttempt={onAttempt}
          />
        </div>
      ))}
      <p className={styles.instagramNote}>
        <Button variant="ghost" onClick={onPasteLink}>
          {INSTAGRAM_PUBLISH_TEXT}
        </Button>
      </p>
    </div>
  );
}

function tabId(platform: Platform): string {
  return `publicar-aba-${platform}`;
}

function panelId(platform: Platform): string {
  return `publicar-painel-${platform}`;
}
