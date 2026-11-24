import { type QueryBus } from '@nestjs/cqrs';
import { GetAssetVersionQuery, GetEntryFileTextQuery } from '@studio/core/catalog';
import { type BoundAssetSummary } from '@studio/core/agents';
import { type AssetKind, type AssetVersion } from '@studio/shared/catalog';
import type { ResolvedAsset, StageExecutionContext } from '@studio/shared/ports';

type VersionOfKind<Kind extends AssetKind> = Extract<AssetVersion, { kind: Kind }>;

export interface BoundAsset {
  slot: string;
  asset: ResolvedAsset;
}

/**
 * Read-only catalog access of the stages, through the QueryBus (ADR 0003: the watcher never
 * writes SQLite). Only metadata rows are read here; bytes are read from the resolved asset path
 * the engine re-hashed at `preflight`, and a biometric asset's path is never read at all.
 */
export class CatalogLookup {
  constructor(private readonly queries: QueryBus) {}

  async version(ref: string): Promise<AssetVersion> {
    return this.queries.execute(new GetAssetVersionQuery(ref));
  }

  async versionOfKind<Kind extends AssetKind>(asset: ResolvedAsset, kind: Kind): Promise<VersionOfKind<Kind> | null> {
    const version = await this.version(asset.ref);
    return isKind(version, kind) ? version : null;
  }

  /** The entry file (SKILL.md) of a skill version, as text; the caller never passes a biometric asset. */
  async skillEntryText(ref: string): Promise<string> {
    return (await this.queries.execute(new GetEntryFileTextQuery(ref))).text;
  }

  /** Binding summaries for the agent packets; core `bindingSummaries` drops biometric rows. */
  async boundSummaries(context: StageExecutionContext): Promise<BoundAssetSummary[]> {
    const summaries: BoundAssetSummary[] = [];
    for (const bound of boundAssets(context)) {
      const title = bound.asset.sensitivity === 'biometric' ? bound.asset.ref : (await this.version(bound.asset.ref)).name;
      summaries.push({ slot: bound.slot, ref: bound.asset.ref, kind: bound.asset.kind, title, sensitivity: bound.asset.sensitivity });
    }
    return summaries;
  }
}

function isKind<Kind extends AssetKind>(version: AssetVersion, kind: Kind): version is VersionOfKind<Kind> {
  return version.kind === kind;
}

/** The recipe bindings this stage's brief lists, joined with the assets the engine resolved. */
export function boundAssets(context: StageExecutionContext): BoundAsset[] {
  return context.stageBrief.bindings.flatMap((binding) => {
    const asset = context.assets.find((candidate) => candidate.ref === binding.ref);
    return asset === undefined ? [] : [{ slot: binding.slot, asset }];
  });
}

/** First bound asset of a kind, preferring an exact slot name when the recipe uses it. */
export function boundOfKind(context: StageExecutionContext, kind: AssetKind, preferredSlot?: string): BoundAsset | null {
  const candidates = boundAssets(context).filter((bound) => bound.asset.kind === kind);
  return candidates.find((bound) => bound.slot === preferredSlot) ?? candidates[0] ?? null;
}
