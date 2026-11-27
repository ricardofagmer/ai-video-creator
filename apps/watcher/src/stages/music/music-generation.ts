import { writeFile } from 'node:fs/promises';
import { encodeWavPcm16Mono } from '@ace/toolbox/dist/encoding/wav-encoder';
import {
  EgressLog,
  ProviderCredentialMissingError,
  ProviderNotLiveError,
  ProviderWithoutCredentialError,
  toStageFailure,
} from '@studio/core/providers';
import { type Secret } from '@studio/core/secrets';
import { videoSpec } from '@studio/shared/ace';
import { type ScriptOutput } from '@studio/shared/agents';
import { type MusicCategory } from '@studio/shared/catalog';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { commandSignal } from '../process/spawn-bounded';
import { type StageDependencies } from '../shared/stage-dependencies';
import { commandTimeoutMs, needsPerson } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { composeWithElevenLabs, MUSIC_LENGTH_LIMITS_MS } from './elevenlabs-music.client';
import { priceMusicGeneration } from './music-generation-cost';

/**
 * Who would generate a track: live ElevenLabs; the in-process mock in a fully simulated run
 * (Claude and ElevenLabs both mock, no paid call); otherwise nobody, because a real run with
 * ElevenLabs switched off must not ship a test tone as its music.
 */
type MusicGenerator = 'elevenlabs' | 'mock' | 'not-connected';

type GenerationOutcome = { status: 'ok'; engine: 'mock' | 'elevenlabs' } | { status: 'refused'; failure: StageFailure };

interface GenerationRequest {
  context: StageExecutionContext;
  dependencies: StageDependencies;
  categories: readonly MusicCategory[];
  script: ScriptOutput | null;
  lengthMs: number;
}

const PROMPT_TEXT_MAX_CHARS = 200;
const MOCK_TONE_HZ = 110;
// About -36 dBFS: audible in a mix check, never mistaken for music by a listener.
const MOCK_TONE_AMPLITUDE = Math.round(32767 * 10 ** (-36 / 20));

export function musicGenerator(dependencies: StageDependencies): MusicGenerator {
  const modes = dependencies.providerModes;
  if (modes.isLive('elevenlabs')) return 'elevenlabs';
  return modes.isLive('claude') ? 'not-connected' : 'mock';
}

/** The video length clamped to what the provider generates; `music-bed` loops a shorter track. */
export function generationLengthMs(videoMs: number): number {
  return Math.round(Math.min(MUSIC_LENGTH_LIMITS_MS.max, Math.max(MUSIC_LENGTH_LIMITS_MS.min, videoMs)));
}

/** Writes the generated track to `target` (a scratch path outside the run). */
export async function generateMusicTrack(request: GenerationRequest, target: string): Promise<GenerationOutcome> {
  const { context, dependencies } = request;
  const ownerStop = (message: string, whatToDo: string): GenerationOutcome => ({
    status: 'refused',
    failure: needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, whatToDo),
  });
  switch (musicGenerator(dependencies)) {
    case 'not-connected':
      return ownerStop(stageTexts.musicGenerationNotConnected, stageTexts.musicAutoNoMatchWhatToDo);
    case 'mock':
      await writeFile(target, mockTone(request.lengthMs));
      return { status: 'ok', engine: 'mock' };
    case 'elevenlabs':
      return generateLive(request, target, ownerStop);
  }
}

async function generateLive(
  request: GenerationRequest,
  target: string,
  ownerStop: (message: string, whatToDo: string) => GenerationOutcome,
): Promise<GenerationOutcome> {
  const { context, dependencies } = request;
  // Priced before the credential, egress and call: unpriced spend never leaves the machine.
  const price = priceMusicGeneration(dependencies.ledger, request.lengthMs);
  if (price.status === 'unpriced') return ownerStop(stageTexts.musicGenerationUnpriced, stageTexts.musicGenerationUnpricedWhatToDo);
  const credential = elevenLabsCredential(dependencies);
  if (credential === null) return ownerStop(stageTexts.musicGenerationNotConnected, stageTexts.musicAutoNoMatchWhatToDo);

  const prompt = musicPrompt(request);
  const egress = await EgressLog.open(context.runDir);
  await egress.record({
    provider: 'elevenlabs',
    what: 'prompt-text',
    stepKey: context.stepKey,
    sessionId: null,
    at: dependencies.clock.now(),
    measure: { unit: 'characters', amount: prompt.length },
  });
  const composed = await composeWithElevenLabs({
    credential,
    prompt,
    lengthMs: request.lengthMs,
    instrumental: !request.categories.includes('voices'),
    signal: commandSignal(context.signal, commandTimeoutMs(context)),
    now: () => dependencies.clock.now(),
  });
  context.signal.throwIfAborted();
  if (composed.status === 'failed') {
    // A refused prompt or a non-audio answer would be refused again: a person decides, no retry.
    if (composed.failure.class === 'fatal') return ownerStop(stageTexts.musicGenerationRefused, stageTexts.musicAutoNoMatchWhatToDo);
    return { status: 'refused', failure: toStageFailure(composed.failure) };
  }
  await writeFile(target, composed.audio);
  await price.record(context, dependencies.clock.now());
  return { status: 'ok', engine: 'elevenlabs' };
}

function elevenLabsCredential(dependencies: StageDependencies): Secret | null {
  try {
    return dependencies.providerModes.credentialFor('elevenlabs');
  } catch (error) {
    if (error instanceof ProviderCredentialMissingError || error instanceof ProviderNotLiveError || error instanceof ProviderWithoutCredentialError) {
      return null;
    }
    throw error;
  }
}

/**
 * English prompt (the provider asks for English styles): the asked categories, the narration it
 * sits under, and the script's title and hook for tone. Script text is flattened to one line and
 * clipped; it is data for the mood, never an instruction the studio relies on.
 */
function musicPrompt(request: Pick<GenerationRequest, 'categories' | 'script' | 'lengthMs'>): string {
  const styles = request.categories.length === 0 ? 'any mood that fits the video' : request.categories.map(categoryLabel).join(', ');
  const vocals = request.categories.includes('voices') ? 'Soft vocals are welcome.' : 'Instrumental only, no vocals.';
  const parts = [
    `Background music for a ${Math.round(request.lengthMs / 1000)}-second video.`,
    `Style and mood: ${styles}.`,
    'It plays under spoken narration, so keep it steady and unobtrusive.',
    vocals,
  ];
  if (request.script !== null) {
    parts.push(`Video title, for tone: ${oneLine(request.script.title)}.`, `Opening line, for tone: ${oneLine(request.script.hook)}.`);
  }
  return parts.join(' ');
}

function categoryLabel(category: MusicCategory): string {
  return category === 'lo-fi' ? 'lo-fi' : category.replaceAll('-', ' ');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, PROMPT_TEXT_MAX_CHARS);
}

function mockTone(lengthMs: number): Buffer {
  const sampleRate = videoSpec.audioSampleRate;
  const samples = new Int16Array(Math.ceil((lengthMs / 1000) * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(MOCK_TONE_AMPLITUDE * Math.sin((2 * Math.PI * MOCK_TONE_HZ * index) / sampleRate));
  }
  return encodeWavPcm16Mono(samples, sampleRate);
}
