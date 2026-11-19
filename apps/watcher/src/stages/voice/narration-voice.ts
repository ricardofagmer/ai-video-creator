import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MockVoiceProvider } from '@ace/toolbox/dist/providers/voice/mock-voice';
import { EgressLog, toStageFailure } from '@studio/core/providers';
import { AbsolutePathSchema, type AbsolutePath } from '@studio/shared/catalog';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { speakWithLocalVoice } from '../process/local-voice.process';
import { commandSignal } from '../process/spawn-bounded';
import { boundAssets } from '../shared/catalog-lookup';
import { type StageDependencies } from '../shared/stage-dependencies';
import { commandTimeoutMs, needsPerson } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { speakWithElevenLabs } from './elevenlabs-tts.client';

/** Catalog variable name the seed's `elevenlabs-voice` row gives as its `modelIdRef`. */
const ELEVENLABS_VOICE_VARIABLE = 'ELEVENLABS_VOICE_ID';

export type TtsProvider = 'elevenlabs' | 'local-voice';

export type VoicePlan =
  | { status: 'ready'; engine: 'mock'; provider: TtsProvider }
  | { status: 'ready'; engine: 'elevenlabs'; provider: 'elevenlabs'; voiceId: string; modelId: string }
  | { status: 'ready'; engine: 'local-voice'; provider: 'local-voice'; ref: string }
  | { status: 'refused'; failure: StageFailure };

export type ReadyVoice = Extract<VoicePlan, { status: 'ready' }>;

export interface NarrationLine {
  sceneId: string;
  text: string;
}

export interface NarrationClip extends NarrationLine {
  path: string;
}

export type ClipsOutcome = { status: 'ok'; clips: NarrationClip[] } | { status: 'failed'; failure: StageFailure };

/**
 * Picks the narration voice from the recipe bindings: a bound biometric voice clone means the C11
 * local voice, a bound ElevenLabs provider model means ElevenLabs. Each runs live only when its
 * provider mode is live; otherwise the in-process mock voice speaks (no spawn, no network).
 */
export async function planVoice(context: StageExecutionContext, dependencies: StageDependencies): Promise<VoicePlan> {
  const voices = boundAssets(context).filter((bound) => bound.asset.kind === 'ai-model');
  const clone = voices.find((bound) => bound.asset.sensitivity === 'biometric');
  if (clone !== undefined) {
    return dependencies.providerModes.isLive('local-voice')
      ? { status: 'ready', engine: 'local-voice', provider: 'local-voice', ref: clone.asset.ref }
      : { status: 'ready', engine: 'mock', provider: 'local-voice' };
  }
  for (const bound of voices) {
    const version = await dependencies.catalog.versionOfKind(bound.asset, 'ai-model');
    if (version === null || version.details.provider !== 'elevenlabs') continue;
    if (!dependencies.providerModes.isLive('elevenlabs')) return { status: 'ready', engine: 'mock', provider: 'elevenlabs' };
    const reference = version.details.modelIdRef;
    const { voiceId, modelId } = dependencies.settings.elevenLabs;
    if (voiceId === null || reference.type !== 'env' || reference.name !== ELEVENLABS_VOICE_VARIABLE) {
      return refused(context, stageTexts.elevenLabsVoiceMissing, stageTexts.elevenLabsVoiceMissingWhatToDo);
    }
    return { status: 'ready', engine: 'elevenlabs', provider: 'elevenlabs', voiceId, modelId };
  }
  const anyLive = dependencies.providerModes.isLive('elevenlabs') || dependencies.providerModes.isLive('local-voice');
  return anyLive ? refused(context, stageTexts.voiceNotBound, stageTexts.voiceNotBoundWhatToDo) : { status: 'ready', engine: 'mock', provider: 'local-voice' };
}

/** Speaks every line into `directory` (a scratch folder outside the run), one clip per scene. */
export async function speakLines(
  request: { context: StageExecutionContext; dependencies: StageDependencies; voice: ReadyVoice; lines: readonly NarrationLine[] },
  directory: string,
): Promise<ClipsOutcome> {
  const { context, dependencies, voice, lines } = request;
  switch (voice.engine) {
    case 'mock':
      return speakMock(lines, directory);
    case 'elevenlabs':
      return speakElevenLabs({ context, dependencies, voice, lines }, directory);
    case 'local-voice':
      return speakLocal({ context, dependencies, voice, lines }, directory);
  }
}

function clipPath(directory: string, index: number, extension: 'wav' | 'mp3'): string {
  return join(directory, `line-${String(index + 1).padStart(3, '0')}.${extension}`);
}

async function speakMock(lines: readonly NarrationLine[], directory: string): Promise<ClipsOutcome> {
  const voice = new MockVoiceProvider();
  const clips: NarrationClip[] = [];
  for (const [index, line] of lines.entries()) {
    const spoken = await voice.synthesize({ text: line.text });
    const path = clipPath(directory, index, 'wav');
    await writeFile(path, spoken.audio);
    clips.push({ ...line, path });
  }
  return { status: 'ok', clips };
}

