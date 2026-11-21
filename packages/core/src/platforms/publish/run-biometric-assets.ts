import { Injectable } from '@nestjs/common';
import { type PublishBiometricAssetView } from '@studio/shared/api';
import { AssetKindSchema, SensitivitySchema, parseAssetRef, type AssetRef } from '@studio/shared/catalog';
import { RunFileError, readRunFile, readRunManifest } from '@studio/shared/run-files';
import { type RunId } from '@studio/shared/run-format';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformRefusedError } from '../platforms.errors';

/**
 * The biometric asset versions a run used (SPEC 0007 section 5.4, OD4): every ref in
 * `manifest.json.assets[]` and `references[]`, plus every bound ref and reference of `run.json`,
 * each looked up in the catalog as `BiometricRunGuard` does. An unknown version or sensitivity
 * fails closed with `publish-sensitivity-unknown`. Named by title, kind and ref, never by path.
 * Read-only.
 */
@Injectable()
export class RunBiometricAssets {
  constructor(private readonly prisma: PrismaService) {}

  /** Sorted by ref, so two derivations of the same run compare equal. */
  async derive(options: { runId: RunId; runDir: string }): Promise<PublishBiometricAssetView[]> {
    const refs = await this.refsOf(options);
    const biometric: PublishBiometricAssetView[] = [];
    // One at a time: at most 64 bindings and 50 references, each one indexed catalog read.
    for (const ref of [...refs].sort()) {
      const asset = await this.lookup(options.runId, ref);
      if (asset !== null) biometric.push(asset);
    }
    return biometric;
  }

  private async refsOf(options: { runId: RunId; runDir: string }): Promise<Set<AssetRef>> {
    try {
      const run = await readRunFile(options.runDir);
      const refs = new Set<AssetRef>([...run.recipe.definition.bindings.map((binding) => binding.ref), ...run.references]);
      const manifest = await readRunManifest(options.runDir);
      if (manifest.status === 'present' && manifest.value.runId === options.runId) {
        for (const asset of manifest.value.assets) refs.add(asset.ref);
        for (const reference of manifest.value.references) refs.add(reference.ref);
      }
      return refs;
    } catch (error) {
      // Without the run's records the set cannot be derived; that fails closed as well.
      if (error instanceof RunFileError) throw new PlatformRefusedError('publish-sensitivity-unknown', null, options.runId);
      throw error;
    }
  }

  /** The asset when it is biometric, null when it is not; unknown fails closed. */
  private async lookup(runId: RunId, ref: AssetRef): Promise<PublishBiometricAssetView | null> {
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.prisma.assetVersion.findUnique({
      where: { assetId_version: { assetId, version } },
      select: { name: true, sensitivity: true, asset: { select: { kind: true } } },
    });
    const sensitivity = row === null ? null : SensitivitySchema.safeParse(row.sensitivity);
    const kind = row === null ? null : AssetKindSchema.safeParse(row.asset.kind);
    if (row === null || sensitivity === null || !sensitivity.success || kind === null || !kind.success) {
      throw new PlatformRefusedError('publish-sensitivity-unknown', null, runId);
    }
    if (sensitivity.data !== 'biometric') return null;
    return { ref, title: row.name.slice(0, 200), kind: kind.data };
  }
}
