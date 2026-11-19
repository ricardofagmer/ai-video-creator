import { join } from 'node:path';
import { PriceNotAvailableError } from '@studio/core/costs';
import { ScriptOutputSchema } from '@studio/shared/agents';
import type { StageExecutionContext, StageExecutionResult, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { type DeclaredOutput, type StageEstimate, type WaitingCause } from '@studio/shared/run-format';
import { NarrationAssembleResultSchema, type NarrationAssembleResult } from '../process/tool-runner.protocol';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { withScratchDir } from '../shared/scratch-dir';
import { NarrationIndexSchema } from '../shared/stage-artifacts';
import { narrationCharacters, priceForEstimate } from '../shared/stage-estimates';
import { readOptionalStageInput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { mediaToolPaths } from '../shared/stage-settings';
import { stageTexts } from '../shared/stage-texts';
import { planVoice, speakLines, type NarrationLine, type ReadyVoice, type TtsProvider } from '../voice/narration-voice';

type AssembleOutcome = { status: 'ok'; result: NarrationAssembleResult } | { status: 'failed'; failure: StageFailure };

/**
 * `narration`: speaks the approved script, one clip per scene, then joins the clips into one WAV
 * with scene timings and estimated word timings. Voices: in-process mock, ElevenLabs (live,
 * fails closed while unpriced, R1-11) or the C11 local cloned voice (biometric, by path only,
 * never retried automatically). The tts cost session is recorded once the speech exists.
 */
export class NarrationExecutor extends BaseStageExecutor {
  readonly stageId = 'narration';
  /** The mock fault of the paid voice provider; the local voice has no automatic retry to fault. */
  protected readonly faultProvider = 'elevenlabs';

  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    const ttsChars = narrationCharacters(context);
    const provider: TtsProvider | null = this.isLive('elevenlabs') ? 'elevenlabs' : this.isLive('local-voice') ? 'local-voice' : null;
    const usd = provider === null ? 0 : priceForEstimate(this.dependencies.ledger, { kind: 'tts', provider, characters: ttsChars });
    return { tokens: 0, ttsChars, renderSec: 0, usd };
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [
      stageOutput(context.stage, 'narration-index', 'narration.json', 'application/json'),
      stageOutput(context.stage, 'narration-audio', 'narration.wav', 'audio/wav'),
    ];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const ownerStop = (message: string, whatToDo: string): StageExecutionResult =>
      stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, whatToDo));
    const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
    if (script === null) return ownerStop(stageTexts.missingInput('script'), stageTexts.missingInputWhatToDo);
    const lines: NarrationLine[] = script.scenes
      // The runner contract bounds ids at 64 and lines at 10 000 characters (C3 id limit).
      .map((scene) => ({ sceneId: scene.sceneId.slice(0, 64), text: scene.narration.trim().slice(0, 10_000) }))
      .filter((line) => line.text.length > 0);
    if (lines.length === 0) return ownerStop(stageTexts.narrationEmpty, stageTexts.narrationEmptyWhatToDo);

    const voice = await planVoice(context, this.dependencies);
    if (voice.status === 'refused') return stageFailed(voice.failure);
    const characters = lines.reduce((total, line) => total + line.text.length, 0);
    const price = this.priceSpeech(context, voice, characters);
    if (price.status === 'refused') return stageFailed(price.failure);
    context.report({ kind: 'tool', text: `Narrando ${lines.length} cena(s) (${voice.engine}).` });

    const assembled = await withScratchDir(this.dependencies.settings, async (directory): Promise<AssembleOutcome> => {
      const spoken = await speakLines({ context, dependencies: this.dependencies, voice, lines }, directory);
      if (spoken.status === 'failed') return spoken;
      await this.recordSpeech(context, { provider: voice.provider, characters, usd: price.usd });
      const output = join(directory, 'narration.wav');
      const result = await this.dependencies.runner.run(
        { command: 'narration-assemble', tools: mediaToolPaths(this.dependencies.settings), clips: spoken.clips, output },
        NarrationAssembleResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context) },
      );
      if (result.status === 'failed') return { status: 'failed', failure: toolFailure(result, context) };
      await outputs.adoptFile('narration-audio', output);
      return { status: 'ok', result: result.result };
    });
    if (assembled.status === 'failed') return stageFailed(assembled.failure);

    const { durationS, sceneTimings, words } = assembled.result;
    await outputs.writeJson('narration-index', NarrationIndexSchema, {
      format: 1,
      engine: voice.engine,
      durationS,
      audioPath: outputs.pathOf('narration-audio'),
      sceneTimings,
      words,
      characters,
    });
    return reportedSuccess(`Narração de ${durationS.toFixed(1)} s gerada (${voice.engine}).`);
  }

  /**
   * Prices the speech before any call: a live voice with no price in the table stops here, before
   * egress and spend (R1-11 fails closed). Mock speech prices at zero.
   */
  private priceSpeech(context: StageExecutionContext, voice: ReadyVoice, characters: number): { status: 'priced'; usd: number } | { status: 'refused'; failure: StageFailure } {
    try {
      return { status: 'priced', usd: this.dependencies.ledger.priceUsd({ kind: 'tts', provider: voice.provider, characters }) };
    } catch (error) {
      if (!(error instanceof PriceNotAvailableError)) throw error;
      const cause: WaitingCause = { kind: 'needs-person', stepKey: context.stepKey };
      const failure =
        voice.provider === 'elevenlabs'
          ? needsPerson(cause, stageTexts.elevenLabsUnpriced, stageTexts.elevenLabsUnpricedWhatToDo)
          : needsPerson(cause, stageTexts.pricingUnavailable(voice.provider), stageTexts.pricingUnavailableWhatToDo);
      return { status: 'refused', failure };
    }
  }

  private async recordSpeech(context: StageExecutionContext, speech: { provider: TtsProvider; characters: number; usd: number }): Promise<void> {
    await this.dependencies.ledger.record({
      runId: context.runId,
      runDir: context.runDir,
      session: {
        kind: 'tts',
        sessionId: newSessionId(),
        stepKey: context.stepKey,
        provider: speech.provider,
        characters: speech.characters,
        usd: speech.usd,
        at: this.dependencies.clock.now().toISOString(),
      },
    });
  }
}
