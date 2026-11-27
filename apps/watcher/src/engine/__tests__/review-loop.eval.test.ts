import 'reflect-metadata';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { REVIEW_UNAVAILABLE_TEXT, type Revision } from '@studio/core/agents';
import { type ReviewVerdict } from '@studio/shared/agents';
import type { StageEventInput, StageExecutionContext } from '@studio/shared/ports';
import { readRunFile, runDirectory } from '@studio/shared/run-files';
import { formatStepKey, type RunFile, type StageLocation } from '@studio/shared/run-format';
import { runEvaluatorLoop, type EvaluatorLoopResult, type GeneratorAttempt, type ReviewAttempt } from '../../stages/agents/evaluator-loop';
import { reviewCaveat, reviewerScoreEvidence } from '../../stages/agents/review-evidence';
import { type ReviewOutcome } from '../../stages/shared/stage-artifacts';
import { stageTexts } from '../../stages/shared/stage-texts';
import { createWatcherHome } from '../../test-support';
import { planningContextFor } from '../stage-workspace';

/*
 * Evals of the evaluator loop row of topology 0001 section 11 (ticket 02 criterion 5): a retry
 * happens only when the Reviewer sets `retryRecommended` with a non-blank `retryInstruction`; at
 * most `limits.revisionsPerStage` (2) revisions; a spent budget with the Reviewer still asking keeps
 * the last draft and leaves a caveat (owner decision 2026-11-24: a review never stops the run); a
 * Reviewer failure is a warning, not a failure. The mock executors do not run the loop, so it is
 * driven directly with a scripted generator and Reviewer on an execution context of the committed
 * fixture's `script` stage.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const NOW = new Date('2026-11-21T12:00:00.000Z');
const SCRIPT_LOCATION: StageLocation = { stageNumber: 4, stageId: 'script' };
const STEP_KEY = formatStepKey({ stageId: 'script', step: 'execute', attempt: 1 });
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

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

  it('lets the last draft go on with a caveat when the revision budget is spent', async () => {
    const stillAsking = verdict({ retryRecommended: true, retryInstruction: 'Reescreva a abertura.', blockingIssues: ['A abertura não cita o produto.'] });
    const { result } = await runScriptedLoop(context, [{ status: 'ok', verdict: stillAsking }]);
    if (result.status !== 'revisions-exhausted') throw new Error(`expected revisions-exhausted, got ${result.status}`);
    // What the script and scenes executors record for a spent budget.
    const review: ReviewOutcome = { format: 1, status: 'recorded', revisions: result.revisions, verdict: result.verdict };

    assert.deepEqual(result.output, { text: 'rascunho 3' }, 'the last draft is the one kept');
    assert.equal(reviewCaveat(context, review, true), stageTexts.reviewerContinued(3, ['A abertura não cita o produto.']));
    assert.notEqual(reviewerScoreEvidence(context, review).outcome, 'failed', 'a review never fails the stage');
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
