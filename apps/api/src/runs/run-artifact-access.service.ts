import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetAssetVersionQuery } from '@studio/core/catalog';
import { DataHome } from '@studio/core/paths';
import { type RunArtifactAccess } from '@studio/shared/api';
import { type AssetRef, type Sensitivity } from '@studio/shared/catalog';
import { readRunFile, readRunManifest, runDirectory } from '@studio/shared/run-files';
import { type RunFile, type RunId } from '@studio/shared/run-format';
import { RequestContext } from '../platform/request-context';

/** The run's refs, and whether the manifest already pinned one as biometric. */
type ConsideredRefs = { outcome: 'withheld' } | { outcome: 'collected'; refs: ReadonlySet<AssetRef>; pinnedBiometric: boolean };

/** Why media was withheld, logged by name; never a path. */
interface WithholdCause {
  cause: 'run-file-unreadable' | 'run-file-mismatch' | 'manifest-unreadable' | 'manifest-mismatch' | 'sensitivity-unknown';
  error?: unknown;
  ref?: AssetRef;
}

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown';
}

/**
 * `RunStateResponse.artifactAccess` (SPEC 0002 rev 4, section 13.5, A26). Core's
 * `BiometricRunGuard` is not exported and only throws promote errors (open question Q2), so the
 * same rule is re-implemented here with the exported `GetAssetVersionQuery` and `readRunManifest`:
 * - refs considered: `run.json` bindings and references, plus the manifest's assets and references
 *   when `manifest.json` is present and names this run;
 * - `withheld`: any considered ref whose sensitivity lookup fails, or a manifest that is present but
 *   unreadable or names another run. Fail closed; it takes precedence;
 * - `playable-biometric`: otherwise, a manifest asset pinned `biometric` or any ref resolving to a
 *   `biometric` version;
 * - `playable`: otherwise.
 * Logs carry the run id, the ref and the error name only, never a path.
 */
@Injectable()
export class RunArtifactAccessService {
  private readonly logger = new Logger(RunArtifactAccessService.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly dataHome: DataHome,
    private readonly context: RequestContext,
  ) {}

  /** For `GET /runs/:runId/artifact`: a run.json that cannot be read for this run withholds media. */
  async forArtifactRoute(runId: RunId): Promise<RunArtifactAccess> {
    const runDir = runDirectory(this.dataHome.runs, runId);
    let run: RunFile;
    try {
      run = await readRunFile(runDir);
    } catch (error) {
      return this.withhold(runId, { cause: 'run-file-unreadable', error });
    }
    if (run.runId !== runId) return this.withhold(runId, { cause: 'run-file-mismatch' });
    return this.forRun(runId, runDir, run);
  }

  /** For a run.json the caller already read and matched to `runId`. */
  async forRun(runId: RunId, runDir: string, run: RunFile): Promise<RunArtifactAccess> {
    const considered = await this.consideredRefs(runId, runDir, run);
    if (considered.outcome === 'withheld') return 'withheld';
    let biometric = considered.pinnedBiometric;
    // One at a time, as core's guard does: at most 64 bindings and 50 references per file.
    for (const ref of considered.refs) {
      let sensitivity: Sensitivity;
      try {
        sensitivity = (await this.queryBus.execute(new GetAssetVersionQuery(ref))).sensitivity;
      } catch (error) {
        return this.withhold(runId, { cause: 'sensitivity-unknown', error, ref });
      }
      if (sensitivity === 'biometric') biometric = true;
    }
    return biometric ? 'playable-biometric' : 'playable';
  }

  private async consideredRefs(runId: RunId, runDir: string, run: RunFile): Promise<ConsideredRefs> {
    const refs = new Set<AssetRef>([...run.recipe.definition.bindings.map((binding) => binding.ref), ...run.references]);
    let manifest: Awaited<ReturnType<typeof readRunManifest>>;
    try {
      manifest = await readRunManifest(runDir);
    } catch (error) {
      return { outcome: this.withhold(runId, { cause: 'manifest-unreadable', error }) };
    }
    if (manifest.status === 'absent') return { outcome: 'collected', refs, pinnedBiometric: false };
    if (manifest.value.runId !== runId) {
      return { outcome: this.withhold(runId, { cause: 'manifest-mismatch' }) };
    }
    for (const asset of manifest.value.assets) refs.add(asset.ref);
    for (const reference of manifest.value.references) refs.add(reference.ref);
    const pinnedBiometric = manifest.value.assets.some((asset) => asset.sensitivity === 'biometric');
    return { outcome: 'collected', refs, pinnedBiometric };
  }

  private withhold(runId: RunId, withheld: WithholdCause): 'withheld' {
    this.logger.warn({
      event: 'runs.artifact-access-withheld',
      runId,
      cause: withheld.cause,
      ref: withheld.ref ?? null,
      errorName: withheld.error === undefined ? null : errorNameOf(withheld.error),
      correlationId: this.context.correlationId(),
    });
    return 'withheld';
  }
}
