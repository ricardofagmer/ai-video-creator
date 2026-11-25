import { stat } from 'node:fs/promises';
import { ScriptOutputSchema } from '@studio/shared/agents';
import type { StageExecutionContext, StageExecutionResult } from '@studio/shared/ports';
import {
  readCostFile,
  readEgressEntries,
  readRunFile,
  resolveInsideRunReal,
  writeCostFile,
  writeQaSummary,
  writeRunManifest,
  writeRunMarkdown,
} from '@studio/shared/run-files';
import { QaMetricsSchema, runFileNames, type DeclaredOutput, type RunManifest, type StageEstimate } from '@studio/shared/run-format';
import { copyReviewVerdicts, qaCheckResults, qaSummaryOf, reviewVerdictOutputs } from '../package/qa-summary.builder';
import { reportMarkdown } from '../package/report.markdown';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { latestVideoInput } from '../shared/latest-video';
import { NarrationIndexSchema, PlanSourceSchema, QaSubjectSchema } from '../shared/stage-artifacts';
import { readOptionalStageInput, sha256OfFile, type StageOutputSink } from '../shared/stage-io';
import { needsPerson, reportedSuccess, stageFailed, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

type ManifestOutput = RunManifest['outputs'][number];

/** Deliverables listed in manifest.json, hashed after they are written. */
const DELIVERABLES = ['final-video', 'cost', 'qa-summary', 'report'];

/**
 * `package` (SPEC 0002 K5): assembles final.mp4, cost.json, qa/summary.json, report.md and
 * manifest.json before `review`, plus the optional `qa/review-<subject>.json` verdict copies of the
 * reviews that recorded one (rev 4, section 13.6). It ships only the exact file the technical QA measured and passed
 * (`qa-subject` hash); anything else waits for the owner. No publishing call exists here or in any
 * stage: delivery ends at the owner's review.
 */
export class PackageExecutor extends BaseStageExecutor {
  readonly stageId = 'package';
  protected readonly faultProvider = 'render';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(): readonly DeclaredOutput[] {
    return [
      { name: 'final-video', path: runFileNames.finalVideo, mimeType: 'video/mp4' },
      { name: 'cost', path: runFileNames.cost, mimeType: 'application/json' },
      { name: 'qa-summary', path: runFileNames.qaSummary, mimeType: 'application/json' },
      { name: 'report', path: runFileNames.report, mimeType: 'text/markdown' },
      { name: 'manifest', path: runFileNames.manifest, mimeType: 'application/json' },
      ...reviewVerdictOutputs(),
    ];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const ownerStop = (message: string, whatToDo: string): StageExecutionResult =>
      stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, whatToDo));
    const subject = await readOptionalStageInput(context, 'qa-subject', QaSubjectSchema);
    const video = latestVideoInput(context);
    // A video QA did not pass is still packaged: its failed checks reach qa/summary.json as warnings.
    if (subject === null || video === undefined) return ownerStop(stageTexts.qaNotPassed, stageTexts.qaNotPassedWhatToDo);
    const videoPath = await resolveInsideRunReal(context.runDir, subject.path);
    if (video.path !== subject.path || (await sha256OfFile(videoPath)) !== subject.contentHash) {
      return ownerStop(stageTexts.qaSubjectChanged, stageTexts.qaNotPassedWhatToDo);
    }
    const metrics = await readOptionalStageInput(context, 'qa-metrics', QaMetricsSchema);
    if (metrics === null) return ownerStop(stageTexts.missingInput('qa-metrics'), stageTexts.missingInputWhatToDo);
    await outputs.adoptFile('final-video', videoPath);

    const createdAt = this.dependencies.clock.now();
    const { reviews, outcomes } = await copyReviewVerdicts(context, outputs);
    const planSource = await readOptionalStageInput(context, 'plan-source', PlanSourceSchema);
    const checks = await qaCheckResults(context);
    const summary = qaSummaryOf({ context, createdAt, metrics, checks, reviews, planWarning: planSource?.warning ?? null });
    await outputs.writeWith('qa-summary', () => writeQaSummary(context.runDir, summary));
    await outputs.writeWith('cost', () => this.ensureCostFile(context, createdAt));

    const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
    const narration = await readOptionalStageInput(context, 'narration-index', NarrationIndexSchema);
    const report = reportMarkdown({
      title: script?.title ?? context.brief.topic,
      run: await readRunFile(context.runDir),
      writtenByStage: this.stageId,
      summary,
      outcomes,
      egress: (await readEgressEntries(context.runDir)).entries,
      voiceEngine: narration?.engine ?? null,
      planSource: planSource?.source ?? null,
    });
    await outputs.writeWith('report', () => writeRunMarkdown(context.runDir, 'report', report));

    // The builder copies egress.jsonl into `manifest.json.egress` and pins every bound asset.
    const manifest = await this.dependencies.manifestBuilder.build({
      runDir: context.runDir,
      assets: context.assets,
      outputs: await this.hashedDeliverables(context, outputs),
      createdAt,
    });
    await outputs.writeWith('manifest', () => writeRunManifest(context.runDir, manifest));
    return reportedSuccess(`Pacote montado: final.mp4 (${(metrics.durationMs / 1000).toFixed(1)} s), relatório e manifesto.`);
  }

  /** cost.json exists once any session was recorded; a run with none still ships an empty ledger. */
  private async ensureCostFile(context: StageExecutionContext, at: Date): Promise<void> {
    if ((await readCostFile(context.runDir)).status === 'present') return;
    await writeCostFile(context.runDir, {
      format: 1,
      runId: context.runId,
      currency: 'USD',
      priceTableVersion: this.dependencies.ledger.priceTableVersion,
      updatedAt: at.toISOString(),
      sessions: [],
      totalUsd: 0,
    });
  }

  private async hashedDeliverables(context: StageExecutionContext, outputs: StageOutputSink): Promise<ManifestOutput[]> {
    const hashed: ManifestOutput[] = [];
    for (const name of DELIVERABLES) {
      const path = outputs.pathOf(name);
      const absolutePath = await resolveInsideRunReal(context.runDir, path);
      const file = await stat(absolutePath).catch((error: unknown) => {
        // An output skipped by the `missing-output` mock fault is absent; the engine postcondition reports it.
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      });
      if (file === null) continue;
      hashed.push({ name, path, contentHash: await sha256OfFile(absolutePath), sizeBytes: file.size });
    }
    return hashed;
  }
}
