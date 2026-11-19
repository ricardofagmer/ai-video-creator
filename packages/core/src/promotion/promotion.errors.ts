import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type PromotionErrorCategory = 'validation' | 'dependency' | 'internal';

/**
 * Base of every promotion domain error (SPEC 0003 section 5.4). Messages carry refs, ids and
 * statuses only: never the approval reason, the approver's name or evidence text (section 7).
 * Not-found, transition, licence and race failures reuse the catalog and recipes errors, so their
 * reasons match the R1 status route.
 */
export abstract class PromotionError extends Error {
  abstract readonly category: PromotionErrorCategory;
}

/** Issue messages are fixed texts; none echoes the submitted reason. */
export class InvalidPromotionInputError extends PromotionError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid promotion input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidPromotionInputError';
  }
}

/** `acknowledgeRef` differs from the ref of the path: the owner confirmed another version (422). */
export class PromotionRefMismatchError extends PromotionError {
  override readonly category = 'validation';

  constructor(readonly ref: string) {
    super(`The acknowledged ref does not match ${ref}; nothing was recorded`);
    this.name = 'PromotionRefMismatchError';
  }
}

/**
 * The reason could not be scanned for secret shapes (section 6: reasons are scanned before
 * storage). Fails closed: no approval is recorded while the scan is unavailable.
 */
export class PromotionSecretScanUnavailableError extends PromotionError {
  override readonly category = 'dependency';

  constructor(readonly ref: string) {
    super(`The promotion reason for ${ref} could not be scanned; nothing was recorded`);
    this.name = 'PromotionSecretScanUnavailableError';
  }
}

/** A stored approval no longer matches C10 or its target; a data-integrity problem. */
export class PromotionApprovalCorruptError extends PromotionError {
  override readonly category = 'internal';

  constructor(readonly approvalId: number, options?: ErrorOptions) {
    super(`Promotion approval ${approvalId} does not match the promotion contract`, options);
    this.name = 'PromotionApprovalCorruptError';
  }
}
