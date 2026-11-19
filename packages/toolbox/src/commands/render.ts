import { join } from 'node:path';
import { renderVideo } from '@ace/video';
import {
  AssetManifestSchema,
  NarrationManifestSchema,
  RenderManifestSchema,
  ScriptManifestSchema,
  runFiles,
  type RenderManifest,
} from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { ExternalToolError } from '../errors';
import { probeMedia } from '../media/ffprobe';
import { toRenderInput } from '../render/render-input-mapper';
import { startStaticServer } from '../render/static-server';
import { appendUsage } from '../run/costs';
import { hashManifest } from '../run/hashing';
import { nextStepFor } from '../run/next-steps';
import { assertStageReady, assertUpstreamUnchanged } from '../run/preconditions';
import { readManifest, writeJsonAtomic } from '../run/run-store';
import { applyEvent } from '../run/state';

/** Serves the run folder locally, renders video.mp4 + thumbnail.png and confirms them with ffprobe. */
export async function renderCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  assertStageReady(run, 'render');
  await assertUpstreamUnchanged(runDir, run, 'render');
  const script = await readManifest(runDir, runFiles.script, ScriptManifestSchema);
  const assets = await readManifest(runDir, runFiles.assets, AssetManifestSchema);
  const narration = await readManifest(runDir, runFiles.narrate, NarrationManifestSchema);

  context.beginStage('render');
  const videoPath = join(runDir, runFiles.video);
  const thumbnailPath = join(runDir, runFiles.thumbnail);
  const server = await startStaticServer(runDir);
  const renderSeconds = await (async (): Promise<number> => {
    try {
      const input = toRenderInput({ template: run.template, script, assets, narration, baseUrl: server.baseUrl });
      context.log(`rendering ${run.template} (${input.durationS.toFixed(2)} s) from ${server.baseUrl}`);
      return (await renderVideo({ input, outputPath: videoPath, thumbnailPath })).renderSeconds;
    } finally {
      await server.close();
    }
  })();

  const probe = await probeMedia(context.env.ffprobePath, videoPath);
  if (!probe.video) throw new ExternalToolError(`${runFiles.video} has no video stream`, context.env.ffprobePath);
  const manifest: RenderManifest = RenderManifestSchema.parse({
    schemaVersion: 1,
    videoKey: runFiles.video,
    thumbnailKey: runFiles.thumbnail,
    durationS: probe.durationS,
    width: probe.video.width,
    height: probe.video.height,
    fps: probe.video.fps,
    renderSeconds,
  });
  await writeJsonAtomic(join(runDir, runFiles.render), manifest);
  const inputHash = hashManifest(manifest);
  const withUsage = appendUsage(run, 'render', [{ provider: 'remotion-local', unit: 'render_seconds', quantity: renderSeconds, usdEstimate: 0 }]);
  const advanced = applyEvent(
    { ...withUsage, manifestHashes: { ...withUsage.manifestHashes, render: inputHash } },
    { event: { type: 'STAGE_SUCCEEDED', stage: 'render' }, actor: 'toolbox', reason: `rendered in ${renderSeconds.toFixed(1)} s`, inputHash },
  );
  const saved = await context.commit(runDir, advanced);
  context.log(`video.mp4 ${manifest.width}x${manifest.height} @ ${manifest.fps} fps, ${manifest.durationS.toFixed(2)} s`);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
