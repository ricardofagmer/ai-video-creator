import { mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import {
  AssetManifestSchema,
  BlockedError,
  ScriptManifestSchema,
  runFiles,
  type Asset,
  type AssetManifest,
  type CaptureResult,
  type ProviderUsage,
} from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError } from '../errors';
import { createMediaProvider } from '../providers/media/media-provider';
import { assertCaptureTargetsAllowed, extractCaptureUrl } from '../providers/media/capture-url';
import { appendUsage } from '../run/costs';
import { hashManifest } from '../run/hashing';
import { nextStepFor } from '../run/next-steps';
import { assertStageReady, assertUpstreamUnchanged } from '../run/preconditions';
import { readManifest, writeFileAtomic, writeJsonAtomic } from '../run/run-store';
import { applyEvent } from '../run/state';

const extensionByMime: Record<CaptureResult['mimeType'], string> = {
  'image/png': 'png',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

function toAsset(sceneId: string, storageKey: string, result: CaptureResult): Asset {
  if (!result.license.trim()) throw new BlockedError(`asset for scene "${sceneId}" has no license`, 'UNLICENSED_ASSET');
  return {
    id: sceneId,
    sceneId,
    kind: result.kind,
    storageKey,
    mimeType: result.mimeType,
    provenance: result.provenance,
    license: result.license,
    // Only a real capture of the named page may stand as proof; title cards never do.
    presentedAsProof: result.kind === 'capture',
  };
}

/** Produces one asset per script scene (live capture or title card) and assets.json. */
export async function captureCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  assertStageReady(run, 'assets');
  await assertUpstreamUnchanged(runDir, run, 'assets');
  const script = await readManifest(runDir, runFiles.script, ScriptManifestSchema);
  const provider = createMediaProvider(context.env);

  context.beginStage('assets');
  const plans = script.scenes.map((scene) => ({ scene, url: provider.mode === 'live' ? extractCaptureUrl(scene.visual) : null }));
  const targets = plans.flatMap(({ scene, url }) => (url ? [{ sceneId: scene.id, url }] : []));
  if (provider.mode === 'live') assertCaptureTargetsAllowed(targets, context.env.captureAllowedHosts);

  await mkdir(join(runDir, runFiles.assetsDir), { recursive: true });
  const assets: Asset[] = [];
  const usage: ProviderUsage[] = [];
  try {
    for (const { scene, url } of plans) {
      context.log(url ? `capturing ${url.href} for scene ${scene.id}` : `title card for scene ${scene.id}`);
      const result = await provider.capture({
        sceneId: scene.id,
        ...(url ? { url: url.href } : {}),
        brief: scene.visual,
        onScreenText: scene.onScreenText,
        durationS: scene.durationHintS,
      });
      const storageKey = `${runFiles.assetsDir}/${scene.id}.${extensionByMime[result.mimeType]}`;
      const assetPath = resolve(runDir, storageKey);
      if (!assetPath.startsWith(resolve(runDir, runFiles.assetsDir) + sep)) {
        throw new InputError(`scene id "${scene.id}" would write outside ${runFiles.assetsDir}/`);
      }
      await writeFileAtomic(assetPath, result.bytes);
      assets.push(toAsset(scene.id, storageKey, result));
      usage.push(...result.usage);
    }
  } finally {
    await provider.close();
  }

  const manifest: AssetManifest = AssetManifestSchema.parse({ schemaVersion: 1, assets });
  await writeJsonAtomic(join(runDir, runFiles.assets), manifest);
  const inputHash = hashManifest(manifest);
  const advanced = applyEvent(
    { ...appendUsage(run, 'assets', usage), manifestHashes: { ...run.manifestHashes, assets: inputHash } },
    { event: { type: 'STAGE_SUCCEEDED', stage: 'assets' }, actor: 'toolbox', reason: `${assets.length} assets written`, inputHash },
  );
  const saved = await context.commit(runDir, advanced);
  context.log(`assets.json written (${assets.length} assets, ${targets.length} live captures)`);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
