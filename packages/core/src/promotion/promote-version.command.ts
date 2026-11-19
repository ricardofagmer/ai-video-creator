import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type PromotionApprovalView } from '@studio/shared/api';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';

/** `promotion_approvals.target_kind`: one approval names exactly one asset or recipe version. */
export type PromotionTarget = 'asset-version' | 'recipe-version';

export interface PromoteVersionInput {
  target: PromotionTarget;
  /** `assetId@version` or `recipeId@version`, built by the api from the path. */
  ref: string;
  /** C10 `PromoteVersionRequest.acknowledgeRef`: must equal `ref`, else nothing is written. */
  acknowledgeRef: string;
  /** May be empty (B16). Scanned for secret shapes; never logged. */
  reason: string;
  /** Optional and informational (B16); every named id must exist. */
  evidence?: { comparisonId?: string; runIds?: string[] };
  /** The session's owner; never taken from a request body. */
  decidedBy: string;
  /** The api's `x-request-id`, when present. */
  correlationId?: string | null;
}

export type PromoteVersionResult =
  | {
      target: 'asset-version';
      version: AssetVersion;
      /** The previously active version, now `deprecated`; null when none was active. */
      replaced: AssetVersion | null;
      approval: PromotionApprovalView;
    }
  | {
      target: 'recipe-version';
      version: RecipeVersionView;
      replaced: RecipeVersionView | null;
      approval: PromotionApprovalView;
    };

/**
 * Criterion 35 (SPEC 0003 section 5.4, R2-AC-19): records one owner approval and makes exactly that
 * version `active`, deprecating the one it replaces, in one transaction. One version per command;
 * there is no batch form. Dispatched only by the api's promotion routes: no timer, scheduler, queue
 * consumer, event handler or agent tool may send it (R2-AC-21).
 */
export class PromoteVersionCommand extends Command<PromoteVersionResult> {
  constructor(readonly input: PromoteVersionInput) {
    super();
  }
}
