import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PriceNotAvailableError } from '@studio/core/costs';
import { ScenesOutputSchema, ScriptOutputSchema, type ScriptOutput } from '@studio/shared/agents';
import { type TemplateDetails } from '@studio/shared/catalog';
import type { StageExecutionContext, StageExecutionResult, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { newSessionId, resolveInsideRun } from '@studio/shared/run-files';
import { type DeclaredOutput, type StageEstimate, type WaitingCause } from '@studio/shared/run-format';
import { HYPERFRAMES_BACKGROUND_FILE, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { boundTemplate, brandKitSummary } from '../agents/packet-sources';
import { backgroundPlan } from '../composition/hyperframes-background';
import { compositionLengthS, fitStagedCompositionLength } from '../composition/hyperframes-composition-length';
import { recordRenderFinished, recordRenderRefused } from '../composition/hyperframes-events';
import { templateFitsRun, templateVariables, type SceneText } from '../composition/hyperframes-preparation';
import { stageTemplateCopy } from '../composition/hyperframes-template-copy';
import { renderPlan, rendersOnCanvas, templateIdOf, type StagedFile } from '../composition/render-plan.mapper';
import { MediaWriteResultSchema, RenderResultSchema, type HyperframesRenderRequest } from '../process/tool-runner.protocol';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { boundOfKind } from '../shared/catalog-lookup';
import { withScratchDir } from '../shared/scratch-dir';
import { CapturesIndexSchema, NarrationIndexSchema, type NarrationIndex } from '../shared/stage-artifacts';
import { priceForEstimate } from '../shared/stage-estimates';
import { readOptionalStageInput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { hyperframesRefusalText, stageTexts } from '../shared/stage-texts';

const AUDIO_NAME = 'narration.wav';

type BoundTemplate = { ref: string; details: TemplateDetails };

type RenderOutcome = { status: 'ok'; renderSeconds: number } | { status: 'failed'; failure: StageFailure };

/**
 * `composition`: the bound Remotion template rendered by `@ace/video` in the tool runner (render
 * provider live), or a local ffmpeg slate carrying the narration (mock). Renders read only the
 * copies staged in a private serve folder, never the run or the catalog store directly.
 */
export class CompositionExecutor extends BaseStageExecutor {
  readonly stageId = 'composition';
  protected readonly faultProvider = 'render';

  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    const renderSec = context.brief.targetDurationSec;
    const usd = this.isLive('render') ? priceForEstimate(this.dependencies.ledger, { kind: 'render', renderSeconds: renderSec }) : 0;
    return { tokens: 0, ttsChars: 0, renderSec, usd };
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'composition', 'composition.mp4', 'video/mp4')];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const narration = await readOptionalStageInput(context, 'narration-index', NarrationIndexSchema);
    if (narration === null) return this.ownerStop(context, stageTexts.missingInput('narration-index'), stageTexts.missingInputWhatToDo);
    const outcome = this.isLive('render') ? await this.renderTemplate(context, outputs, narration) : await this.renderSlate(context, outputs, narration);
    if (outcome.status === 'failed') return stageFailed(outcome.failure);
    return reportedSuccess(`Composição de ${narration.durationS.toFixed(1)} s renderizada.`);
  }

  private async renderSlate(context: StageExecutionContext, outputs: StageOutputSink, narration: NarrationIndex): Promise<RenderOutcome> {
    context.report({ kind: 'tool', text: 'Gerando composição simulada local (sem Remotion).' });
    const { canvas, fps } = context.recipe.format;
    return withScratchDir(this.dependencies.settings, async (directory): Promise<RenderOutcome> => {
      const output = join(directory, 'composition.mp4');
      const result = await this.dependencies.runner.run(
        {
          command: 'slate-render',
          width: canvas.width,
          height: canvas.height,
          fps,
          durationS: narration.durationS,
          audio: resolveInsideRun(context.runDir, narration.audioPath),
          output,
        },
        MediaWriteResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir] },
      );
      if (result.status === 'failed') return { status: 'failed', failure: toolFailure(result, context) };
      await outputs.adoptFile('composition', output);
      return { status: 'ok', renderSeconds: 0 };
    });
  }

  /** SPEC 0008 section 5.1: the bound template's engine picks the render; `templateIdOf` is Remotion's only. */
  private async renderTemplate(context: StageExecutionContext, outputs: StageOutputSink, narration: NarrationIndex): Promise<RenderOutcome> {
    const template = await boundTemplate(context, this.dependencies.catalog);
    if (template === null) return { status: 'failed', failure: this.ownerFailure(context, stageTexts.templateNotBound, stageTexts.templateNotBoundWhatToDo) };
    switch (template.details.engine) {
      case 'remotion':
        return this.renderRemotion(context, outputs, narration, template);
      case 'hyperframes':
        return this.renderHyperframes(context, outputs, narration, template);
    }
  }

  private async renderRemotion(context: StageExecutionContext, outputs: StageOutputSink, narration: NarrationIndex, template: BoundTemplate): Promise<RenderOutcome> {
    const templateId = templateIdOf(template.details.compositionId);
    const { canvas } = context.recipe.format;
    if (templateId === null || !rendersOnCanvas(templateId, canvas)) {
      return { status: 'failed', failure: this.ownerFailure(context, stageTexts.templateNotRenderable(template.ref), stageTexts.templateNotRenderableWhatToDo) };
    }
    const scenes = await readOptionalStageInput(context, 'scenes', ScenesOutputSchema);
    const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
    if (scenes === null || script === null) {
      return { status: 'failed', failure: this.ownerFailure(context, stageTexts.missingInput(scenes === null ? 'scenes' : 'script'), stageTexts.missingInputWhatToDo) };
    }
    const captures = await readOptionalStageInput(context, 'captures-index', CapturesIndexSchema);
    const pricing = this.renderPrice(context, narration.durationS);
    if (pricing.status === 'refused') return { status: 'failed', failure: pricing.failure };
    context.report({ kind: 'tool', text: `Renderizando o modelo ${template.ref}.` });

    const plan = renderPlan({ runDirPathOf: (path) => resolveInsideRun(context.runDir, path), scenes, script, captures, narration, assets: context.assets });
    const rendered = await withScratchDir(this.dependencies.settings, async (directory): Promise<RenderOutcome> => {
      const serveRoot = join(directory, 'serve');
      await stageFiles(serveRoot, [{ source: resolveInsideRun(context.runDir, narration.audioPath), name: AUDIO_NAME }, ...plan.files]);
      const output = join(directory, 'composition.mp4');
      const result = await this.dependencies.runner.run(
        {
          command: 'render',
          serveRoot,
          template: templateId,
          title: script.title,
          durationS: narration.durationS,
          audioPath: AUDIO_NAME,
          scenes: plan.scenes,
          // Captions are burned by the `captions` stage; rendering them here would show them twice.
          captions: [],
          disclosure: context.brief.language === 'pt-BR' ? 'Voz gerada por IA.' : 'AI-generated voice.',
          output,
          thumbnail: join(directory, 'thumbnail.png'),
        },
        RenderResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir] },
      );
      if (result.status === 'failed') return { status: 'failed', failure: toolFailure(result, context) };
      await outputs.adoptFile('composition', output);
      return { status: 'ok', renderSeconds: result.result.renderSeconds };
    });
    if (rendered.status === 'ok') await this.recordRender(context, rendered.renderSeconds);
    return rendered;
  }

  /**
   * SPEC 0008 section 5.2: the eight pre-start checks in order, each stopping as `needs-person`
   * with nothing spawned, then one sandboxed `hyperframes-render` of the staged copy.
   */
  private async renderHyperframes(context: StageExecutionContext, outputs: StageOutputSink, narration: NarrationIndex, template: BoundTemplate): Promise<RenderOutcome> {
    const { settings, hyperframes, runner } = this.dependencies;
    const subject = { runId: context.runId, stepKey: context.stepKey, templateRef: template.ref };
    const refuse = (reason: HyperframesRefusalReason): RenderOutcome => {
      recordRenderRefused(subject, reason);
      const text = hyperframesRefusalText(reason, template.ref);
      return { status: 'failed', failure: this.ownerFailure(context, text.message, text.whatToDo) };
    };
    const runtime = await hyperframes.renderRuntime(settings);
    if (runtime.status === 'refused') return refuse(runtime.reason);
    const { canvas, fps } = context.recipe.format;
    const misfit = templateFitsRun(template.details, { canvas, fps, narrationS: narration.durationS });
    if (misfit !== null) return refuse(misfit);
    const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
    if (script === null) return { status: 'failed', failure: this.ownerFailure(context, stageTexts.missingInput('script'), stageTexts.missingInputWhatToDo) };
    const brandKit = await brandKitSummary(context, this.dependencies.catalog);
    const variables = templateVariables({
      details: template.details,
      recipeValues: context.params['templateVariables'],
      script,
      disclosure: disclosureLine(context),
      narrationS: narration.durationS,
      accent: brandKit?.palette[0]?.hex ?? null,
      scenes: sceneTexts(script, narration),
    });
    if (variables.status === 'refused') return refuse(variables.reason);
    const pricing = this.renderPrice(context, narration.durationS);
    if (pricing.status === 'refused') return { status: 'failed', failure: pricing.failure };
    const bound = boundOfKind(context, 'template', 'template');
    if (bound === null) return { status: 'failed', failure: this.ownerFailure(context, stageTexts.templateNotBound, stageTexts.templateNotBoundWhatToDo) };

    const variableCount = Object.keys(variables.value).length;
    const rendered = await withScratchDir(settings, async (directory): Promise<RenderOutcome> => {
      const templateDir = join(directory, 'template');
      const staged = await stageTemplateCopy(bound.asset, templateDir, hyperframes, context.signal);
      if (staged.status === 'refused') return refuse('template-not-self-contained');
      const lengthS = compositionLengthS(narration.durationS);
      await fitStagedCompositionLength(templateDir, lengthS);
      const background = await this.stageBackground(context, narration, lengthS, { templateDir, mediaDir: join(directory, 'media-src') });
      context.report({ kind: 'tool', text: stageTexts.hyperframesRendering(template.ref) });
      const output = join(directory, 'composition.mp4');
      const result = await runner.run(
        {
          command: 'hyperframes-render',
          templateDir,
          variables: variables.value,
          width: template.details.canvas.width,
          height: template.details.canvas.height,
          fps: template.details.fps,
          durationS: narration.durationS,
          audio: resolveInsideRun(context.runDir, narration.audioPath),
          output,
          scratchDir: directory,
          ...(background === null ? {} : { background }),
          runtime: runtime.runtime,
        },
        RenderResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir] },
      );
      if (result.status === 'failed') {
        recordRenderFinished(subject, { ok: false, renderSeconds: null, variableCount });
        return { status: 'failed', failure: toolFailure(result, context) };
      }
      await outputs.adoptFile('composition', output);
      recordRenderFinished(subject, { ok: true, renderSeconds: result.result.renderSeconds, variableCount });
      return { status: 'ok', renderSeconds: result.result.renderSeconds };
    });
    if (rendered.status === 'ok') await this.recordRender(context, rendered.renderSeconds);
    return rendered;
  }

  /**
   * The picture behind the text, for a template that references `HYPERFRAMES_BACKGROUND_FILE`:
   * each directed scene's capture or bound image, copied into the private scratch folder (the
   * runner reads nothing else) and cut by the runner into one clip. Null for a text-only template.
   */
  private async stageBackground(
    context: StageExecutionContext,
    narration: NarrationIndex,
    lengthS: number,
    folders: { templateDir: string; mediaDir: string },
  ): Promise<HyperframesRenderRequest['background'] | null> {
    const index = await readFile(join(folders.templateDir, 'index.html'), 'utf8');
    if (!index.includes(HYPERFRAMES_BACKGROUND_FILE)) return null;
    const scenes = await readOptionalStageInput(context, 'scenes', ScenesOutputSchema);
    const captures = await readOptionalStageInput(context, 'captures-index', CapturesIndexSchema);
    const plan = backgroundPlan({ runDirPathOf: (path) => resolveInsideRun(context.runDir, path), scenes, captures, narration, assets: context.assets });
    await stageFiles(folders.mediaDir, plan.files);
    const shown = plan.segments.filter((segment) => segment.name !== null).length;
    context.report({ kind: 'tool', text: stageTexts.hyperframesBackground(shown, plan.segments.length) });
    return {
      file: HYPERFRAMES_BACKGROUND_FILE,
      lengthS,
      segments: plan.segments.map((segment) => ({
        kind: segment.kind,
        source: segment.name === null ? null : join(folders.mediaDir, segment.name),
        durationS: segment.durationS,
      })),
    };
  }

  /** The render is priced before it runs; a missing price stops before any work (R1-11). */
  private renderPrice(context: StageExecutionContext, durationS: number): { status: 'priced' } | { status: 'refused'; failure: StageFailure } {
    try {
      this.dependencies.ledger.priceUsd({ kind: 'render', renderSeconds: durationS });
      return { status: 'priced' };
    } catch (error) {
      if (!(error instanceof PriceNotAvailableError)) throw error;
      return { status: 'refused', failure: this.ownerFailure(context, stageTexts.pricingUnavailable('render'), stageTexts.pricingUnavailableWhatToDo) };
    }
  }

  private async recordRender(context: StageExecutionContext, renderSeconds: number): Promise<void> {
    await this.dependencies.ledger.record({
      runId: context.runId,
      runDir: context.runDir,
      session: {
        kind: 'render',
        sessionId: newSessionId(),
        stepKey: context.stepKey,
        provider: 'render',
        renderSeconds,
        usd: this.dependencies.ledger.priceUsd({ kind: 'render', renderSeconds }),
        at: this.dependencies.clock.now().toISOString(),
      },
    });
  }

  private ownerFailure(context: StageExecutionContext, message: string, whatToDo: string): StageFailure {
    const cause: WaitingCause = { kind: 'needs-person', stepKey: context.stepKey };
    return needsPerson(cause, message, whatToDo);
  }

  private ownerStop(context: StageExecutionContext, message: string, whatToDo: string): StageExecutionResult {
    return stageFailed(this.ownerFailure(context, message, whatToDo));
  }
}

/** Each narrated scene's on-screen text with the second its narration starts; scenes with no text are left out. */
function sceneTexts(script: ScriptOutput, narration: NarrationIndex): SceneText[] {
  return narration.sceneTimings.flatMap((timing) => {
    const text = script.scenes.find((scene) => scene.sceneId === timing.sceneId)?.onScreenText ?? '';
    return text === '' ? [] : [{ text, startS: timing.startS }];
  });
}

/** The AI-voice disclosure line of the Remotion render, as the `disclosure` template variable. */
function disclosureLine(context: StageExecutionContext): string {
  return context.brief.language === 'pt-BR' ? 'Voz gerada por IA.' : 'AI-generated voice.';
}

/** The renderer's static server sees only these copies (toolbox `startStaticServer` serves one folder). */
async function stageFiles(serveRoot: string, files: readonly StagedFile[]): Promise<void> {
  await mkdir(serveRoot, { recursive: true });
  for (const file of files) await copyFile(file.source, join(serveRoot, file.name));
}
