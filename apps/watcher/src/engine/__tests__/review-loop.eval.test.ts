import 'reflect-metadata';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { REVIEW_UNAVAILABLE_TEXT, type Revision } from '@studio/core/agents';
import { type AgentsPort, type ReviewVerdict } from '@studio/shared/agents';
import type { AssetResolverPort, StageEventInput, StageExecutionContext, StageExecutorPort } from '@studio/shared/ports';
import { readRunFile, runDirectory, writeRunFile } from '@studio/shared/run-files';
import { formatStepKey, type RunFile, type StageEstimate, type StageLocation, type StepRecord } from '@studio/shared/run-format';
import { runEvaluatorLoop, type EvaluatorLoopResult, type GeneratorAttempt, type ReviewAttempt } from '../../stages/agents/evaluator-loop';
import { reviewerScoreEvidence, revisionsExhaustedFailure } from '../../stages/agents/review-evidence';
import { stageTexts } from '../../stages/shared/stage-texts';
import { createWatcherHome } from '../../test-support';
import { ActiveRun, type StepPosition } from '../active-run';
import { type Clock } from '../clock';
import { ControlFileChannel } from '../control/control-file.channel';
import { RunControlService } from '../control/run-control.service';
import { RecoveryPolicy } from '../failure/recovery.policy';
import { StepFailureHandler } from '../failure/step-failure.handler';
import { emptyBaseline } from '../run-budget';
import { planningContextFor, StageWorkspace } from '../stage-workspace';

/*
 * Evals of the evaluator loop row of topology 0001 section 11 (ticket 02 criterion 5): a retry
 * happens only when the Reviewer sets `retryRecommended` with a non-blank `retryInstruction`; at
 * most `limits.revisionsPerStage` (2) revisions; a spent budget with the Reviewer still asking ends
 * in `waiting` for the owner; a Reviewer failure is a warning, not a failure. The mock executors do
 * not run the loop, so it is driven directly with a scripted generator and Reviewer on an
 * execution context of the committed fixture's `script` stage; the budget case then hands the
 * loop's result to the engine's real failure handler on a working copy of the fixture run.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const NOW = new Date('2026-11-21T12:00:00.000Z');
const SCRIPT_LOCATION: StageLocation = { stageNumber: 4, stageId: 'script' };
const STEP_KEY = formatStepKey({ stageId: 'script', step: 'execute', attempt: 1 });
const ZERO_ESTIMATE: StageEstimate = { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 };
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

const clock: Clock = { now: () => NOW };

interface Draft {
  text: string;
}

interface ScriptedLoop {
  result: EvaluatorLoopResult<Draft>;
  revisionsSeen: (Revision<Draft> | undefined)[];
  reviewCalls: number;
}

function verdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
  return {
    scores: [{ criterionId: 'clareza', score: 3, evidence: 'A cena 2 se estende demais.' }],
    overall: 3,
    blockingIssues: [],
    retryRecommended: false,
    retryInstruction: '',
    ...overrides,
  };
}

function executionContext(run: RunFile, runDir: string, events: StageEventInput[]): StageExecutionContext {
  const planning = planningContextFor(run, SCRIPT_LOCATION, {});
  return {
    ...planning,
    runDir,
    attempt: 1,
    stepKey: STEP_KEY,
    stageBrief: {
      runId: run.runId,
      stageNumber: SCRIPT_LOCATION.stageNumber,
      stageId: SCRIPT_LOCATION.stageId,
      phaseId: 'pre-production',
      title: 'Roteiro',
      templateId: 'script',
      renderedAt: NOW.toISOString(),
      instructions: '',
      bindings: [],
      inputs: [],
      checks: [],
      declaredOutputs: [],
    },
    inputManifest: {
      runId: run.runId,
      stageNumber: SCRIPT_LOCATION.stageNumber,
      stageId: SCRIPT_LOCATION.stageId,
      attempt: 1,
      createdAt: NOW.toISOString(),
      briefHash: 'a'.repeat(64),
      assets: [],
      inputs: [],
      parameters: {},
      models: [],
    },
    assets: [],
    correlationId: null,
    signal: new AbortController().signal,
    report: (): void => undefined,
    events: {
      emit: async (event): Promise<void> => {
        events.push(event);
      },
    },
  };
}

/** Drives the loop with a generator that numbers its drafts and a Reviewer that answers `reviews` in order (the last repeats). */
async function runScriptedLoop(context: StageExecutionContext, reviews: readonly ReviewAttempt[]): Promise<ScriptedLoop> {
  const revisionsSeen: (Revision<Draft> | undefined)[] = [];
  let reviewCalls = 0;
  const result = await runEvaluatorLoop<Draft>({
    context,
    subject: 'script',
    generate: async (revision): Promise<GeneratorAttempt<Draft>> => {
      revisionsSeen.push(revision);
      return { status: 'ok', output: { text: `rascunho ${revisionsSeen.length}` } };
    },
    review: async (): Promise<ReviewAttempt> => {
      const answer = reviews[Math.min(reviewCalls, reviews.length - 1)];
      reviewCalls += 1;
      if (answer === undefined) throw new Error('the scripted Reviewer has no answer');
      return answer;
    },
  });
  return { result, revisionsSeen, reviewCalls };
}

