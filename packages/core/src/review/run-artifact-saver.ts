import { Injectable } from '@nestjs/common';
import { type Provenance } from '@studio/shared/catalog';
import { type RunId } from '@studio/shared/run-format';
import { hashFile } from '../asset-store';
import { BiometricRunGuard } from './biometric-guard';
import { ReviewRunAccess, type LoadedRun } from './review-run-access';
import { ArtifactChangedError, ReviewNotAllowedError } from './review.errors';
import { REVIEWABLE_RUN_STATUSES } from './reviewable-run-statuses';
import { mimeTypeOfArtifact, resolveRecordedArtifact, type RecordedArtifact } from './run-artifact';

/** A recorded run output whose bytes still match the hash the run recorded. */
export interface CheckedArtifact {
  artifactPath: string;
  artifact: RecordedArtifact;
  mimeType: string;
}

/**
 * The steps promote-from-run and save-video share when a run output becomes a catalog version:
 * the run is loaded, no watcher owns it (ADR 0003), its outputs are final, it used no biometric
 * material, the file still matches its recorded hash, and the run becomes the provenance. Each
 * handler keeps its own catalog command and its own refusals around these steps.
 */
@Injectable()
export class RunArtifactSaver {
  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly biometricGuard: BiometricRunGuard,
  ) {}

  /**
   * In this order, before any output is resolved or hashed: a run a watcher still writes, a run
   * whose outputs may change, and a run that used biometric material save nothing.
   */
  async loadSavableRun(runId: RunId): Promise<LoadedRun> {
    const loaded = await this.runs.load(runId);
    await this.runs.assertNoLiveWatcher(loaded);
    if (!REVIEWABLE_RUN_STATUSES.includes(loaded.run.state.status)) {
      throw new ReviewNotAllowedError(runId, loaded.run.state.status, 'status');
    }
    await this.biometricGuard.assertNoBiometricInputs(loaded);
    return loaded;
  }

  /** Resolves a recorded output and hashes it again, bounded by the target kind's size limit. */
  async checkedArtifact(loaded: LoadedRun, artifactPath: string, maxBytes: number): Promise<CheckedArtifact> {
    const mimeType = mimeTypeOfArtifact(artifactPath);
    const artifact = await resolveRecordedArtifact(loaded, artifactPath);
    const hashed = await hashFile(artifact.absolutePath, { maxBytes });
    if (hashed.contentHash !== artifact.contentHash) throw new ArtifactChangedError(loaded.runId, artifactPath, null);
    return { artifactPath, artifact, mimeType };
  }

  provenanceOf(loaded: LoadedRun, checked: CheckedArtifact, decidedBy: string): Provenance {
    return {
      source: { type: 'run', runId: loaded.runId },
      author: decidedBy,
      capturedAt: checked.artifact.recordedAt,
    };
  }

  /** The store hashed the bytes it copied; a mismatch means the file changed after the check. */
  assertStoredUnchanged(loaded: LoadedRun, checked: CheckedArtifact, stored: { contentHash: string; savedRef: string }): void {
    if (stored.contentHash !== checked.artifact.contentHash) {
      throw new ArtifactChangedError(loaded.runId, checked.artifactPath, stored.savedRef);
    }
  }
}
