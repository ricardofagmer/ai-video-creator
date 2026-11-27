import { join } from 'node:path';
import { ScenesOutputSchema, ScriptOutputSchema } from '@studio/shared/agents';
import { type MusicCategory } from '@studio/shared/catalog';
import type { StageExecutionContext, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type DeclaredOutput } from '@studio/shared/run-format';
import { withScratchDir } from '../shared/scratch-dir';
import { MusicPickRecordSchema, NarrationIndexSchema, type MusicPickRecord } from '../shared/stage-artifacts';
import { type StageDependencies } from '../shared/stage-dependencies';
import { readOptionalStageInput, readOwnOutput, sha256OfFile, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { stageTexts } from '../shared/stage-texts';
import { listMusicOptions } from './music-candidates';
import { generateMusicTrack, generationLengthMs, musicGenerator } from './music-generation';
import { chooseOption, resolveCatalogTrack } from './music-pick';

const MUSIC_PICK_OUTPUT = 'music-pick';
const MUSIC_TRACK_OUTPUT = 'music-track';

type AutoTrack =
  | { status: 'ready'; absolutePath: string; record: MusicPickRecord; summary: string }
  | { status: 'refused'; failure: StageFailure };

interface AutoRequest {
  context: StageExecutionContext;
  dependencies: StageDependencies;
  outputs: StageOutputSink;
  categories: readonly MusicCategory[];
}

/**
 * Auto-mode outputs besides the mixed video: the pick sidecar always, and the generated track
 * only when no catalog track fits. Live ElevenLabs answers MP3; the mock writes a WAV tone.
 */
export function autoMusicOutputs(context: StagePlanningContext, dependencies: StageDependencies): DeclaredOutput[] {
  const track =
    musicGenerator(dependencies) === 'elevenlabs'
      ? stageOutput(context.stage, MUSIC_TRACK_OUTPUT, 'music-track.mp3', 'audio/mpeg')
      : stageOutput(context.stage, MUSIC_TRACK_OUTPUT, 'music-track.wav', 'audio/wav');
  return [stageOutput(context.stage, MUSIC_PICK_OUTPUT, 'music-pick.json', 'application/json'), { ...track, optional: true }];
}

/**
 * The track auto mode mixes (docs/specs/2026-11-25-ai-music-choice-design.md section 3): the pick
 * this run already recorded when it still resolves, else a catalog option, else a generated track.
 * The pick is written before mixing so the stage report and a rerun both name it.
 */
export async function autoMusicTrack(request: AutoRequest): Promise<AutoTrack> {
  const reused = await reuseRecordedPick(request);
  if (reused !== null) return reused;
  const track = await freshTrack(request);
  if (track.status === 'ready') await request.outputs.writeJson(MUSIC_PICK_OUTPUT, MusicPickRecordSchema, track.record);
  return track;
}

async function freshTrack(request: AutoRequest): Promise<AutoTrack> {
  const { context, dependencies } = request;
  const [first, ...rest] = await listMusicOptions(context, dependencies.catalog, request.categories);
  if (first === undefined) return generatedTrack(request);
  const scenes = await readOptionalStageInput(context, 'scenes', ScenesOutputSchema);
  const { option, reason } = chooseOption([first, ...rest], scenes?.musicPick);
  const { ref } = option.candidate;
  const resolved = await resolveCatalogTrack(context, dependencies.assetResolver, { ref, contentHash: option.contentHash });
  if (resolved.status === 'refused') return resolved;
  const record: MusicPickRecord = { format: 1, source: 'catalog', ref, contentHash: option.contentHash, reason };
  return { status: 'ready', absolutePath: resolved.absolutePath, record, summary: stageTexts.musicPickedFromCatalog(ref, reason) };
}

async function generatedTrack(request: AutoRequest): Promise<AutoTrack> {
  const { context, dependencies, outputs } = request;
  const script = await readOptionalStageInput(context, 'script', ScriptOutputSchema);
  const lengthMs = generationLengthMs(await videoLengthMs(context));
  context.report({ kind: 'tool', text: stageTexts.musicGenerating(lengthMs / 1000) });
  const outcome = await withScratchDir(dependencies.settings, async (directory) => {
    const scratch = join(directory, 'music-track');
    const generated = await generateMusicTrack({ context, dependencies, categories: request.categories, script, lengthMs }, scratch);
    if (generated.status === 'refused') return generated;
    const contentHash = await sha256OfFile(scratch);
    await outputs.adoptFile(MUSIC_TRACK_OUTPUT, scratch);
    return { ...generated, contentHash };
  });
  if (outcome.status === 'refused') return outcome;
  const record: MusicPickRecord = {
    format: 1,
    source: 'generated',
    ref: 'generated',
    contentHash: outcome.contentHash,
    reason: stageTexts.musicReasonGenerated(request.categories),
    engine: outcome.engine,
    path: outputs.pathOf(MUSIC_TRACK_OUTPUT),
    lengthMs,
  };
  const summary = stageTexts.musicGeneratedTrack(lengthMs / 1000, outcome.engine);
  return { status: 'ready', absolutePath: outputs.absolutePathOf(MUSIC_TRACK_OUTPUT), record, summary };
}

/**
 * A rerun of this step reuses the recorded pick, so it neither changes song nor pays for a second
 * generation, as long as the bytes still hash to what was recorded; otherwise it picks afresh.
 */
async function reuseRecordedPick(request: AutoRequest): Promise<AutoTrack | null> {
  const { context, dependencies, outputs } = request;
  const record = await readOwnOutput(context, MUSIC_PICK_OUTPUT, MusicPickRecordSchema);
  if (record === null) return null;
  if (record.source === 'catalog') {
    const resolved = await resolveCatalogTrack(context, dependencies.assetResolver, record);
    if (resolved.status === 'refused') return null;
    return { status: 'ready', absolutePath: resolved.absolutePath, record, summary: stageTexts.musicPickReused(record.ref) };
  }
  if (record.path !== outputs.pathOf(MUSIC_TRACK_OUTPUT)) return null;
  const absolutePath = resolveInsideRun(context.runDir, record.path);
  if ((await hashIfPresent(absolutePath)) !== record.contentHash) return null;
  return { status: 'ready', absolutePath, record, summary: stageTexts.musicPickReused(record.ref) };
}

async function hashIfPresent(absolutePath: string): Promise<string | null> {
  try {
    return await sha256OfFile(absolutePath);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** The narration's measured length when the run has one, else the brief's target. */
async function videoLengthMs(context: StageExecutionContext): Promise<number> {
  const narration = await readOptionalStageInput(context, 'narration-index', NarrationIndexSchema);
  return narration === null ? context.brief.targetDurationSec * 1000 : narration.durationS * 1000;
}
