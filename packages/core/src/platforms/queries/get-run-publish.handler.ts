import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  type ApiRev7ErrorReason,
  type PublishBiometricAssetView,
  type PublishPlatformView,
  type RunPublishView,
} from '@studio/shared/api';
import { allowedVisibilities, publicationLineBounds, PlatformSchema, type Platform } from '@studio/shared/platforms';
import { readRunPublicationLines } from '@studio/shared/run-files';
import { RunIdSchema, type RunId } from '@studio/shared/run-format';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformRefusedError } from '../platforms.errors';
import { parsePlatformInput } from '../platforms.input';
import { PlatformStatusReader, type PlatformSnapshot } from '../platform-status.reader';
import { toPublishAttemptView } from '../publish/publication-attempt.mapper';
import { PublicationAttemptRepository } from '../publish/publication-attempt.repository';
import { RunBiometricAssets } from '../publish/run-biometric-assets';
import { RunPublishFacts } from '../publish/run-publish-facts';
import { PublishFileReader } from '../stores/publish-file.reader';
import { GetRunPublishQuery } from './platform.queries';

/** The run-wide facts every tab's eligibility reads. */
interface RunFacts {
  approved: boolean;
  artifactPresent: boolean;
  /** `publish-sensitivity-unknown` when the biometric set could not be derived. */
  biometricRefusal: ApiRev7ErrorReason | null;
  openPlatforms: ReadonlySet<string>;
}

/**
 * `GET /runs/:runId/publish` (SPEC 0007 section 5.4 "The dialog"). Read-only; the api runs
 * `SyncPublishAttemptsCommand` first. Each tab says whether a click would pass steps 3 to 7 now and,
 * when not, the first refusal in step order. The artifact carries the manifest's hash (the dialog
 * sends it back as `artifactSha256`; step 5 re-hashes the file). No title, caption, tag, URL or path.
 */
@QueryHandler(GetRunPublishQuery)
export class GetRunPublishHandler implements IQueryHandler<GetRunPublishQuery, RunPublishView> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusReader: PlatformStatusReader,
    private readonly facts: RunPublishFacts,
    private readonly biometric: RunBiometricAssets,
    private readonly attempts: PublicationAttemptRepository,
    private readonly publishFiles: PublishFileReader,
  ) {}

  async execute(query: GetRunPublishQuery): Promise<RunPublishView> {
    const runId: RunId = parsePlatformInput(RunIdSchema, query.runId, 'runId');
    const runDir = this.facts.runDirOf(runId);
    const approval = await this.facts.approval(runId);
    const video = await this.facts.finalVideo(runId);
    const biometric = await this.biometricAssets(runId, runDir);
    const recent = await this.attempts.listRecent(runId);
    const openPlatforms = new Set((await this.attempts.listOpen(runId)).map((row) => row.platform));
    const runFacts: RunFacts = {
      approved: approval.status === 'approved',
      artifactPresent: video.status === 'present',
      biometricRefusal: biometric.status === 'unknown' ? 'publish-sensitivity-unknown' : null,
      openPlatforms,
    };
    const platforms: PublishPlatformView[] = [];
    for (const platform of PlatformSchema.options) platforms.push(await this.platformTab(runId, platform, runFacts));
    const attempts: RunPublishView['attempts'] = [];
    for (const row of recent) attempts.push(toPublishAttemptView(row, await this.publishFiles.readState(row.id)));
    const lines = await readRunPublicationLines(runDir);
    return {
      runId,
      approved: runFacts.approved,
      artifact: video.status === 'present' ? { sha256: video.video.manifestSha256, sizeBytes: video.video.sizeBytes } : null,
      biometricAssets: biometric.status === 'known' ? biometric.assets : [],
      platforms,
      attempts,
      leftTheMachine: lines.entries.slice(-publicationLineBounds.linesShown),
    };
  }

  private async biometricAssets(
    runId: RunId,
    runDir: string,
  ): Promise<{ status: 'known'; assets: PublishBiometricAssetView[] } | { status: 'unknown' }> {
    try {
      return { status: 'known', assets: await this.biometric.derive({ runId, runDir }) };
    } catch (error) {
      if (error instanceof PlatformRefusedError && error.reason === 'publish-sensitivity-unknown') return { status: 'unknown' };
      throw error;
    }
  }

  private async platformTab(runId: RunId, platform: Platform, runFacts: RunFacts): Promise<PublishPlatformView> {
    const snapshot = await this.statusReader.snapshot(platform);
    const publication = await this.prisma.runPublication.findFirst({
      where: { runId, platform, origin: { in: ['studio', 'mock'] } },
      select: { id: true },
    });
    // A `published` attempt whose link is still pending counts as published too (step 7).
    const published = publication !== null || (await this.attempts.hasStudioPublication(runId, platform));
    const refusal = this.refusalOf({ snapshot, runFacts, platform, published });
    return {
      platform,
      mode: snapshot.mode,
      status: snapshot.status.publish,
      eligible: refusal === null,
      refusal,
      allowedVisibilities: [...allowedVisibilities[platform]],
      publicationId: publication === null ? null : publication.id,
    };
  }

  /** The first refusal a click would meet now, in section 5.4 step order; null when eligible. */
  private refusalOf(options: {
    snapshot: PlatformSnapshot;
    runFacts: RunFacts;
    platform: Platform;
    published: boolean;
  }): ApiRev7ErrorReason | null {
    const { snapshot, runFacts, platform } = options;
    const status = snapshot.status.publish;
    if (status === 'unsupported') return 'platform-publish-unsupported';
    if (status === 'awaiting-review') return 'platform-awaiting-review';
    if (status === 'not-configured') return 'platform-not-configured';
    if (status === 'disconnected') return 'platform-not-connected';
    if (status === 'needs-reconnect') return 'platform-needs-reconnect';
    if (snapshot.account === null || snapshot.account.mode !== snapshot.mode) return 'platform-mode-mismatch';
    if (!runFacts.approved) return 'publish-run-not-approved';
    if (!runFacts.artifactPresent) return 'publish-artifact-missing';
    if (runFacts.biometricRefusal !== null) return runFacts.biometricRefusal;
    if (options.published) return 'publish-already-published';
    if (runFacts.openPlatforms.has(platform)) return 'publish-already-in-progress';
    return null;
  }
}
