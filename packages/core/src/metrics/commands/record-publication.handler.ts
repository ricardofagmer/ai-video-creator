import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PublicationView } from '@studio/shared/api';
import { metricsBounds, parsePublicationUrl } from '@studio/shared/metrics';
import { newUlid } from '@studio/shared/run-files';
import { PrismaService } from '../../prisma';
import { QualityScoreService } from '../../quality';
import {
  PublicationAlreadyLinkedError,
  PublicationLimitReachedError,
  PublicationRunNotApprovedError,
  PublicationUrlRefusedError,
} from '../metrics.errors';
import { RecordPublicationInputSchema, parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository, isUniqueConstraintError, type NewPublication } from '../run-publication.repository';
import { RecordPublicationCommand } from './record-publication.command';

/**
 * Order of SPEC 0006 section 5.1, first failure refuses and nothing is written: the URL through
 * `parsePublicationUrl`; then, in one transaction, an `approved` outcome row, at most 5
 * publications on the run, and the video not linked to a run yet; then the insert. The rescore runs
 * after the commit (section 5.4); it changes nothing until the publication has a snapshot.
 */
@CommandHandler(RecordPublicationCommand)
export class RecordPublicationHandler implements ICommandHandler<RecordPublicationCommand, PublicationView> {
  private readonly logger = new Logger(RecordPublicationHandler.name);
  /** Publications are recorded one at a time in this process, so a double click cannot pass the limit. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly quality: QualityScoreService,
  ) {}

  async execute(command: RecordPublicationCommand): Promise<PublicationView> {
    const input = parseMetricsInput(RecordPublicationInputSchema, command.input, '');
    const parsed = parsePublicationUrl(input.request.url);
    if (parsed.status === 'refused') throw new PublicationUrlRefusedError(parsed.reason);
    const now = new Date();
    const candidate: NewPublication = {
      publicationId: newUlid(now.getTime()),
      runId: input.runId,
      platform: parsed.platform,
      platformVideoId: parsed.platformVideoId,
      url: parsed.url,
      publishedOn: input.request.publishedOn ?? null,
      recordedBy: input.recordedBy,
      correlationId: input.correlationId,
      recordedAt: now,
    };
    const run = this.tail.then(() => this.insert(candidate));
    // The chain only orders the writes; each caller still receives its own result or error.
    this.tail = run.catch(() => undefined);
    const publication = await run;
    // Ids and the platform only: never the URL or the video id (section 7).
    this.logger.log({
      event: 'metrics.publication-recorded',
      runId: publication.runId,
      publicationId: publication.publicationId,
      platform: publication.platform,
      correlationId: input.correlationId,
    });
    await this.quality.recomputeAfterMetrics({ change: 'publication-recorded', correlationId: input.correlationId });
    return publication;
  }

  private async insert(candidate: NewPublication): Promise<PublicationView> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if ((await this.publications.findOutcomeDecision(candidate.runId, transaction)) !== 'approved') {
          throw new PublicationRunNotApprovedError(candidate.runId);
        }
        if ((await this.publications.countByRun(candidate.runId, transaction)) >= metricsBounds.maxPublicationsPerRun) {
          throw new PublicationLimitReachedError(candidate.runId, metricsBounds.maxPublicationsPerRun);
        }
        if ((await this.publications.findLinkedRunId(candidate.platform, candidate.platformVideoId, transaction)) !== null) {
          throw new PublicationAlreadyLinkedError(candidate.platform);
        }
        return this.publications.insert(candidate, transaction);
      });
    } catch (error) {
      // Another process (the CLI) linked the same video between the check and the insert.
      if (isUniqueConstraintError(error)) throw new PublicationAlreadyLinkedError(candidate.platform);
      throw error;
    }
  }
}
