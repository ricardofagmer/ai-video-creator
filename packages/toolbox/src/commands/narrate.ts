import { join } from 'node:path';
import {
  BlockedError,
  NarrationManifestSchema,
  ScriptManifestSchema,
  runFiles,
  type NarrationManifest,
} from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { computeSceneTimings } from '../narration/scene-timings';
import { createVoiceProvider } from '../providers/voice/voice-provider';
import { appendUsage, assertWithinBudget } from '../run/costs';
import { hashManifest } from '../run/hashing';
import { nextStepFor } from '../run/next-steps';
import { assertStageReady, assertUpstreamUnchanged } from '../run/preconditions';
import { mockNarrationAudioFile } from '../run/run-paths';
import { readManifest, writeFileAtomic, writeJsonAtomic } from '../run/run-store';
import { applyEvent } from '../run/state';

/** Spec §3: narration outside this window blocks (QA later requires 70-90 s of video). */
// The render adds a 1 s hold, and QA needs at least 70 s of video.
const MIN_NARRATION_S = 69;
const MAX_NARRATION_S = 90;

/** Synthesises the narration, derives word and scene timings, writes narration.json. */
export async function narrateCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  assertStageReady(run, 'narrate');
  await assertUpstreamUnchanged(runDir, run, 'narrate');
  const script = await readManifest(runDir, runFiles.script, ScriptManifestSchema);
  const voice = createVoiceProvider(context.env, (message) => context.log(message));

  context.beginStage('narrate');
  if (voice.mode === 'live') {
    assertWithinBudget(run, {
      additionalUsd: script.narration.length * voice.usdPerCharacter,
      maxUsd: context.env.maxCostPerVideoUsd,
    });
  }
  context.log(`synthesising ${script.wordCount} words with the ${voice.mode} voice provider (${voice.engine})`);
  const result = await voice.provider.synthesize({ text: script.narration });

  // Credits are spent at this point: persist the cost before any check can block the run.
  const withCost = await context.commit(runDir, appendUsage(run, 'narrate', result.usage));
  const audioKey = result.mimeType === 'audio/mpeg' ? runFiles.narrationAudio : mockNarrationAudioFile;
  await writeFileAtomic(join(runDir, audioKey), result.audio);
  context.log(`wrote ${audioKey} (${result.durationS.toFixed(2)} s)`);

  if (result.durationS < MIN_NARRATION_S || result.durationS > MAX_NARRATION_S) {
    throw new BlockedError(
      `narration lasts ${result.durationS.toFixed(2)} s; it must be ${MIN_NARRATION_S}-${MAX_NARRATION_S} s`,
      'DURATION_OUT_OF_RANGE',
    );
  }

  const manifest: NarrationManifest = NarrationManifestSchema.parse({
    schemaVersion: 1,
    audioKey,
    durationS: result.durationS,
    voice: result.voice,
    words: result.words,
    sceneTimings: computeSceneTimings(script.scenes, result.words, result.durationS),
  });
  await writeJsonAtomic(join(runDir, runFiles.narrate), manifest);
  const inputHash = hashManifest(manifest);
  const advanced = applyEvent(
    { ...withCost, manifestHashes: { ...withCost.manifestHashes, narrate: inputHash } },
    { event: { type: 'STAGE_SUCCEEDED', stage: 'narrate' }, actor: 'toolbox', reason: `narration ${result.durationS.toFixed(2)} s`, inputHash },
  );
  const saved = await context.commit(runDir, advanced);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
