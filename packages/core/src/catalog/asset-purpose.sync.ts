import { Injectable, Logger } from '@nestjs/common';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { toAssetVersion } from './asset-version.mapper';
import { AssetVersionRepository } from './asset-version.repository';
import { AssetVersionNotFoundError } from './catalog.errors';

/**
 * Copy-on-read of the asset purpose (ADR 0012, AP-02 and AP-03). The watcher never writes SQLite
 * (ADR 0003), so the api copies a `done` job's text into the row the next time it reads that
 * version. The caller reads the job file; this class only touches the two purpose columns, through
 * a conditional update that leaves an owner purpose alone. Registered by the api's
 * `AssetJobsModule` only: no watcher root can reach it. Logs carry refs and outcomes, never text.
 */
@Injectable()
export class AssetPurposeSync {
  private readonly logger = new Logger(AssetPurposeSync.name);

  constructor(private readonly versions: AssetVersionRepository) {}

  /**
   * The version as it reads after copying `purpose` from its done job. Nothing is written for an
   * owner purpose (AP-03) or when the text was already copied, so a repeated read is free.
   */
  async copyDone(version: AssetVersion, purpose: string): Promise<AssetVersion> {
    if (version.purposeSource === 'owner') return version;
    if (version.purposeSource === 'ai' && version.purpose === purpose) return version;
    const changed = await this.versions.copyAiPurpose({ assetId: version.id, version: version.version, purpose });
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    this.logger.log({ event: 'asset-purpose.copied', ref, outcome: changed === 1 ? 'copied' : 'owner-kept' });
    return this.reread(version);
  }

  /** C-P4: the row waits for a new job (`purposeSource: none`); the current text stays until then. */
  async clearForGeneration(version: AssetVersion): Promise<AssetVersion> {
    return toAssetVersion(await this.versions.clearPurposeSource(version.id, version.version));
  }

  private async reread(version: AssetVersion): Promise<AssetVersion> {
    const row = await this.versions.findVersion(version.id, version.version);
    if (row === null) throw new AssetVersionNotFoundError(formatAssetRef({ assetId: version.id, version: version.version }));
    return toAssetVersion(row);
  }
}
