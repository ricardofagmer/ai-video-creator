import { type PublicationAttempt } from '@prisma/client';
import { type PublishMetadata } from '@studio/shared/platforms';
import { publishMetadataSha256 } from '@studio/shared/platforms/files';
import { z } from 'zod';
import { PlatformRowCorruptError } from '../platforms.errors';
import { type RequestPublishFields } from '../platforms.input';

const StoredBiometricRefsSchema = z.array(z.string());

/**
 * Where the stored body's title, caption, tags, visibility and AI disclosure are read from: the
 * row's `metadata_sha256` (finding F-3), else the attempt's `request.json` for a row written before
 * the column existed, else nowhere (`request.json` missing or unreadable).
 */
export type StoredMetadata =
  | { source: 'row-hash'; sha256: string }
  | { source: 'request-file'; metadata: PublishMetadata }
  | { source: 'unavailable' };

/** `changed`: a reused key with another body (409). `not-comparable`: the stored body cannot be read (also 409). */
export type StoredRequestComparison = 'same' | 'changed' | 'not-comparable';

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const known = new Set(left);
  return known.size === new Set(right).size && right.every((value) => known.has(value));
}

function sameMetadata(stored: PublishMetadata, sent: PublishMetadata): boolean {
  return (
    stored.title === sent.title &&
    stored.caption === sent.caption &&
    sameStrings(stored.tags, sent.tags) &&
    stored.visibility === sent.visibility &&
    stored.aiDisclosure === sent.aiDisclosure
  );
}

function storedBiometricRefs(row: PublicationAttempt): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.biometricRefsJson);
  } catch {
    throw new PlatformRowCorruptError(row.id);
  }
  const refs = StoredBiometricRefsSchema.safeParse(parsed);
  if (!refs.success) throw new PlatformRowCorruptError(row.id);
  return refs.data;
}

/**
 * Finding C9 (SPEC 0007 section 5.4 step 2): a repeated `idempotencyKey` returns the stored attempt
 * only when the body is the one that created it: same run, platform, artifact, biometric set,
 * visibility, AI disclosure, and title, caption and tags (through `metadata_sha256`, finding F-3,
 * or `request.json` for an older row). Finding R4: the connection is not compared, since the body
 * does not carry it; a stored body that cannot be read is `not-comparable`, never a match (the
 * handler refuses it as key-reused, round 3).
 */
export function compareStoredRequest(
  fields: RequestPublishFields,
  stored: { row: PublicationAttempt; metadata: StoredMetadata },
): StoredRequestComparison {
  const { row, metadata } = stored;
  const { request } = fields;
  if (row.runId !== fields.runId || row.platform !== fields.platform) return 'changed';
  if (row.artifactSha256 !== request.artifactSha256) return 'changed';
  if (row.visibility !== request.metadata.visibility || row.aiDisclosure !== request.metadata.aiDisclosure) return 'changed';
  if (!sameSet(storedBiometricRefs(row), request.biometricRefs)) return 'changed';
  if (metadata.source === 'unavailable') return 'not-comparable';
  const same =
    metadata.source === 'row-hash'
      ? metadata.sha256 === publishMetadataSha256(request.metadata)
      : sameMetadata(metadata.metadata, request.metadata);
  return same ? 'same' : 'changed';
}
