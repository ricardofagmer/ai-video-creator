'use client';

import { Alert, Button, WaitingNotice, formatUsd, useI18n, type Locale } from '@studio/ui';
import { type RunFile, type WaitingCause } from '@studio/shared/run-format';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import { GateDecisionActions, type AwaitedGate, type GateDecisionLabels } from './GateDecisionActions';

type WaitingState = Extract<RunFile['state'], { status: 'waiting' }>;

interface RunWaitingNoticeProps {
  run: RunFile;
  state: WaitingState;
  onChanged: () => void;
}

type WaitingTexts = WebMessages['runs']['waiting'];

/** design/telas/07 "Plano: ações" and "Recusar (Dialog)". */
function planLabels(t: WaitingTexts): GateDecisionLabels {
  return t.plan;
}

function recipeGateLabels(label: string, t: WaitingTexts): GateDecisionLabels {
  const texts = t.recipeGate;
  return {
    approve: texts.approve,
    approving: texts.approving,
    reject: texts.reject,
    rejectTitle: texts.rejectTitle(label),
    rejectDescription: texts.rejectDescription,
  };
}

interface OwnerTexts {
  reason: string;
  whatToDo: string;
  /** Set when the texts are the recorded pt-BR ones shown under another locale. */
  lang?: string;
}

/**
 * `reason` and `whatToDo` in the active locale. pt-BR shows what the engine recorded; es and en
 * rebuild them from `cause` where its fields carry the whole meaning, and keep the recorded text,
 * marked as pt-BR, where it is engine prose about a failure (design.md section 3.3).
 */
function ownerTexts(run: RunFile, state: WaitingState, t: WebMessages, locale: Locale): OwnerTexts {
  const recorded: OwnerTexts = { reason: state.reason, whatToDo: state.whatToDo };
  if (locale === 'pt-BR') return recorded;
  const texts = t.runs.waitingCauses;
  const usd = (amount: number): string => formatUsd(amount, locale);
  const cause = state.cause;
  switch (cause.kind) {
    case 'gate': {
      const label =
        cause.gate === 'plan' ? texts.planGateLabel : (run.recipe.definition.gates.find((candidate) => candidate.id === cause.gate)?.label ?? cause.gate);
      return { reason: texts.gateReason(label), whatToDo: texts.gateWhatToDo(label) };
    }
    case 'authentication':
      return { reason: texts.authenticationReason(cause.provider), whatToDo: texts.authenticationWhatToDo(cause.provider) };
    case 'cost-ceiling':
      return cause.ceiling === 'run'
        ? { reason: texts.costRunReason(usd(cause.estimateUsd), usd(cause.limitUsd)), whatToDo: texts.costRunWhatToDo }
        : { reason: texts.costMonthReason(usd(cause.estimateUsd), usd(cause.limitUsd)), whatToDo: texts.costMonthWhatToDo };
    case 'license-doubt':
      return { reason: texts.licenseDoubtReason(cause.ref), whatToDo: texts.licenseDoubtWhatToDo(cause.ref) };
    case 'claim-without-evidence':
      return { reason: texts.claimsReason, whatToDo: texts.claimsWhatToDo };
    case 'planner-questions':
      return { reason: texts.plannerQuestionsReason, whatToDo: texts.plannerQuestionsWhatToDo };
    case 'biometric-asset':
    case 'needs-person':
    case 'revisions-exhausted':
    case 'agent-failed':
      return { ...recorded, lang: 'pt-BR' };
  }
}

function awaitedGateOf(cause: WaitingCause): AwaitedGate | null {
  if (cause.kind === 'planner-questions') return { kind: 'plan' };
  if (cause.kind !== 'gate') return null;
  return cause.gate === 'plan' ? { kind: 'plan' } : { kind: 'recipe-gate', gate: cause.gate };
}

function ResumeAction({ runId, onChanged }: { runId: string; onChanged: () => void }): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.waiting;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await browserRunsApi.requestControl(runId, { kind: 'resume' });
      onChanged();
    } catch (caught) {
      setError(describeRunError(caught, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" loading={pending} loadingLabel={texts.resuming} onClick={() => void resume()}>
        {texts.resume}
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
  const t = useWebMessages();
  const { locale } = useI18n();
  const texts = t.runs.waiting;
  const gate = awaitedGateOf(state.cause);
  let actions: ReactNode = null;
  if (gate?.kind === 'plan') {
    actions = <GateDecisionActions runId={run.runId} gate={gate} labels={planLabels(texts)} onDecided={onChanged} />;
  } else if (gate?.kind === 'recipe-gate') {
    const label = run.recipe.definition.gates.find((candidate) => candidate.id === gate.gate)?.label ?? gate.gate;
    actions = <GateDecisionActions runId={run.runId} gate={gate} labels={recipeGateLabels(label, texts)} onDecided={onChanged} />;
  } else if (state.cause.kind !== 'cost-ceiling') {
    actions = <ResumeAction runId={run.runId} onChanged={onChanged} />;
  }

  const owner = ownerTexts(run, state, t, locale);
  return (
    <>
      <WaitingNotice
        reason={owner.lang === undefined ? owner.reason : <span lang={owner.lang}>{owner.reason}</span>}
        whatToDo={owner.lang === undefined ? owner.whatToDo : <span lang={owner.lang}>{owner.whatToDo}</span>}
        actions={actions}
      />
      {state.cause.kind === 'planner-questions' && (
        <Alert variant="info" title={texts.plannerQuestions}>
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
