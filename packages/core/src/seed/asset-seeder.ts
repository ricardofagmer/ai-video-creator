import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { formatAssetRef, type AssetVersion, type Sha256 } from '@studio/shared/catalog';
import { ReferenceInspector, sha256Hex } from '../asset-store';
import {
  AssetNotFoundError,
  CreateAssetCommand,
  ListAssetVersionsQuery,
  MAX_PAGE_LIMIT,
  MAX_REFERENCE_BYTES,
  MAX_STORED_BYTES_BY_KIND,
  SaveAssetVersionCommand,
  type AssetVersionPage,
} from '../catalog';
import { SeedHistoryTooLongError, SeedKindMismatchError } from './seed.errors';
import { type SeedAssetPlan } from './seed-asset-plan';
import { type SeedEntryResult } from './seed-report';

/** At 100 versions per page, 2000 versions; a seeded asset never comes close. */
const MAX_HISTORY_PAGES = 20;

/**
 * Registers one planned asset idempotently (SPEC 0002 R1-07). The content hash is computed first,
 * read-only, with the same algorithm the store uses (file sha-256, or the canonical folder
 * manifest hash of ADR 0003 decision 1). When any existing version of the asset already carries
 * that hash, nothing is written and the entry is `unchanged`; otherwise the catalog commands
 * save version 1 (new asset) or N+1 (changed seed source). Version N is never touched.
 */
@Injectable()
export class AssetSeeder {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly references: ReferenceInspector,
  ) {}

  async apply(entryId: string, plan: SeedAssetPlan, signal?: AbortSignal): Promise<SeedEntryResult> {
    const history = await this.historyOf(entryId, plan.assetId);

    // A new asset needs no comparison: the create command hashes the content once, itself.
    if (history === null) {
      const created = await this.commandBus.execute(
        new CreateAssetCommand({ assetId: plan.assetId, kind: plan.kind, metadata: plan.metadata, content: plan.content, signal }),
      );
      return this.result('created', entryId, created);
    }

    const first = history[0];
    if (first !== undefined && first.kind !== plan.kind) throw new SeedKindMismatchError(entryId, plan.assetId);
    const contentHash = await this.hashOf(plan, signal);
    const match = matchingVersion(history, contentHash);
    if (match !== undefined) return this.result('unchanged', entryId, match);

    const saved = await this.commandBus.execute(
      new SaveAssetVersionCommand({ assetId: plan.assetId, metadata: plan.metadata, content: plan.content, signal }),
    );
    return this.result('created', entryId, saved);
  }

  private result(outcome: 'created' | 'unchanged', entryId: string, version: AssetVersion): SeedEntryResult {
    return {
      outcome,
      entryId,
      target: 'asset',
      ref: formatAssetRef({ assetId: version.id, version: version.version }),
      contentHash: version.contentHash,
    };
  }

  /**
   * Read-only, and only for an asset that already exists. A biometric reference is hashed in place
   * by the inspector (no copy, no listing beyond the one file), the same way preflight re-hashes it.
   */
  private async hashOf(plan: SeedAssetPlan, signal: AbortSignal | undefined): Promise<Sha256> {
    const maxStored = MAX_STORED_BYTES_BY_KIND[plan.kind];
    const { content } = plan;
    switch (content.source) {
      case 'inline': {
        const bytes = Buffer.from(content.text, 'utf8');
        return sha256Hex(bytes);
      }
      case 'import-file':
        return (await this.references.inspectFile(content.absolutePath, { maxBytes: maxStored, signal })).contentHash;
      case 'import-folder':
        return (await this.references.inspectFolder(content.absolutePath, { maxBytes: maxStored, signal })).contentHash;
      case 'reference-file':
        return (await this.references.inspectFile(content.absolutePath, { maxBytes: MAX_REFERENCE_BYTES, signal })).contentHash;
    }
  }

  /** Every version of the asset, oldest first; null when the asset does not exist yet. */
  private async historyOf(entryId: string, assetId: string): Promise<AssetVersion[] | null> {
    const versions: AssetVersion[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      const result = await this.listPage(assetId, cursor);
      if (result === null) return null;
      versions.push(...result.items);
      if (result.nextCursor === null) return versions;
      cursor = result.nextCursor;
    }
    throw new SeedHistoryTooLongError(entryId);
  }

  private async listPage(assetId: string, cursor: string | undefined): Promise<AssetVersionPage | null> {
    try {
      return await this.queryBus.execute(new ListAssetVersionsQuery(assetId, { limit: MAX_PAGE_LIMIT, cursor }));
    } catch (error) {
      if (error instanceof AssetNotFoundError) return null;
      throw error;
    }
  }
}

/** The active version when it matches, otherwise the newest matching version. */
function matchingVersion(history: readonly AssetVersion[], contentHash: Sha256): AssetVersion | undefined {
  const active = history.find((version) => version.status === 'active' && version.contentHash === contentHash);
  if (active !== undefined) return active;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const version = history[index];
    if (version !== undefined && version.contentHash === contentHash) return version;
  }
  return undefined;
}
