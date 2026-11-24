import { Injectable, Logger } from '@nestjs/common';
import { REFERENCE_ANALYSES_MAX, type ReferenceAnalysisEntry } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import { type ReferenceAnalysisReaderPort } from '@studio/shared/ports';
import { AssetJobStore } from './asset-job-store';

/**
 * C6 `ReferenceAnalysisReaderPort`, bound by the watcher for the `script` stage. Only `done`
 * analyses are returned, in the order of `refs`, each ref once, at most `REFERENCE_ANALYSES_MAX`.
 * A missing, open, failed or unreadable job is skipped, never an error: an analysis is guidance
 * and must never stop a stage. Reads only.
 */
@Injectable()
export class ReferenceAnalysisReader implements ReferenceAnalysisReaderPort {
  private readonly logger = new Logger(ReferenceAnalysisReader.name);

  constructor(private readonly store: AssetJobStore) {}

  async readDone(refs: readonly AssetRef[]): Promise<ReferenceAnalysisEntry[]> {
    const entries: ReferenceAnalysisEntry[] = [];
    const seen = new Set<AssetRef>();
    for (const ref of refs) {
      if (entries.length >= REFERENCE_ANALYSES_MAX) break;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const entry = await this.readOne(ref);
      if (entry !== null) entries.push(entry);
    }
    return entries;
  }

  private async readOne(ref: AssetRef): Promise<ReferenceAnalysisEntry | null> {
    try {
      const lookup = await this.store.read('reference-analysis', ref);
      if (lookup.status === 'none') return null;
      const { job } = lookup;
      if (job.status !== 'done' || job.mode === undefined || job.analysis === undefined) return null;
      return { ref, mode: job.mode, analysis: job.analysis };
    } catch (error) {
      // A path refusal or a corrupt file: skipped, and the log says which ref, never its content.
      this.logger.warn({ event: 'asset-job.analysis-skipped', ref, errorName: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }
}
