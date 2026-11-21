import { join } from 'node:path';
import { EgressLog } from '@studio/core/providers';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { MediaWriteResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { withScratchDir } from '../shared/scratch-dir';
import { CapturesIndexSchema, type CaptureEntry } from '../shared/stage-artifacts';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

const CAPTURE_ID = 'capture-1';
/** The toolbox recorder records 5 to 20 s; scenes reuse the clip by in/out points. */
const MAX_CAPTURE_S = 20;

/**
 * `capture`: one screen recording of the brief's `sourceUrl`. Live mode records egress first, then
 * runs the toolbox Playwright recorder in the tool runner (fresh browser context, https allowlist
 * of the page's own host). Mock mode renders ffmpeg's local test pattern: no browser, no network.
 * The `captures-index` entry carries the run-relative `path` and `sensitivity: normal` (owner
 * default for captures of a public page) that R1-13's FrameSampleTool reads.
 */
export class CaptureExecutor extends BaseStageExecutor {
  readonly stageId = 'capture';
  protected readonly faultProvider = 'capture';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    const index = stageOutput(context.stage, 'captures-index', 'captures-index.json', 'application/json');
    if (context.brief.sourceUrl === undefined) return [index];
    const video = this.isLive('capture')
      ? stageOutput(context.stage, 'capture-video', `${CAPTURE_ID}.webm`, 'video/webm')
      : stageOutput(context.stage, 'capture-video', `${CAPTURE_ID}.mp4`, 'video/mp4');
    return [index, video];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const sourceUrl = context.brief.sourceUrl ?? null;
    if (sourceUrl === null) {
      await outputs.writeJson('captures-index', CapturesIndexSchema, { format: 1, mode: 'no-source', sourceUrl, captures: [] });
      return reportedSuccess(stageTexts.noSourceUrl);
    }
    const live = this.isLive('capture');
    if (live && !sourceUrl.startsWith('https://')) {
      return stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, stageTexts.captureBlocked, stageTexts.captureBlockedWhatToDo));
    }
    const durationS = Math.min(MAX_CAPTURE_S, context.brief.targetDurationSec);
    const { canvas, aspect } = context.recipe.format;
    if (live) {
      const egress = await EgressLog.open(context.runDir);
      await egress.record({ provider: 'capture', what: 'page-fetch', stepKey: context.stepKey, sessionId: null, at: this.dependencies.clock.now(), measure: { unit: 'pages', amount: 1 } });
    }
    context.report({ kind: 'tool', text: live ? `Gravando a página ${new URL(sourceUrl).hostname}.` : 'Gerando captura simulada local.' });

    const options = { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir] };
    const recorded = await withScratchDir(this.dependencies.settings, async (directory) => {
      const output = join(directory, live ? `${CAPTURE_ID}.webm` : `${CAPTURE_ID}.mp4`);
      const result = live
        ? await this.dependencies.runner.run(
            { command: 'live-capture', url: sourceUrl, durationS, viewport: aspect === '9:16' ? 'vertical' : 'desktop', output },
            MediaWriteResultSchema,
            options,
          )
        : await this.dependencies.runner.run(
            { command: 'test-capture', width: canvas.width, height: canvas.height, durationS, output },
            MediaWriteResultSchema,
            options,
          );
      if (result.status === 'ok') await outputs.adoptFile('capture-video', output);
      return result;
    });
    if (recorded.status === 'failed') return stageFailed(toolFailure(recorded, context));

    const entry: CaptureEntry = {
      captureId: CAPTURE_ID,
      label: live ? `Gravação de ${new URL(sourceUrl).hostname}` : 'Captura simulada (padrão de teste local)',
      durationMs: Math.round(recorded.result.durationS * 1000),
      path: outputs.pathOf('capture-video'),
      mimeType: live ? 'video/webm' : 'video/mp4',
      sensitivity: 'normal',
    };
    await outputs.writeJson('captures-index', CapturesIndexSchema, { format: 1, mode: live ? 'live' : 'mock', sourceUrl, captures: [entry] });
    return reportedSuccess(live ? 'Página gravada.' : 'Captura simulada gerada sem rede.');
  }
}
