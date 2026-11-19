import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { parseRecipeRef } from '../../recipes/recipe-ref';
import { toActivationView } from '../promotion-approval.mapper';
import { MAX_ACTIVATION_LOOKUP, PromotionApprovalRepository, type VersionKey } from '../promotion-approval.repository';
import { InvalidPromotionInputError } from '../promotion.errors';
import { GetVersionActivationsQuery, type VersionActivation } from './get-version-activations.query';

function versionKeyOf(query: GetVersionActivationsQuery, ref: string): VersionKey {
  if (query.target === 'asset-version') {
    const parsed = parseAssetRef(ref);
    return { id: parsed.assetId, version: parsed.version };
  }
  const parsed = parseRecipeRef(ref);
  return { id: parsed.recipeId, version: parsed.version };
}

@QueryHandler(GetVersionActivationsQuery)
export class GetVersionActivationsHandler implements IQueryHandler<GetVersionActivationsQuery, VersionActivation[]> {
  constructor(private readonly approvals: PromotionApprovalRepository) {}

  async execute(query: GetVersionActivationsQuery): Promise<VersionActivation[]> {
    const refSchema = query.target === 'asset-version' ? AssetRefSchema : RecipeRefSchema;
    const refs = z.array(refSchema).max(MAX_ACTIVATION_LOOKUP).safeParse([...new Set(query.refs)]);
    if (!refs.success) throw new InvalidPromotionInputError([{ path: 'refs', message: `expected at most ${MAX_ACTIVATION_LOOKUP} id@version refs` }]);

    const facts = await this.approvals.findActivationFacts(query.target, refs.data.map((ref) => versionKeyOf(query, ref)));
    const approvalIds = facts.flatMap((fact) => (fact.status === 'active' && fact.activationApprovalId !== null ? [fact.activationApprovalId] : []));
    const approvals = new Map((await this.approvals.findByIds(query.target, approvalIds)).map((row) => [row.id, row]));
    const factsByRef = new Map(facts.map((fact) => [`${fact.id}@${fact.version}`, fact]));

    return refs.data.map((ref) => {
      const fact = factsByRef.get(ref);
      if (fact === undefined) return { ref, activation: null };
      const approval = fact.activationApprovalId === null ? null : (approvals.get(fact.activationApprovalId) ?? null);
      return { ref, activation: toActivationView(fact, approval) };
    });
  }
}