class InertExecutor implements StageExecutorPort {
  readonly stageId = SCRIPT_LOCATION.stageId;

  async estimate(): Promise<StageEstimate> {
    return ZERO_ESTIMATE;
  }

  declaredOutputs(): [] {
    return [];
  }

  async execute(): Promise<never> {
    throw new Error('the failure handler must not run the executor');
  }

  async verify(): Promise<never> {
    throw new Error('the failure handler must not run verify');
  }
}

const inertResolver: AssetResolverPort = {
  resolve: async (): Promise<never> => {
    throw new Error('no asset is resolved while a failure is handled');
  },
};

function scriptExecuteRecord(run: RunFile): StepRecord {
  const record = run.stages[SCRIPT_LOCATION.stageNumber - 1]?.steps.find((candidate) => candidate.step === 'execute');
  if (record === undefined) throw new Error('the fixture run has no script execute step');
  return record;
}

describe('evaluator loop evals (topology 0001 section 11, ticket 02 criterion 5)', () => {
  let home: { root: string; close(): Promise<void> } | undefined;
  let fixture: RunFile;
  let events: StageEventInput[];
  let context: StageExecutionContext;
  let runDir: string;

  beforeEach(async () => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
    home = await createWatcherHome({ prefix: 'engine-review-loop' });
    fixture = await readRunFile(FIXTURE_DIR);
    events = [];
    runDir = runDirectory(home.root, fixture.runId);
    context = executionContext(fixture, runDir, events);
  });

  afterEach(async () => {
    await home?.close();
    home = undefined;
    mock.restoreAll();
  });

  it('retries only when the Reviewer sets retryRecommended with a non-blank retryInstruction', async () => {
    const asks = await runScriptedLoop(context, [
      { status: 'ok', verdict: verdict({ retryRecommended: true, retryInstruction: 'Encurte a cena 2.' }) },
      { status: 'ok', verdict: verdict() },
    ]);
    const blankInstruction = await runScriptedLoop(context, [{ status: 'ok', verdict: verdict({ retryRecommended: true, retryInstruction: '   ' }) }]);
    const instructionWithoutFlag = await runScriptedLoop(context, [{ status: 'ok', verdict: verdict({ retryRecommended: false, retryInstruction: 'Aperte o texto.' }) }]);

    assert.deepEqual(asks.revisionsSeen, [undefined, { instruction: 'Encurte a cena 2.', previousOutput: { text: 'rascunho 1' } }]);
    assert.equal(asks.result.status, 'accepted');
    if (asks.result.status === 'accepted') assert.equal(asks.result.review.revisions, 1);
    for (const single of [blankInstruction, instructionWithoutFlag]) {
      assert.deepEqual(single.revisionsSeen, [undefined], 'the loop revised without both the flag and an instruction');
      assert.equal(single.result.status, 'accepted');
      if (single.result.status === 'accepted') assert.equal(single.result.review.revisions, 0);
    }
  });

  it('stops after limits.revisionsPerStage revisions while the Reviewer keeps asking', async () => {
    const stillAsking = verdict({ retryRecommended: true, retryInstruction: 'Reescreva a abertura.', blockingIssues: ['A abertura não cita o produto.'] });

    const { result, revisionsSeen, reviewCalls } = await runScriptedLoop(context, [{ status: 'ok', verdict: stillAsking }]);

    assert.equal(context.limits.revisionsPerStage, 2, 'the fixture no longer runs with the default revision budget');
    assert.equal(revisionsSeen.length, 3, 'the generator did not run exactly 1 + 2 times');
    assert.equal(reviewCalls, 3);
    assert.equal(result.status, 'revisions-exhausted');
    if (result.status === 'revisions-exhausted') assert.equal(result.revisions, 2);
    assert.equal(events.filter((event) => event.type === 'review.verdict').length, 3, 'a review was not recorded as a review.verdict event');
  });

  it('holds the run waiting for the owner when the revision budget is spent', async () => {
    const stillAsking = verdict({ retryRecommended: true, retryInstruction: 'Reescreva a abertura.', blockingIssues: ['A abertura não cita o produto.'] });
    const { result } = await runScriptedLoop(context, [{ status: 'ok', verdict: stillAsking }]);
    if (result.status !== 'revisions-exhausted') throw new Error(`expected revisions-exhausted, got ${result.status}`);
    const failure = revisionsExhaustedFailure('script', result.verdict);

    await writeRunFile(runDir, fixture);
    const active = new ActiveRun({ runDir, run: fixture, pid: 4242, clock, baseline: emptyBaseline });
    await active.start();
    const position: StepPosition = { ...SCRIPT_LOCATION, step: 'execute', attempt: 1 };
    const stepKey = await active.beginStep(position);
    let agentCalls = 0;
    const unreachableAgents: AgentsPort = {
      run: async (): Promise<never> => {
        agentCalls += 1;
        throw new Error('a needs-person failure must not call Recovery');
      },
    };
    const handler = new StepFailureHandler(new RecoveryPolicy(unreachableAgents, clock), new RunControlService(new ControlFileChannel(), clock), clock);
    const workspace = new StageWorkspace({ active, location: SCRIPT_LOCATION, executor: new InertExecutor(), resolver: inertResolver });

    const resolution = await handler.handle({ workspace, position, stepKey, failure: { origin: 'executor', failure }, detail: failure.message });
    await active.finish();

    const persisted = await readRunFile(runDir);
    assert.deepEqual(resolution, { kind: 'held', status: 'waiting' });
    assert.equal(persisted.state.status, 'waiting');
    if (persisted.state.status === 'waiting') {
      assert.deepEqual(persisted.state.cause, { kind: 'revisions-exhausted', stageId: 'script', issues: ['A abertura não cita o produto.'] });
      assert.ok(persisted.state.whatToDo.trim().length > 0);
    }
    assert.equal(scriptExecuteRecord(persisted).status, 'pending');
    assert.equal(agentCalls, 0);
  });

  it('accepts the last output with a warning when the Reviewer is unavailable', async () => {
    const { result, revisionsSeen } = await runScriptedLoop(context, [{ status: 'unavailable' }]);

    assert.equal(result.status, 'accepted');
    if (result.status !== 'accepted') return;
    assert.deepEqual(result.output, { text: 'rascunho 1' });
    assert.deepEqual(result.review, { format: 1, status: 'unavailable', revisions: 0, reason: REVIEW_UNAVAILABLE_TEXT });
    assert.equal(revisionsSeen.length, 1);
    assert.equal(events.filter((event) => event.type === 'review.verdict').length, 0);
    const evidence = reviewerScoreEvidence(context, result.review);
    assert.equal(evidence.outcome, 'skipped');
    assert.equal(evidence.detail, stageTexts.reviewerUnavailableWarning);
  });
});
