import { Injectable } from '@nestjs/common';
import { parseAssetRef, type ParsedAssetRef } from '@studio/shared/catalog';
import { RunFileError, readOptionalJsonFile, readRunEvents, resolveInsideRun, runDirectory } from '@studio/shared/run-files';
import { RunManifestSchema, runFileNames, type RunId } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';

/** One page of `events.jsonl`; a run's log is read page by page until its first `review`. */
const EVENTS_PAGE_BYTES = 1024 * 1024;

/**
 * What a run's event log says about the path to `review`. `unreadable` covers a missing, corrupt
 * or review-less log: the run is counted as "without history", never guessed.
 */
export type RunHistory = { status: 'unreadable' } | { status: 'read'; reviewAt: Date; leftFailed: boolean };

/** The asset versions a run's `manifest.json` names (bindings and references), deduplicated. */
export type RunAssetVersions = { status: 'unreadable' } | { status: 'read'; versions: readonly ParsedAssetRef[] };

/**
 * Reads the two run files insights needs: `events.jsonl` (first `review` instant, and whether the
 * run left `failed` before it, the owner's definition of a manual file repair) and `manifest.json`
 * (the asset versions it pinned). Read-only. A run file error is a fact about that run, so it
 * answers `unreadable` instead of failing the whole page; any other error is thrown.
 */
@Injectable()
export class RunHistoryReader {
  constructor(private readonly dataHome: DataHome) {}

  async history(runId: RunId): Promise<RunHistory> {
    const runDir = runDirectory(this.dataHome.runs, runId);
    let fromByte = 0;
    let leftFailed = false;
    try {
      for (;;) {
        const page = await readRunEvents(runDir, fromByte, EVENTS_PAGE_BYTES);
        for (const event of page.entries) {
          if (event.type !== 'run.status') continue;
          if (event.to === 'review') return { status: 'read', reviewAt: new Date(event.atMs), leftFailed };
          if (event.from === 'failed') leftFailed = true;
        }
        if (page.nextByte === fromByte) return { status: 'unreadable' };
        fromByte = page.nextByte;
      }
    } catch (error) {
      if (error instanceof RunFileError) return { status: 'unreadable' };
      throw error;
    }
  }

  async assetVersions(runId: RunId): Promise<RunAssetVersions> {
    const manifestPath = resolveInsideRun(runDirectory(this.dataHome.runs, runId), runFileNames.manifest);
    try {
      const manifest = await readOptionalJsonFile(manifestPath, RunManifestSchema);
      if (manifest.status === 'absent') return { status: 'unreadable' };
      const refs = new Set([...manifest.value.assets.map((asset) => asset.ref), ...manifest.value.references.map((reference) => reference.ref)]);
      return { status: 'read', versions: [...refs].map((ref) => parseAssetRef(ref)) };
    } catch (error) {
      if (error instanceof RunFileError) return { status: 'unreadable' };
      throw error;
    }
  }
}
