import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type RemovePublicationResponse } from '@studio/shared/api';
import { type Publication } from '@studio/shared/metrics';
import { PrismaService } from '../../prisma';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { PublicationHasMetricsError, PublicationNotFoundError } from '../metrics.errors';
import { RemovePublicationInputSchema, parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { RemovePublicationCommand } from './remove-publication.command';

/**
 * One transaction: the publication must belong to the run and have no snapshot, then it is
 * deleted. A publication without snapshots never moved a score, so no rescore follows.
 */
@CommandHandler(RemovePublicationCommand)
export class RemovePublicationHandler implements ICommandHandler<RemovePublicationCommand, RemovePublicationResponse> {
  private readonly logger = new Logger(RemovePublicationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
  ) {}

  async execute(command: RemovePublicationCommand): Promise<RemovePublicationResponse> {
    const input = parseMetricsInput(RemovePublicationInputSchema, command.input, '');
    const removed = await this.prisma.$transaction(async (transaction): Promise<Publication> => {
      const publication = await this.publications.findInRun(input.runId, input.publicationId, transaction);
      if (publication === null) throw new PublicationNotFoundError(input.runId, input.publicationId);
      if ((await this.snapshots.countByPublication(publication.publicationId, transaction)) > 0) {
        throw new PublicationHasMetricsError(publication.publicationId);
      }
      await this.publications.delete(publication.publicationId, transaction);
      return publication;
    });
    this.logger.log({
      event: 'metrics.publication-removed',
      runId: removed.runId,
      publicationId: removed.publicationId,
      platform: removed.platform,
      correlationId: input.correlationId,
    });
    return { runId: removed.runId, publicationId: removed.publicationId };
  }
}