async function speakElevenLabs(
  request: { context: StageExecutionContext; dependencies: StageDependencies; voice: Extract<ReadyVoice, { engine: 'elevenlabs' }>; lines: readonly NarrationLine[] },
  directory: string,
): Promise<ClipsOutcome> {
  const { context, dependencies, voice, lines } = request;
  const egress = await EgressLog.open(context.runDir);
  const credential = dependencies.providerModes.credentialFor('elevenlabs');
  const signal = commandSignal(context.signal, commandTimeoutMs(context));
  const clips: NarrationClip[] = [];
  for (const [index, line] of lines.entries()) {
    context.signal.throwIfAborted();
    const at = dependencies.clock.now();
    await egress.record({ provider: 'elevenlabs', what: 'tts-text', stepKey: context.stepKey, sessionId: null, at, measure: { unit: 'characters', amount: line.text.length } });
    const spoken = await speakWithElevenLabs({ credential, voiceId: voice.voiceId, modelId: voice.modelId, text: line.text, signal, now: () => dependencies.clock.now() });
    context.signal.throwIfAborted();
    if (spoken.status === 'failed') return { status: 'failed', failure: toStageFailure(spoken.failure) };
    const path = clipPath(directory, index, 'mp3');
    await writeFile(path, spoken.audio);
    clips.push({ ...line, path });
  }
  return { status: 'ok', clips };
}

type RegisteredVoicePath = { status: 'resolved'; path: AbsolutePath } | { status: 'unresolved' };

/**
 * The registered reference path of the bound biometric voice (SPEC 0002 rev 4, section 13.7):
 * looked up by ref among the assets the catalog resolver (`AssetResolverPort`) resolved from their
 * catalog rows for this step. Only the string is checked, never the file: a biometric asset must
 * be stored by reference with an absolute path, otherwise it does not resolve.
 */
function registeredVoicePath(context: StageExecutionContext, ref: string): RegisteredVoicePath {
  const asset = context.assets.find((candidate) => candidate.ref === ref);
  if (asset === undefined || asset.sensitivity !== 'biometric' || asset.storage !== 'reference') return { status: 'unresolved' };
  const checked = AbsolutePathSchema.safeParse(asset.absolutePath);
  return checked.success ? { status: 'resolved', path: checked.data } : { status: 'unresolved' };
}

/**
 * C11 local voice. The cloned voice is biometric: any failure goes to the owner and is never
 * retried automatically, and the message names the asset by ref only, never by path. The resolved
 * reference path is forwarded as the job's `voice` string (A27) and goes nowhere else: no log,
 * event, activity text, egress entry, run file, error message or child-process argument.
 */
async function speakLocal(
  request: { context: StageExecutionContext; dependencies: StageDependencies; voice: Extract<ReadyVoice, { engine: 'local-voice' }>; lines: readonly NarrationLine[] },
  directory: string,
): Promise<ClipsOutcome> {
  const { context, dependencies, voice, lines } = request;
  const biometricStop = (message: string, whatToDo: string = stageTexts.biometricWhatToDo): ClipsOutcome => ({
    status: 'failed',
    failure: needsPerson({ kind: 'biometric-asset', ref: voice.ref }, message, whatToDo),
  });
  const voicePath = registeredVoicePath(context, voice.ref);
  if (voicePath.status === 'unresolved') {
    return biometricStop(stageTexts.localVoiceReferenceUnresolved(voice.ref), stageTexts.localVoiceReferenceUnresolvedWhatToDo);
  }
  const characters = lines.reduce((total, line) => total + line.text.length, 0);
  const egress = await EgressLog.open(context.runDir);
  await egress.record({ provider: 'local-voice', what: 'tts-text', stepKey: context.stepKey, sessionId: null, at: dependencies.clock.now(), measure: { unit: 'characters', amount: characters } });
  const outcome = await speakWithLocalVoice(dependencies.settings, {
    language: context.brief.language === 'pt-BR' ? 'pt' : 'en',
    lines,
    voice: voicePath.path,
    signal: context.signal,
    timeoutMs: commandTimeoutMs(context),
  });
  if (outcome.status === 'not-configured') return biometricStop(stageTexts.localVoiceNotConfigured);
  if (outcome.status === 'failed') return biometricStop(stageTexts.localVoiceFailed(outcome.reason));
  const clips: NarrationClip[] = [];
  for (const [index, clip] of outcome.clips.entries()) {
    const path = clipPath(directory, index, 'wav');
    await writeFile(path, clip.audio);
    clips.push({ sceneId: clip.sceneId, text: clip.text, path });
  }
  return { status: 'ok', clips };
}

function refused(context: StageExecutionContext, message: string, whatToDo: string): VoicePlan {
  return { status: 'refused', failure: needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, whatToDo) };
}
