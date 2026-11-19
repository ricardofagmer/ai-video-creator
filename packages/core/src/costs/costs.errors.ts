import { type ModelId, type ProviderName } from '@studio/shared/run-format';

/** Error taxonomy category (rules/observability.md). */
export type CostsErrorCategory = 'validation' | 'conflict' | 'dependency' | 'internal';

/** Messages carry ids, model ids and provider names only; never paths, prompts or keys. */
export abstract class CostsError extends Error {
  abstract readonly category: CostsErrorCategory;
}

export type PriceSubject = { kind: 'model'; modelId: ModelId } | { kind: 'provider'; provider: ProviderName };

/**
 * A live quantity the price table cannot price (unknown model, or a provider left unpriced on
 * purpose). Estimation fails closed: a ceiling check never treats an unknown price as zero.
 */
export class PriceNotAvailableError extends CostsError {
  override readonly category = 'validation';

  constructor(
    readonly subject: PriceSubject,
    readonly priceTableVersion: string,
  ) {
    const label = subject.kind === 'model' ? `model ${subject.modelId}` : `provider ${subject.provider}`;
    super(`Price table ${priceTableVersion} has no price for ${label}; add it to the price table before using it live`);
    this.name = 'PriceNotAvailableError';
  }
}

/** The recorded USD of a session differs from what the price table gives for its quantities. */
export class CostSessionPriceMismatchError extends CostsError {
  override readonly category = 'validation';

  constructor(
    readonly sessionId: string,
    readonly callIndex: number,
  ) {
    super(`Cost session ${sessionId}#${callIndex} is not priced by the current price table`);
    this.name = 'CostSessionPriceMismatchError';
  }
}

/** The same (sessionId, callIndex) was recorded twice with different content. */
export class CostSessionConflictError extends CostsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly sessionId: string,
    readonly callIndex: number,
  ) {
    super(`Run ${runId} already records cost session ${sessionId}#${callIndex} with different values`);
    this.name = 'CostSessionConflictError';
  }
}

/** cost.json names another run than the one being recorded or indexed. */
export class CostFileRunMismatchError extends CostsError {
  override readonly category = 'conflict';

  constructor(
    readonly expectedRunId: string,
    readonly foundRunId: string,
  ) {
    super(`cost.json of run ${expectedRunId} belongs to run ${foundRunId}`);
    this.name = 'CostFileRunMismatchError';
  }
}

/**
 * cost.json was priced with another price-table version. Mixing versions in one file would make
 * `priceTableVersion` false, so the session is refused and the owner decides (resume after an
 * upgrade of the table).
 */
export class PriceTableVersionMismatchError extends CostsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly fileVersion: string,
    readonly tableVersion: string,
  ) {
    super(`Run ${runId} was priced with table ${fileVersion}; the current table is ${tableVersion}`);
    this.name = 'PriceTableVersionMismatchError';
  }
}

/** `curations/<id>/cost.json` names another curation than the one being recorded or indexed. */
export class CostFileCurationMismatchError extends CostsError {
  override readonly category = 'conflict';

  constructor(
    readonly expectedCurationId: string,
    readonly foundCurationId: string,
  ) {
    super(`cost.json of curation ${expectedCurationId} belongs to curation ${foundCurationId}`);
    this.name = 'CostFileCurationMismatchError';
  }
}

export type MonthToDateFailureReason =
  | 'too-many-runs'
  | 'unreadable-cost-file'
  | 'too-many-entries'
  | 'too-many-curations'
  | 'unreadable-curation-cost-file';

/**
 * Month-to-date spend could not be computed. Fails closed: the ceiling check cannot pass on an
 * unknown spend (criterion 28). `runId` names the run, or for the two curation reasons the
 * curation (SPEC 0005 section 5.8), whose cost.json could not be read.
 */
export class MonthToDateUnavailableError extends CostsError {
  override readonly category = 'dependency';

  constructor(
    readonly reason: MonthToDateFailureReason,
    readonly runId: string | null,
  ) {
    const folderKind = reason === 'unreadable-curation-cost-file' ? 'curation' : 'run';
    super(`Month-to-date spend is unavailable (${reason}${runId === null ? '' : `, ${folderKind} ${runId}`})`);
    this.name = 'MonthToDateUnavailableError';
  }
}
