import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type AssetVersionPage } from '@studio/core/catalog';
import { EmbeddingIndexStatusService } from '@studio/core/embeddings';
import { ListLearningNotesQuery } from '@studio/core/learnings';
import { GetVersionActivationsQuery } from '@studio/core/promotion';
import { type AssetVersionPageView, type AssetVersionView, type LearningNoteView, type PromotionApprovalView } from '@studio/shared/api';
import { formatAssetRef, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { toAssetVersionView, type SearchIndexView } from './asset-version.view';

interface FactsByRef {
  searchIndex: ReadonlyMap<AssetRef, SearchIndexView>;
  learnings: ReadonlyMap<AssetRef, LearningNoteView[]>;
  activations: ReadonlyMap<string, PromotionApprovalView | null>;
}

function refOf(version: AssetVersion): AssetRef {
  return formatAssetRef({ assetId: version.id, version: version.version });
}

/**
 * Builds every `AssetVersionView` the api returns with the rev 3 fields (SPEC 0003 section 4.3):
 * `searchIndex` from the embeddings index state, `learnings` from the learnings read query and
 * `activation` from the promotion read query. One lookup per fact kind for the whole page
 * (pages hold at most 100 versions, the bound of both batch lookups); learnings are read per
 * version because the core query is per version. Biometric versions carry no notes (B17), so
 * none is read for them.
 */
@Injectable()
export class AssetVersionViewAssembler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly indexStatus: EmbeddingIndexStatusService,
  ) {}

  async one(version: AssetVersion): Promise<AssetVersionView> {
    const facts = await this.factsFor([version]);
    return this.toView(version, facts);
  }

  async many(versions: readonly AssetVersion[]): Promise<AssetVersionView[]> {
    const facts = await this.factsFor(versions);
    return versions.map((version) => this.toView(version, facts));
  }

  async page(page: AssetVersionPage): Promise<AssetVersionPageView> {
    return { items: await this.many(page.items), total: page.total, nextCursor: page.nextCursor };
  }

  private toView(version: AssetVersion, facts: FactsByRef): AssetVersionView {
    const ref = refOf(version);
    return toAssetVersionView(version, {
      // A row the index lookup did not return has no current vector.
      searchIndex: facts.searchIndex.get(ref) ?? 'pending',
      learnings: facts.learnings.get(ref) ?? [],
      activation: facts.activations.get(ref) ?? null,
    });
  }

  private async factsFor(versions: readonly AssetVersion[]): Promise<FactsByRef> {
    const refs = [...new Set(versions.map(refOf))];
    if (refs.length === 0) return { searchIndex: new Map(), learnings: new Map(), activations: new Map() };
    const noteRefs = versions.filter((version) => version.sensitivity !== 'biometric').map(refOf);
    const [searchIndex, activations, learnings] = await Promise.all([
      this.indexStatus.statesForRefs(refs),
      this.queryBus.execute(new GetVersionActivationsQuery('asset-version', refs)),
      Promise.all([...new Set(noteRefs)].map((ref) => this.learningsOf(ref))),
    ]);
    return {
      searchIndex,
      learnings: new Map(learnings),
      activations: new Map(activations.map((entry) => [entry.ref, entry.activation])),
    };
  }

  private async learningsOf(ref: AssetRef): Promise<[AssetRef, LearningNoteView[]]> {
    const result = await this.queryBus.execute(new ListLearningNotesQuery({ scope: 'version', ref }));
    return [ref, result.scope === 'version' ? result.notes : []];
  }
}
