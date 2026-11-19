'use client';

import { Alert, Button, WaitingNotice } from '@studio/ui';
import { type RunFile, type WaitingCause } from '@studio/shared/run-format';
import { useState, type ReactElement, type ReactNode } from 'react';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import { GateDecisionActions, type AwaitedGate, type GateDecisionLabels } from './GateDecisionActions';

type WaitingState = Extract<RunFile['state'], { status: 'waiting' }>;

interface RunWaitingNoticeProps {
  run: RunFile;
  state: WaitingState;
  onChanged: () => void;
}

/** design/telas/07 "Plano: ações" and "Recusar (Dialog)". */
const planLabels: GateDecisionLabels = {
  approve: 'Aprovar plano',
  approving: 'Aprovando…',
  reject: 'Recusar plano',
  rejectTitle: 'Recusar o plano?',
  rejectDescription: 'A execução termina sem rodar nenhuma etapa.',
};

function recipeGateLabels(label: string): GateDecisionLabels {
  return {
    approve: 'Aprovar',
    approving: 'Aprovando…',
    reject: 'Recusar',
    rejectTitle: `Recusar "${label}"?`,
    rejectDescription: 'A execução termina como recusada neste portão.',
  };
}

function awaitedGateOf(cause: WaitingCause): AwaitedGate | null {
  if (cause.kind === 'planner-questions') return { kind: 'plan' };
  if (cause.kind !== 'gate') return null;
  return cause.gate === 'plan' ? { kind: 'plan' } : { kind: 'recipe-gate', gate: cause.gate };
}

function ResumeAction({ runId, onChanged }: { runId: string; onChanged: () => void }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await browserRunsApi.requestControl(runId, { kind: 'resume' });
      onChanged();
    } catch (caught) {
      setError(describeRunError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" loading={pending} loadingLabel="Retomando…" onClick={() => void resume()}>
        Retomar
      </Button>
      {error !== null && <Alert variant="error">{error}</Alert>}
    </>
  );
}

/**
 * The "Aguardando você" state (PRD 7.3, criterion 16; design/telas/07 and 08). `reason` and
 * `whatToDo` are the pt-BR texts the engine wrote into run.json; planner questions are agent
 * output. All of it is rendered as React text. A gate gets its answer form; a cost ceiling asks for
 * a change outside the web, so it has no action; every other cause offers "Retomar" once resolved.
 */
export function RunWaitingNotice({ run, state, onChanged }: RunWaitingNoticeProps): ReactElement {
  const gate = awaitedGateOf(state.cause);
  let actions: ReactNode = null;
  if (gate?.kind === 'plan') {
    actions = <GateDecisionActions runId={run.runId} gate={gate} labels={planLabels} onDecided={onChanged} />;
  } else if (gate?.kind === 'recipe-gate') {
    const label = run.recipe.definition.gates.find((candidate) => candidate.id === gate.gate)?.label ?? gate.gate;
    actions = <GateDecisionActions runId={run.runId} gate={gate} labels={recipeGateLabels(label)} onDecided={onChanged} />;
  } else if (state.cause.kind !== 'cost-ceiling') {
    actions = <ResumeAction runId={run.runId} onChanged={onChanged} />;
  }

  return (
    <>
      <WaitingNotice reason={state.reason} whatToDo={state.whatToDo} actions={actions} />
      {state.cause.kind === 'planner-questions' && (
        <Alert variant="info" title="Perguntas do planejador">
          <ul>
            {state.cause.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </Alert>
      )}
    </>
  );
}
