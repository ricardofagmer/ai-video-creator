import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@studio/core/prisma';
import { type PublishAttemptId, type PublishRequestFile, type PublishState } from '@studio/shared/platforms';
import { publishMetadataSha256 } from '@studio/shared/platforms/files';
import { z } from 'zod';

/** The `publication_attempts` columns a `request.json` must agree with (finding S3). */
export interface PublicationAttemptRow {
  state: string;
  runId: string;
  platform: string;
  connectionId: string;
  mode: string;
  artifactSha256: string;
  artifactBytes: bigint;
  visibility: string;
  aiDisclosure: boolean;
  /** `publishMetadataSha256` of the metadata the api recorded; null on rows written before finding F-3. */
  metadataSha256: string | null;
  biometricRefsJson: string;
  biometricConfirmedAt: Date;
  approvalDecidedAt: Date;
  expiresAt: Date;
}

/** The first field where `request.json` and its row disagree; a field name only, never a value. */
export type AttemptRowMismatch =
  | 'row-missing'
  | 'state'
  | 'run'
  | 'platform'
  | 'connection'
  | 'mode'
  | 'artifact'
  | 'metadata'
  | 'biometric'
  | 'approval'
  | 'expiry';

/** A withdrawn attempt of the same run and platform, by its row id. */
export interface WithdrawnAttemptRow {
  id: string;
}

/**
 * Finding R2, the same rows core `RequestPublish` step 7 reads: a withdrawn row the sync may not
 * have reconciled with its `state.json` yet (finding C4, deferred while this attempt is the open one).
 */
const WITHDRAWN_ROW_STATES: PublishState[] = ['cancelled', 'expired'];

/** Newest first; each attempt is one owner click, so one run and platform never come near this many. */
const WITHDRAWN_ROWS_READ = 100;

const BiometricRefsJsonSchema = z.array(z.string());

function biometricRefsOf(json: string): Set<string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const refs = BiometricRefsJsonSchema.safeParse(parsed);
  return refs.success ? new Set(refs.data) : null;
}

function sameRefs(rowJson: string, requestRefs: readonly string[]): boolean {
  const rowRefs = biometricRefsOf(rowJson);
  const sentRefs = new Set(requestRefs);
  return rowRefs !== null && rowRefs.size === sentRefs.size && [...rowRefs].every((ref) => sentRefs.has(ref));
}

/**
 * Whether `request.json` is the request the api recorded (SPEC 0007 section 5.5 step 8, findings
 * S3 and F-3): the row exists, is still `queued`, and agrees on run, platform, connection, mode,
 * artifact, metadata, the confirmed biometric set, the approval and the expiry. Metadata is
 * compared twice: the visibility and AI disclosure columns, and `metadata_sha256` against
 * `publishMetadataSha256(request.json metadata)`, which covers the title, caption and tags SQLite
 * never stores in clear. A null hash (a row older than the column) is not comparable and refuses.
 * A file edited outside the api is never uploaded.
 */
export function attemptRowMismatch(row: PublicationAttemptRow | null, request: PublishRequestFile): AttemptRowMismatch | null {
  if (row === null) return 'row-missing';
  if (row.state !== 'queued') return 'state';
  if (row.runId !== request.runId) return 'run';
  if (row.platform !== request.platform) return 'platform';
  if (row.connectionId !== request.connectionId) return 'connection';
  if (row.mode !== request.mode) return 'mode';
  if (row.artifactSha256 !== request.artifact.sha256 || row.artifactBytes !== BigInt(request.artifact.sizeBytes)) return 'artifact';
  if (row.visibility !== request.metadata.visibility || row.aiDisclosure !== request.metadata.aiDisclosure) return 'metadata';
  if (row.metadataSha256 === null || row.metadataSha256 !== publishMetadataSha256(request.metadata)) return 'metadata';
  if (!sameRefs(row.biometricRefsJson, request.biometric.refs) || row.biometricConfirmedAt.getTime() !== Date.parse(request.biometric.confirmedAt)) {
    return 'biometric';
  }
  if (row.approvalDecidedAt.getTime() !== Date.parse(request.approvalDecidedAt)) return 'approval';
  if (row.expiresAt.getTime() !== Date.parse(request.expiresAt)) return 'expiry';
  return null;
}

/**
 * One `publication_attempts` row by attempt id, read-only (K1: the watcher reads SQLite and never
 * writes it; no Prisma write exists in the watcher, AC 57).
 */
@Injectable()
export class PublicationAttemptReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async rowOf(attemptId: PublishAttemptId): Promise<PublicationAttemptRow | null> {
    return this.prisma.publicationAttempt.findUnique({
      where: { id: attemptId },
      select: {
        state: true,
        runId: true,
        platform: true,
        connectionId: true,
        mode: true,
        artifactSha256: true,
        artifactBytes: true,
        visibility: true,
        aiDisclosure: true,
        metadataSha256: true,
        biometricRefsJson: true,
        biometricConfirmedAt: true,
        approvalDecidedAt: true,
        expiresAt: true,
      },
    });
  }

  /**
   * The `cancelled` or `expired` attempts of the request's run and platform whose row changed at or
   * after `since`, other than the request's own (finding R2).
   */
  async recentlyWithdrawnOf(request: Pick<PublishRequestFile, 'attemptId' | 'runId' | 'platform'>, since: Date): Promise<WithdrawnAttemptRow[]> {
    return this.prisma.publicationAttempt.findMany({
      where: {
        runId: request.runId,
        platform: request.platform,
        id: { not: request.attemptId },
        state: { in: WITHDRAWN_ROW_STATES },
        updatedAt: { gte: since },
      },
      select: { id: true },
      orderBy: { id: 'desc' },
      take: WITHDRAWN_ROWS_READ,
    });
  }
}
