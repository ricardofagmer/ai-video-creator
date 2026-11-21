import { Inject, Injectable } from '@nestjs/common';
import { type PublicationAttempt } from '@prisma/client';
import { metricsBounds, parsePublicationUrl, type Platform } from '@studio/shared/metrics';
import { type PublishStateFile } from '@studio/shared/platforms';
import { newUlid } from '@studio/shared/run-files';
import { type PrismaTransaction } from '../../prisma';
import { PLATFORM_CLIENTS, type PlatformClients } from '../clients/platform-client.registry';
import { PlatformRefusedError } from '../platforms.errors';
import { localDateOf } from '../platform-runtime';
import { AccountStore } from '../stores/platform-file.stores';

/** Why a `published` attempt could not be linked to a `run_publications` row yet. */
export type LinkSkipReason = 'url-not-buildable' | 'client-unavailable' | 'run-publication-limit' | 'video-already-linked';

/** The canonical URL of a published attempt, checked by `parsePublicationUrl`, or why there is none. */
export type PublicationUrlPlan = { status: 'ready'; platformVideoId: string; url: string } | { status: 'skipped'; reason: LinkSkipReason };

export type LinkResult = { status: 'linked'; publicationId: string } | { status: 'skipped'; reason: LinkSkipReason };

/**
 * Inserts the `run_publications` row of a `published` attempt (SPEC 0007 section 5.4 "Result"):
 * origin `studio` (`mock` for a mock attempt), `attempt_id`, the platform video id checked against
 * `platformVideoIdPatterns` through `parsePublicationUrl`, the canonical URL it rebuilds,
 * `platform_media_id`, `published_on` the local date of `publishedAt`, `recorded_by` the requester.
 * The run's limit of 5 publications and the unique video id still hold; a link that cannot be made
 * leaves the attempt `published` without a publication, and the owner may paste the link (R3).
 */
@Injectable()
export class PublicationLinker {
  constructor(
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    private readonly accounts: AccountStore,
  ) {}

  /**
   * Built outside the transaction: it reads `account.json` for a TikTok handle. A link the watcher
   * stored from the platform's own answer (`state.json` `publicationUrl`, wave 4) is used first,
   * after the same `parsePublicationUrl` check; otherwise the client rebuilds the link.
   */
  async planUrl(platform: Platform, platformVideoId: string, storedUrl: string | null = null): Promise<PublicationUrlPlan> {
    if (storedUrl !== null) {
      const stored = parsePublicationUrl(storedUrl);
      if (stored.status === 'recognized' && stored.platform === platform && stored.platformVideoId === platformVideoId) {
        return { status: 'ready', platformVideoId: stored.platformVideoId, url: stored.url };
      }
    }
    let built: string | null;
    try {
      const account = await this.accounts.read(platform);
      const accountLabel = account === null ? '' : account.accountLabel;
      built = this.clients.clientFor(platform).publicationUrl({ platformVideoId, accountLabel });
    } catch (error) {
      // Live mode with no delivered client cannot rebuild a URL; the attempt stays unlinked.
      if (error instanceof PlatformRefusedError) return { status: 'skipped', reason: 'client-unavailable' };
      throw error;
    }
    if (built === null) return { status: 'skipped', reason: 'url-not-buildable' };
    const parsed = parsePublicationUrl(built);
    if (parsed.status !== 'recognized' || parsed.platform !== platform || parsed.platformVideoId !== platformVideoId) {
      return { status: 'skipped', reason: 'url-not-buildable' };
    }
    return { status: 'ready', platformVideoId: parsed.platformVideoId, url: parsed.url };
  }

  /** Inside the caller's transaction, after the attempt row moved to `published`. */
  async link(
    options: { attempt: PublicationAttempt; state: PublishStateFile; plan: PublicationUrlPlan; now: Date },
    tx: PrismaTransaction,
  ): Promise<LinkResult> {
    const { attempt, state, plan, now } = options;
    if (plan.status === 'skipped') return plan;
    if ((await tx.runPublication.count({ where: { runId: attempt.runId } })) >= metricsBounds.maxPublicationsPerRun) {
      return { status: 'skipped', reason: 'run-publication-limit' };
    }
    const linked = await tx.runPublication.findFirst({
      where: { platform: attempt.platform, platformVideoId: plan.platformVideoId },
      select: { id: true },
    });
    if (linked !== null) return { status: 'skipped', reason: 'video-already-linked' };
    const publicationId = newUlid(now.getTime());
    await tx.runPublication.create({
      data: {
        id: publicationId,
        runId: attempt.runId,
        platform: attempt.platform,
        platformVideoId: plan.platformVideoId,
        url: plan.url,
        publishedOn: state.publishedAt === null ? null : localDateOf(new Date(state.publishedAt)),
        recordedBy: attempt.requestedBy,
        correlationId: attempt.correlationId,
        recordedAt: now,
        origin: attempt.mode === 'mock' ? 'mock' : 'studio',
        attemptId: attempt.id,
        platformMediaId: state.platformMediaId,
      },
    });
    await tx.publicationAttempt.update({ where: { id: attempt.id }, data: { publicationId } });
    return { status: 'linked', publicationId };
  }
}
