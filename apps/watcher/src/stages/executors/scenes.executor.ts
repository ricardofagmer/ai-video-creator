import { buildDirectorPacket, scenesNotDefinedText, type DirectorPacketSource } from '@studio/core/agents';
import { DIRECTOR_ROLE, ScenesOutputSchema, ScriptOutputSchema, type ScenesOutput } from '@studio/shared/agents';
import type { StageExecutionContext, StageExecutionResult, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { type CheckId, type DeclaredOutput, type ModelUse, type StageEstimate } from '@studio/shared/run-format';
import { callAgent } from '../agents/agent-call';
import { runEvaluatorLoop, type GeneratorAttempt } from '../agents/evaluator-loop';
import { boundTemplate, brandKitSummary, buildPacket, coordinatesOf } from '../agents/packet-sources';
import { reviewCaveat, reviewerScoreEvidence } from '../agents/review-evidence';
import { reviewSubject } from '../agents/reviewer';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { CapturesIndexSchema, ReviewOutcomeSchema, type ReviewOutcome } from '../shared/stage-artifacts';
import { agentCallsEstimate, evaluatorLoopRoles } from '../shared/stage-estimates';
import { ownerReferencesField, readOwnerReferences, readReferenceMedia } from '../shared/owner-references-input';
import { readReferenceAnalysesInput, referenceAnalysesField } from '../shared/reference-analyses-input';
import { readSiteAnalysisInput, siteAnalysisCaveat, siteAnalysisField, type SiteAnalysisInput } from '../shared/site-analysis-input';
import { readOptionalStageInput, readOwnOutput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { needsPerson, reportedSuccess, stageFailed, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { directorMusicField } from '../music/director-music';
import { sceneRefsEvidence } from './scene-refs';

const JSON_MIME = 'application/json';

/**
 * `scenes`: Scene director with the evaluator loop (topology section 7) over the approved script
 * and the captures index. The packet offers only bound, non-biometric refs (core
 * `bindingSummaries`); at `verify`, cited refs and capture ids are re-resolved (`refs-resolve`).
 */
export class ScenesExecutor extends BaseStageExecutor {
  readonly stageId = 'scenes';
  protected readonly faultProvider = 'claude';
  protected override readonly appliesCallFaults = false;

  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    return agentCallsEstimate(evaluatorLoopRoles(DIRECTOR_ROLE, context), this.agentCallsBilled());
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [
      stageOutput(context.stage, 'scenes', 'scenes.json', JSON_MIME),
      stageOutput(context.stage, 'review-scenes-outcome', 'review-outcome.json', JSON_MIME),
    ];
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const siteAnalysis = await readSiteAnalysisInput(context);
    const directorSource = await this.directorSourceOf(context, siteAnalysis);
    if ('class' in directorSource) return stageFailed(directorSource);
    // The `reference-analyses` artifact `script` wrote, when it wrote one; absent is the usual case.
    const ownerReferences = await readOwnerReferences(context, this.dependencies.catalog);
    const source: DirectorPacketSource = {
      ...directorSource,
      ...referenceAnalysesField(await readReferenceAnalysesInput(context)),
      ...ownerReferencesField(ownerReferences),
      ...(await directorMusicField(context, this.dependencies.catalog)),
    };
    const models: ModelUse[] = [];
    const loop = await runEvaluatorLoop<ScenesOutput>({
      context,
      subject: 'scenes',
      generate: (revision) => this.direct(context, { ...source, ...(revision === undefined ? {} : { revision }) }, models),
      review: (draft) => reviewSubject(this.dependencies, { context, subject: 'scenes', models, draft }),
    });
    if (loop.status === 'generator-failed') return stageFailed(loop.failure, models);
    await outputs.writeJson('scenes', ScenesOutputSchema, loop.output);
    // Owner decision 2026-11-24: a review never stops the run; the last draft goes on with a caveat.
    const exhausted = loop.status === 'revisions-exhausted';
    const review: ReviewOutcome = exhausted ? { format: 1, status: 'recorded', revisions: loop.revisions, verdict: loop.verdict } : loop.review;
    await outputs.writeJson('review-scenes-outcome', ReviewOutcomeSchema, review);
    const reviewNote = review.status === 'unavailable' ? stageTexts.reviewerUnavailableWarning : reviewCaveat(context, review, exhausted);
    const caveat = reviewNote === null ? '' : ` ${reviewNote}`;
    return reportedSuccess(`${loop.output.scenes.length} cena(s) definida(s).${caveat}${siteAnalysisCaveat(siteAnalysis)}`, models);
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    if (checks.includes('refs-resolve')) {
      const scenes = await readOwnOutput(context, 'scenes', ScenesOutputSchema);
      const captures = await readOptionalStageInput(context, 'captures-index', CapturesIndexSchema);
      evidence.set('refs-resolve', await sceneRefsEvidence(context, this.dependencies.assetResolver, { scenes, captures }));
    }
    if (checks.includes('reviewer-score')) {
      evidence.set('reviewer-score', reviewerScoreEvidence(context, await readOwnOutput(context, 'review-scenes-outcome', ReviewOutcomeSchema)));
    }
    return evidence;
  }

  private async direct(context: StageExecutionContext, source: DirectorPacketSource, models: ModelUse[]): Promise<GeneratorAttempt<ScenesOutput>> {
    const built = buildPacket(context, DIRECTOR_ROLE, () => buildDirectorPacket(source));
    if (built.status === 'invalid') return { status: 'failed', failure: built.failure, cause: 'invalid-packet' };
    const call = await callAgent(this.dependencies.agents, { context, role: DIRECTOR_ROLE, packet: built.packet, models });
    if (call.status === 'ok') return call;
    const failure = call.failure.class === 'needs-person' ? { ...call.failure, message: scenesNotDefinedText(call.cause) } : call.failure;
    return { status: 'failed', failure, cause: call.cause };
  }

  private async directorSourceOf(context: StageExecutionContext, siteAnalysis: SiteAnalysisInput): Promise<DirectorPacketSource | StageFailure> {
    const ownerStop = (message: string, whatToDo: string): StageFailure => needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, whatToDo);
    const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
    if (script === null) return ownerStop(stageTexts.missingInput('script'), stageTexts.missingInputWhatToDo);
    const { catalog } = this.dependencies;
    const template = await boundTemplate(context, catalog);
    if (template === null) return ownerStop(stageTexts.templateNotBound, stageTexts.templateNotBoundWhatToDo);
    const brandKit = await brandKitSummary(context, catalog);
    if (brandKit === null) return ownerStop(stageTexts.brandKitNotBound, stageTexts.brandKitNotBoundWhatToDo);
    const captures = await readOptionalStageInput(context, 'captures-index', CapturesIndexSchema);
    return {
      coordinates: coordinatesOf(context),
      script,
      capturesIndex: (captures?.captures ?? []).map(({ captureId, label, durationMs }) => ({ captureId, label, durationMs })),
      templateSceneSchema: template.details.sceneSchema ?? {},
      // The recipe's pins, then the pictures and clips the owner put on this run: both may be shown.
      boundAssets: [...(await catalog.boundSummaries(context)), ...(await readReferenceMedia(context, catalog))],
      brandKit,
      cameraMoves: template.details.cameraMoves,
      transitions: template.details.transitions,
      // SPEC 0005 section 5.6: the brief's notes, already capped by the `brief` step; never read here.
      learnings: context.stageBrief.learnings ?? [],
      ...(context.brief.instructions === undefined ? {} : { ownerInstructions: context.brief.instructions }),
      ...siteAnalysisField(siteAnalysis),
    };
  }
}
