'use client';

import { Alert, Button, Dialog, FormField, Textarea } from '@studio/ui';
import { type GateDecisionRequest } from '@studio/shared/api';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';

/** Which gate the answer is for; `plan` also answers planner questions (topology section 12). */
export type AwaitedGate = { kind: 'plan' } | { kind: 'recipe-gate'; gate: string };

export interface GateDecisionLabels {
  approve: string;
  approving: string;
  reject: string;
  rejectTitle: string;
  rejectDescription: string;
}

interface GateDecisionActionsProps {
  runId: string;
  gate: AwaitedGate;
  labels: GateDecisionLabels;
  /** Called after the api recorded the answer; the page polls the new state. */
  onDecided: () => void;
}

const REASON_FIELD_ID = 'motivo-recusa';
const MAX_REASON_LENGTH = 2000;

function decisionRequest(gate: AwaitedGate, outcome: 'approved' | 'rejected', notes: string): GateDecisionRequest {
  // decidedBy and decidedAt are absent on purpose: the api takes them from the session and its clock.
  return gate.kind === 'plan' ? { kind: 'plan', outcome, notes } : { kind: 'recipe-gate', gate: gate.gate, outcome, notes };
}

/**
 * Gate answer buttons of the WaitingNotice (design/telas/07): approve at once, or reject with a
 * required reason in a Dialog. Writes `approval.json` through `POST /runs/:runId/gate-decisions`.
 */
export function GateDecisionActions({ runId, gate, labels, onDecided }: GateDecisionActionsProps): ReactElement {
  const t = useWebMessages();
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function decide(outcome: 'approved' | 'rejected', notes: string): Promise<void> {
    setPending(outcome === 'approved' ? 'approve' : 'reject');
    setServerError(null);
    try {
      await browserRunsApi.recordGateDecision(runId, decisionRequest(gate, outcome, notes));
      setRejectOpen(false);
      onDecided();
    } catch (error) {
      setServerError(describeRunError(error, t));
    } finally {
      setPending(null);
    }
  }

  function submitRejection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed === '') {
      setReasonError(t.runs.waiting.reasonRequired);
      return;
    }
    setReasonError(null);
    void decide('rejected', trimmed);
  }

  return (
    <>
      <Button variant="primary" loading={pending === 'approve'} loadingLabel={labels.approving} disabled={pending !== null} onClick={() => void decide('approved', '')}>
        {labels.approve}
      </Button>
      <Button variant="secondary" disabled={pending !== null} onClick={() => setRejectOpen(true)}>
        {labels.reject}
      </Button>
      {serverError !== null && !rejectOpen && <Alert variant="error">{serverError}</Alert>}
      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={labels.rejectTitle}
        description={labels.rejectDescription}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              {t.runs.waiting.cancel}
            </Button>
            <Button type="submit" form="form-recusa" variant="danger" loading={pending === 'reject'} loadingLabel={t.runs.waiting.rejecting}>
              {labels.reject}
            </Button>
          </>
        }
      >
        <form id="form-recusa" className={layout.stack} onSubmit={submitRejection} noValidate>
          {serverError !== null && <Alert variant="error">{serverError}</Alert>}
          <FormField id={REASON_FIELD_ID} label={t.runs.waiting.reasonLabel} error={reasonError ?? undefined}>
            {({ invalid, ...control }) => (
              <Textarea
                {...control}
                invalid={invalid}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            )}
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
