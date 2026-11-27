import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPreviewInput, type PreviewInput } from '@ace/video/dist/render/preview-input';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { previewTemplateIdOf, templatePreviewEligibility } from '@studio/core/asset-jobs';
import { AssetVersionNotFoundError } from '@studio/core/catalog';
import { templatePreviewBounds, type TemplatePreviewJobFile } from '@studio/shared/asset-jobs';
import { assetJobFilePath, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetVersion } from '@studio/shared/catalog';
import { writeFileAtomic } from '@studio/shared/run-files';
import { ToolRunner } from '../stages/process/tool-runner.client';
import { RenderResultSchema, type RenderSceneRequest } from '../stages/process/tool-runner.protocol';
import { CatalogLookup } from '../stages/shared/catalog-lookup';
import { withScratchDir } from '../stages/shared/scratch-dir';
import { STAGE_SETTINGS, type StageSettings } from '../stages/shared/stage-settings';
import { failedJob, refusedJob, type AssetJobEnding, type AssetJobFailedCode } from './asset-job-file.mapper';
import { type AssetJobSignals } from './asset-job-signals';
import { type ClaimedAssetJob, type TemplatePreviewHandlerPort } from './claimed-asset-job';

const AUDIO_NAME = 'silence.wav';
const SILENCE_SAMPLE_RATE = 16_000;

type PreviewLookup = { status: 'found'; version: AssetVersion } | { status: 'missing' };

/**
 * Template previews (2026-11-25): the template's own sample copy (`@ace/video` `buildPreviewInput`),
 * cut to `templatePreviewBounds.clipSeconds`, rendered by the tool runner like the `composition`
 * stage renders a run, over a silent track, so the clip is muted. Local and $0: nothing leaves the
 * machine and nothing is billed. Order:
 * 1. resolve the version read-only: missing -> `failed` / `asset-missing`; not a Remotion template
 *    with a 9:16 composition -> `refused` / `not-supported`;
 * 2. render the clip and its poster frame in a private scratch folder;
 * 3. check both (non-empty, within bounds) and write them into the job folder; the step then writes
 *    `done` with `clip` and `durationS`.
 * Logs carry the ref, codes and sizes only, never a path.
 */
@Injectable()
export class TemplatePreviewHandler implements TemplatePreviewHandlerPort {
  private readonly logger = new Logger(TemplatePreviewHandler.name);
  private readonly catalog: CatalogLookup;
  private readonly runner: ToolRunner;

  constructor(
    @Inject(QueryBus) queries: QueryBus,
    @Inject(STAGE_SETTINGS) private readonly settings: StageSettings,
  ) {
    this.catalog = new CatalogLookup(queries);
    this.runner = new ToolRunner(settings);
  }

  async handle(job: ClaimedAssetJob<TemplatePreviewJobFile>, signals: AssetJobSignals): Promise<AssetJobEnding> {
    const { location } = job;
    const lookup = await this.lookup(location);
    if (lookup.status === 'missing') return failedJob('asset-missing');
    const { version } = lookup;
    if (templatePreviewEligibility(version) !== 'ok' || version.kind !== 'template') return refusedJob('not-supported');
    const templateId = previewTemplateIdOf(version.details.compositionId);
    if (templateId === null) return refusedJob('not-supported');
    const input = buildPreviewInput(templateId, templatePreviewBounds.clipSeconds);
    if (input.scenes.length === 0) return refusedJob('not-supported');
    signals.throwIfAborted();
    return withScratchDir(this.settings, async (directory): Promise<AssetJobEnding> => {
      const serveRoot = join(directory, 'serve');
      await mkdir(serveRoot, { recursive: true });
      await writeFile(join(serveRoot, AUDIO_NAME), silentWav(input.durationS));
      const output = join(directory, 'preview.mp4');
      const thumbnail = join(directory, 'preview.png');
      const result = await this.runner.run(
        {
          command: 'render',
          serveRoot,
          template: templateId,
          title: input.title,
          durationS: input.durationS,
          audioPath: AUDIO_NAME,
          scenes: input.scenes.map(sceneRequestOf),
          captions: input.captions,
          disclosure: '',
          output,
          thumbnail,
        },
        RenderResultSchema,
        { signal: signals.signal, timeoutMs: templatePreviewBounds.jobTimeoutMs, readRoots: [] },
      );
      signals.throwIfAborted();
      if (result.status === 'failed') {
        this.logger.warn({ event: 'asset-job.preview-render-failed', ref: location.ref, kind: result.kind });
        return failedJob(failedCodeOf(result.kind));
      }
      const kept = await this.keepFiles(location, { output, thumbnail });
      if (kept !== null) return failedJob(kept);
      this.logger.log({ event: 'asset-job.preview-rendered', ref: location.ref, durationS: input.durationS, renderSeconds: result.result.renderSeconds });
      return { status: 'done', mode: 'live', usd: 0, result: { kind: 'template-preview', durationS: input.durationS } };
    });
  }

  private async lookup(location: AssetJobLocation): Promise<PreviewLookup> {
    try {
      return { status: 'found', version: await this.catalog.version(location.ref) };
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return { status: 'missing' };
      throw error;
    }
  }

  /** Both files or neither: a clip without its poster (or the reverse) is removed, not kept. */
  private async keepFiles(location: AssetJobLocation, files: { output: string; thumbnail: string }): Promise<AssetJobFailedCode | null> {
    const clip = await readFile(files.output);
    const poster = await readFile(files.thumbnail);
    if (clip.byteLength === 0 || clip.byteLength > templatePreviewBounds.clipMaxBytes || poster.byteLength === 0 || poster.byteLength > templatePreviewBounds.posterMaxBytes) {
      this.logger.warn({ event: 'asset-job.preview-rejected', ref: location.ref, clipBytes: clip.byteLength, posterBytes: poster.byteLength });
      return 'output-invalid';
    }
    const clipPath = assetJobFilePath(location, 'previewMp4');
    const posterPath = assetJobFilePath(location, 'previewPng');
    try {
      await writeFileAtomic(clipPath, clip);
      await writeFileAtomic(posterPath, poster);
    } catch (error) {
      await Promise.all([rm(clipPath, { force: true }), rm(posterPath, { force: true })]);
      throw error;
    }
    return null;
  }
}

/** The sample copy has no pictures; every preview scene is text on the template's own background. */
function sceneRequestOf(scene: PreviewInput['scenes'][number]): RenderSceneRequest {
  return { id: scene.id, kind: scene.kind, startS: scene.startS, endS: scene.endS, onScreenText: scene.onScreenText, asset: null };
}

/** A runner failure as a job code; the runner's message is never copied into the job file. */
function failedCodeOf(kind: 'input' | 'tool' | 'provider' | 'blocked' | 'internal' | 'timeout'): AssetJobFailedCode {
  if (kind === 'timeout') return 'timed-out';
  if (kind === 'tool' || kind === 'blocked') return 'tool-missing';
  return 'output-invalid';
}

/** Mono 16-bit PCM silence: the renderer needs an audio track, and the preview has none to play. */
function silentWav(seconds: number): Buffer {
  const dataBytes = Math.ceil(seconds * SILENCE_SAMPLE_RATE) * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SILENCE_SAMPLE_RATE, 24);
  header.writeUInt32LE(SILENCE_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, Buffer.alloc(dataBytes)]);
}
