'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { type RunFile, type RunStatus } from '@studio/shared/run-format';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import { RunEditDialog } from './RunEditDialog';

/** Stopped runs whose brief can be edited and resumed (the api's resumable statuses, minus `waiting`, which has its own fix). */
const editableStatuses: readonly RunStatus[] = ['paused', 'interrupted', 'failed'];

/** No watcher owns or may take these; the api still refuses a reviewed run or a comparison arm. */
const deletableStatuses: readonly RunStatus[] = ['draft', 'waiting', 'paused', 'failed', 'interrupted', 'review'];

export function runManageActionsOf(status: RunStatus): { edit: boolean; delete: boolean } {
  return { edit: editableStatuses.includes(status), delete: deletableStatuses.includes(status) };
}

interface RunManageActionsProps {
  run: RunFile;
  status: RunStatus;
  onChanged: () => void;
  /** Where to go once the run is gone. */
  deletedHref: string;
}

/** "Editar" and "Excluir" of a stopped run, under "Agora". Delete asks first: it cannot be undone. */
export function RunManageActions({ run, status, onChanged, deletedHref }: RunManageActionsProps): ReactElement | null {
  const t = useWebMessages();
  const texts = t.runs.manage;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const available = runManageActionsOf(status);
  if (!available.edit && !available.delete) return null;

  async function remove(): Promise<void> {
    setDeleting(true);
    setFailure(null);
    try {
      await browserRunsApi.deleteRun(run.runId);
      setConfirming(false);
      router.push(deletedHref);
      router.refresh();
    } catch (caught) {
      setFailure(describeRunError(caught, t));
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={layout.row}>
        {available.edit && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {texts.edit}
          </Button>
        )}
        {available.delete && (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            {texts.delete}
          </Button>
        )}
      </div>
      {editing && <RunEditDialog run={run} open={editing} onClose={() => setEditing(false)} onChanged={onChanged} />}
      <Dialog
        open={confirming}
        onClose={() => (deleting ? undefined : setConfirming(false))}
        title={texts.deleteTitle}
        description={texts.deleteDescription(run.title)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
              {texts.cancel}
            </Button>
            <Button variant="danger" loading={deleting} loadingLabel={texts.deleting} onClick={() => void remove()}>
              {texts.deleteConfirm}
            </Button>
          </>
        }
      >
        {failure !== null && <Alert variant="error">{failure}</Alert>}
      </Dialog>
    </>
  );
}
