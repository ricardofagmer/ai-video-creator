import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AssetPurposeWriterCallError, renderAssetPurposeMessage } from '@studio/core/agents';
import { AssetVersionNotFoundError } from '@studio/core/catalog';
import { ProviderModeService } from '@studio/core/providers';
import { RedactorService } from '@studio/core/redaction';
import { assetPurposeBounds, type AssetPurposeJobFile } from '@studio/shared/asset-jobs';
import { appendAssetJobEgress, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetVersion } from '@studio/shared/catalog';
import {
  type AssetPurposeWriterInput,
  type AssetPurposeWriterPort,
  type AssetPurposeWriterResult,
  type AssetResolverPort,
  type ReferenceAnalysisReaderPort,
  type UsageQuantity,
} from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { type SessionId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { ASSET_RESOLVER } from '../engine/engine.tokens';
import { CatalogLookup } from '../stages/shared/catalog-lookup';
import { failedJob, refusedJob, type AssetJobEnding, type AssetJobRefusedCode } from './asset-job-file.mapper';
import { type AssetJobSignals } from './asset-job-signals';
import { AssetJobSpend } from './asset-job-spend';
import { ASSET_JOBS_CLOCK, ASSET_PURPOSE_WRITER, REFERENCE_ANALYSIS_READER } from './asset-jobs.tokens';
import { AssetPurposeContentReader } from './asset-purpose.content';
import { purposeInput } from './asset-purpose.input';
import { type AssetPurposeHandlerPort, type ClaimedAssetJob } from './claimed-asset-job';

/**
 * Asset purposes (ADR 0012). Order:
 * 1. resolve the version read-only (missing -> `failed` / `asset-missing`);
 * 2. build the model input (C-P6): a biometric row sends its name, kind and tags only (AP-05) and
 *    nothing of it is read; every other row sends its metadata plus its readable content (AP-06,
 *    `AssetPurposeContentReader`): bounded entry text, one stored image or a done analysis;
 * 3. live only: check the month ceiling with `worstCaseUsd` (skipped under the Claude Code engine,
 *    whose calls are priced 0) and write the egress line (`claude`, `purpose-text`, amount = the
 *    characters of the rendered message). Mock mode skips both (AP-07);
 * 4. call `write` once and record any billed usage, returned or thrown, before the ending;
 * 5. `ok` -> `done` (`mode`, `promptVersion`, `purpose`); `failed` -> `failed` with the same code;
 *    `AssetPurposeWriterCallError` -> the closest code (see `callErrorEnding`).
 * The step writes only `job.json`, `egress.jsonl` and `cost.json`; the api copies the purpose into
 * SQLite on its next read (ADR 0003). Logs carry the ref, counts, amounts and codes only.
 */
@Injectable()
export class AssetPurposeHandler implements AssetPurposeHandlerPort {
  private readonly logger = new Logger(AssetPurposeHandler.name);
  private readonly catalog: CatalogLookup;
  private readonly contents: AssetPurposeContentReader;

  constructor(
    @Inject(QueryBus) queries: QueryBus,
    @Inject(ASSET_PURPOSE_WRITER) private readonly writer: AssetPurposeWriterPort,
    @Inject(ProviderModeService) private readonly modes: ProviderModeService,
    @Inject(AssetJobSpend) private readonly spend: AssetJobSpend,
    @Inject(ASSET_JOBS_CLOCK) private readonly clock: Clock,
    @Inject(ASSET_RESOLVER) assets: AssetResolverPort,
    @Inject(REFERENCE_ANALYSIS_READER) analyses: ReferenceAnalysisReaderPort,
    @Inject(RedactorService) redactor: RedactorService,
  ) {
    this.catalog = new CatalogLookup(queries);
    this.contents = new AssetPurposeContentReader({ queries, assets, analyses, redactor });
  }

  async handle(job: ClaimedAssetJob<AssetPurposeJobFile>, signals: AssetJobSignals): Promise<AssetJobEnding> {
    const { location } = job;
    const version = await this.lookup(location);
    if (version === null) return failedJob('asset-missing');
    const content = await this.contents.read({ ref: location.ref, version, signal: signals.signal });
    const input = purposeInput(version, content);
    if (this.writer.isLive()) {
      const refusal = await this.spendRefusal(location);
      if (refusal !== null) return refusedJob(refusal);
      // An image travels beside the message (AP-06); its bytes are counted as reference frames are.
      const imageBytes = input.scope === 'metadata' && input.content.kind === 'image' ? input.content.bytes.byteLength : null;
      await appendAssetJobEgress(location, {
        at: this.clock.now().toISOString(),
        provider: 'claude',
        what: 'purpose-text',
        amount: renderAssetPurposeMessage(input).length,
        ...(imageBytes === null ? {} : { bytes: imageBytes }),
      });
    }
    signals.throwIfAborted();
    const result = await this.call(location, input, signals);
    if (result.status === 'thrown') return result.ending;
    return this.endingOf(location, result.result, input.scope);
  }

  /** Null when the call may go ahead. The Claude Code engine bills nothing, so it has no ceiling to pass. */
  private async spendRefusal(location: AssetJobLocation): Promise<AssetJobRefusedCode | null> {
    if (this.modes.usesClaudeCode()) return null;
    return this.spend.refusalFor(location, assetPurposeBounds.worstCaseUsd);
  }

  private async lookup(location: AssetJobLocation): Promise<AssetVersion | null> {
    try {
      return await this.catalog.version(location.ref);
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return null;
      throw error;
    }
  }

  private async call(
    location: AssetJobLocation,
    input: AssetPurposeWriterInput,
    signals: AssetJobSignals,
  ): Promise<{ status: 'returned'; result: AssetPurposeWriterResult } | { status: 'thrown'; ending: AssetJobEnding }> {
    try {
      return { status: 'returned', result: await this.writer.write({ ref: location.ref, input, signal: signals.signal }) };
    } catch (error) {
      if (!(error instanceof AssetPurposeWriterCallError)) throw error;
      // A cancelled live call may already have been billed: its spend is recorded before the stop is named.
      const usd = await this.recordSpend(location, error.context);
      this.logger.warn({ event: 'asset-job.purpose-call-error', ref: location.ref, kind: error.kind, usd });
      return { status: 'thrown', ending: callErrorEnding(error, signals, usd) };
    }
  }

  private async endingOf(location: AssetJobLocation, result: AssetPurposeWriterResult, scope: AssetPurposeWriterInput['scope']): Promise<AssetJobEnding> {
    const usd = await this.recordSpend(location, result);
    this.logger.log({
      event: 'asset-job.purpose-ended',
      ref: location.ref,
      outcome: result.status === 'ok' ? 'ok' : result.reason,
      mode: result.status === 'ok' ? result.mode : null,
      scope,
      usd,
    });
    if (result.status === 'failed') return failedJob(result.reason, usd);
    return { status: 'done', mode: result.mode, usd, result: { kind: 'asset-purpose', purpose: result.purpose } };
  }

  /**
   * Records what the call billed and returns the job's `usd`. A record failure is logged by
   * `AssetJobSpend.record` and the job still ends with this amount: the call is never repeated.
   */
  private async recordSpend(location: AssetJobLocation, spent: { sessionId: SessionId | null; usage: UsageQuantity | null; usd: number }): Promise<number> {
    if (spent.usage === null) return spent.usd;
    await this.spend.record(location, { sessionId: spent.sessionId ?? newSessionId(), usage: spent.usage, usd: spent.usd });
    return spent.usd;
  }
}

/**
 * - `cancelled`: the job's signal fired (the step names it from the signal); otherwise `timed-out`;
 * - `redaction-failed`: the catalog text could not be redacted, nothing was sent -> `provider-error`;
 * - `model-unpriced`: no call on an unknown price -> `refused` / `month-spend-unavailable`.
 */
function callErrorEnding(error: AssetPurposeWriterCallError, signals: AssetJobSignals, usd: number): AssetJobEnding {
  switch (error.kind) {
    case 'cancelled':
      signals.throwIfAborted();
      return failedJob('timed-out', usd);
    case 'redaction-failed':
      return failedJob('provider-error', usd);
    case 'model-unpriced':
      return refusedJob('month-spend-unavailable');
  }
}
