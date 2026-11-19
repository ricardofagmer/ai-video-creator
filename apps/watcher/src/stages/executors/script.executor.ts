import { buildWriterPacket, scriptNotGeneratedText, type VerifiedClaim, type WriterPacketSource } from '@studio/core/agents';
import { ScriptOutputSchema, WRITER_ROLE, type ScriptOutput } from '@studio/shared/agents';
import type { StageExecutionContext, StageExecutionResult, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { type CheckId, type DeclaredOutput, type ModelUse, type StageEstimate } from '@studio/shared/run-format';
import { callAgent } from '../agents/agent-call';
import { runEvaluatorLoop, type GeneratorAttempt } from '../agents/evaluator-loop';
import { boundPromptText, boundTemplate, brandVoiceText, buildPacket, coordinatesOf } from '../agents/packet-sources';
import { reviewerScoreEvidence, revisionsExhaustedFailure } from '../agents/review-evidence';
import { reviewSubject } from '../agents/reviewer';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { ClaimsArtifactSchema, ReviewOutcomeSchema, type ClaimsArtifact } from '../shared/stage-artifacts';
import { agentCallsEstimate, evaluatorLoopRoles } from '../shared/stage-estimates';
import { readOptionalStageInput, readOwnOutput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { needsPerson, reportedSuccess, stageFailed, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

const JSON_MIME = 'application/json';
/** Recipe slot of the Scriptwriter prompt; any bound prompt is used when the slot is absent. */
const WRITER_PROMPT_SLOT = 'prompt:writer';

/**
 * `script`: Scriptwriter with the evaluator loop (topology section 7). Only verified claims reach
 * the packet. At `verify`, every claim id the script cites is re-resolved against the verified
 * set of `claims` (`claims-evidence`); the Reviewer verdict is evidence for `reviewer-score`.
 */
export class ScriptExecutor extends BaseStageExecutor {
  readonly stageId = 'script';
  protected readonly faultProvider = 'claude';
  protected override readonly appliesCallFaults = false;

  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    return agentCallsEstimate(evaluatorLoopRoles(WRITER_ROLE, context), this.isLive('claude'));
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [
      stageOutput(context.stage, 'script', 'script.json', JSON_MIME),
      stageOutput(context.stage, 'review-script-outcome', 'review-outcome.json', JSON_MIME),
    ];
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const source = await this.writerSourceOf(context);
    if ('class' in source) return stageFailed(source);
    const models: ModelUse[] = [];
    const loop = await runEvaluatorLoop<ScriptOutput>({
      context,
      subject: 'script',
      generate: (revision) => this.write(context, { ...source, ...(revision === undefined ? {} : { revision }) }, models),
      review: () => reviewSubject(this.dependencies, { context, subject: 'script', models }),
    });
    if (loop.status === 'generator-failed') return stageFailed(loop.failure, models);
    await outputs.writeJson('script', ScriptOutputSchema, loop.output);
    if (loop.status === 'revisions-exhausted') {
      await outputs.writeJson('review-script-outcome', ReviewOutcomeSchema, { format: 1, status: 'recorded', revisions: loop.revisions, verdict: loop.verdict });
      return stageFailed(revisionsExhaustedFailure(this.stageId, loop.verdict), models);
    }
    await outputs.writeJson('review-script-outcome', ReviewOutcomeSchema, loop.review);
    const caveat = loop.review.status === 'unavailable' ? ` ${stageTexts.reviewerUnavailableWarning}` : '';
    return reportedSuccess(`Roteiro com ${loop.output.scenes.length} cena(s).${caveat}`, models);
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    if (checks.includes('claims-evidence')) {
      const script = await readOwnOutput(context, 'script', ScriptOutputSchema);
      const claims = await readOptionalStageInput(context, 'claims', ClaimsArtifactSchema);
      evidence.set('claims-evidence', citedClaimsEvidence(script, claims));
    }
    if (checks.includes('reviewer-score')) {
      evidence.set('reviewer-score', reviewerScoreEvidence(context, await readOwnOutput(context, 'review-script-outcome', ReviewOutcomeSchema)));
    }
    return evidence;
  }

  private async write(context: StageExecutionContext, source: WriterPacketSource, models: ModelUse[]): Promise<GeneratorAttempt<ScriptOutput>> {
    const built = buildPacket(context, WRITER_ROLE, () => buildWriterPacket(source));
    if (built.status === 'invalid') return { status: 'failed', failure: built.failure, cause: 'invalid-packet' };
    const call = await callAgent(this.dependencies.agents, { context, role: WRITER_ROLE, packet: built.packet, models });
    if (call.status === 'ok') return call;
    return { status: 'failed', failure: withOwnerText(call.failure, scriptNotGeneratedText(call.cause)), cause: call.cause };
  }

  private async writerSourceOf(context: StageExecutionContext): Promise<WriterPacketSource | StageFailure> {
    const prompt = await boundPromptText(context, WRITER_PROMPT_SLOT);
    if (prompt === null) {
      return needsPerson(
        { kind: 'needs-person', stepKey: context.stepKey },
        'Nenhum prompt do roteirista (prompt:writer) está vinculado à receita.',
        'Vincule um prompt de texto ao slot prompt:writer da receita e retome a execução.',
      );
    }
    const claims = await readOptionalStageInput(context, 'claims', ClaimsArtifactSchema);
    const template = await boundTemplate(context, this.dependencies.catalog);
    const brandVoice = await brandVoiceText(context, this.dependencies.catalog);
    return {
      coordinates: coordinatesOf(context),
      brief: context.brief,
      verifiedClaims: verifiedClaimsOf(claims),
      templateInputSchema: template?.details.inputSchema ?? {},
      prompt,
      ...(brandVoice === undefined ? {} : { brandVoice }),
      format: { narration: context.recipe.format.narration, sceneCount: context.recipe.format.sceneCount },
      // SPEC 0005 section 5.6: the brief's notes, already capped by the `brief` step; never read here.
      learnings: context.stageBrief.learnings ?? [],
    };
  }
}

function verifiedClaimsOf(claims: ClaimsArtifact | null): VerifiedClaim[] {
  return (claims?.claims ?? []).flatMap((claim) =>
    claim.status === 'verified' && claim.evidence !== null && claim.evidenceRef !== null
      ? [{ claimId: claim.claimId, text: claim.evidence.excerpt, evidenceRef: claim.evidenceRef }]
      : [],
  );
}

/** Owner text for the Scriptwriter's `waiting` case (core `scriptNotGeneratedText`). */
function withOwnerText(failure: StageFailure, message: string): StageFailure {
  return failure.class === 'needs-person' ? { ...failure, message } : failure;
}

function citedClaimsEvidence(script: ScriptOutput | null, claims: ClaimsArtifact | null): CheckEvidence {
  const expected = 'toda afirmação citada pelo roteiro verificada na etapa verify';
  if (script === null) return { outcome: 'error', expected, measured: 'script.json ausente', detail: '' };
  const verified = new Set(verifiedClaimsOf(claims).map((claim) => claim.claimId));
  const cited = [...new Set(script.scenes.flatMap((scene) => scene.claimIds))];
  const unbacked = cited.filter((claimId) => !verified.has(claimId)).map((claimId) => claimId.slice(0, 64));
  return {
    outcome: unbacked.length === 0 ? 'passed' : 'failed',
    expected,
    measured: `${cited.length - unbacked.length} de ${cited.length} citada(s) com evidência`,
    detail: unbacked.length === 0 ? '' : `claimIds sem evidência: ${unbacked.join(', ')}`,
  };
}

