import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type AssetRef, type Sensitivity } from '@studio/shared/catalog';
import { readRunManifest } from '@studio/shared/run-files';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../catalog';
import { PromoteBiometricRefusedError, PromoteSensitivityUnknownError } from './review.errors';
import { type LoadedRun } from './review-run-access';

/**
 * Refuses promotion from a run that used any biometric asset version (PRD 7.3, criterion 22):
 * the guard does not try to tell which outputs carry it, because narration and `final.mp4` do.
 */
@Injectable()
export class BiometricRunGuard {
  constructor(private readonly queryBus: QueryBus) {}

  async assertNoBiometricInputs(loaded: LoadedRun): Promise<void> {
    const refs = new Set<AssetRef>([
      ...loaded.run.recipe.definition.bindings.map((binding) => binding.ref),
      ...loaded.run.references,
    ]);
    const manifest = await readRunManifest(loaded.runDir);
    if (manifest.status === 'present' && manifest.value.runId === loaded.runId) {
      // The manifest records the sensitivity it pinned; a biometric entry refuses without a lookup.
      const pinnedBiometric = manifest.value.assets.find((asset) => asset.sensitivity === 'biometric');
      if (pinnedBiometric !== undefined) {
        throw new PromoteBiometricRefusedError({ kind: 'run-used-biometric', runId: loaded.runId, ref: pinnedBiometric.ref });
      }
      for (const asset of manifest.value.assets) refs.add(asset.ref);
      for (const reference of manifest.value.references) refs.add(reference.ref);
    }
    // One at a time: at most 64 bindings and 50 references, each a single indexed catalog read.
    for (const ref of refs) await this.assertNotBiometric(loaded, ref);
  }

  private async assertNotBiometric(loaded: LoadedRun, ref: AssetRef): Promise<void> {
    let sensitivity: Sensitivity;
    try {
      sensitivity = (await this.queryBus.execute(new GetAssetVersionQuery(ref))).sensitivity;
    } catch (error) {
      // Unknown sensitivity fails closed; any other failure also aborts the promotion as it propagates.
      if (error instanceof AssetVersionNotFoundError) throw new PromoteSensitivityUnknownError(loaded.runId, ref);
      throw error;
    }
    if (sensitivity === 'biometric') {
      throw new PromoteBiometricRefusedError({ kind: 'run-used-biometric', runId: loaded.runId, ref });
    }
  }
}
