import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AssetKind, type AssetStatus, type Sha256 } from '@studio/shared/catalog';
import { PrismaService } from '../prisma/prisma.service';
import { versionReadProjection, type AssetVersionRow } from './asset-version.mapper';
import {
  qualityFilterWhere,
  versionKeysetWhere,
  versionOrderBy,
  type QualityFilter,
  type VersionKeyset,
} from './asset-version.ordering';

type Db = Prisma.TransactionClient;

/** Bound on hash lookups; identical bytes across more versions than this is not a real case. */
export const MAX_VERSIONS_PER_HASH = 50;

export interface VersionSearchFilter {
  /** Lowercase words without LIKE wildcards; each must match name, summary or tags. */
  words: readonly string[];
  tags: readonly string[];
  kinds: readonly AssetKind[] | null;
  statuses: readonly AssetStatus[] | null;
  excludeBiometric: boolean;
  quality: QualityFilter;
}

export interface KeysetPage {
  /** The order and the position after which the page starts. */
  position: VersionKeyset;
  limit: number;
}

export interface RowPage {
  rows: AssetVersionRow[];
  /** Rows matching the filter, ignoring the page position. */
  total: number;
  hasMore: boolean;
}

function searchWhere(filter: VersionSearchFilter): Prisma.AssetVersionWhereInput {
  const conditions: Prisma.AssetVersionWhereInput[] = qualityFilterWhere(filter.quality);
  if (filter.statuses !== null) conditions.push({ status: { in: [...filter.statuses] } });
  if (filter.kinds !== null) conditions.push({ asset: { kind: { in: [...filter.kinds] } } });
  if (filter.excludeBiometric) conditions.push({ sensitivity: { not: 'biometric' } });
  // Tags are stored as a JSON array of TagSchema strings (no quotes inside), so `"tag"` matches
  // exactly one whole tag.
  for (const tag of filter.tags) conditions.push({ tagsJson: { contains: JSON.stringify(tag) } });
  for (const word of filter.words) {
    conditions.push({ OR: [{ name: { contains: word } }, { summary: { contains: word } }, { tagsJson: { contains: word } }] });
  }
  return { AND: conditions };
}

/**
 * Data access for `assets` and `asset_versions` only; services own transactions. Every row it
 * returns uses `versionReadProjection`, which never loads `embedding_json` (SPEC 0003 L8).
 */
@Injectable()
export class AssetVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAsset(assetId: string, db: Db = this.prisma): Promise<{ id: string; kind: string } | null> {
    return db.asset.findUnique({ where: { id: assetId }, select: { id: true, kind: true } });
  }

  async createAsset(asset: { id: string; kind: AssetKind }, db: Db): Promise<void> {
    await db.asset.create({ data: { id: asset.id, kind: asset.kind } });
  }

  async insertVersion(data: Prisma.AssetVersionUncheckedCreateInput, db: Db): Promise<AssetVersionRow> {
    return db.assetVersion.create({ data, ...versionReadProjection });
  }

  async findVersion(assetId: string, version: number, db: Db = this.prisma): Promise<AssetVersionRow | null> {
    return db.assetVersion.findUnique({ where: { assetId_version: { assetId, version } }, ...versionReadProjection });
  }

  async findLatestVersion(assetId: string, db: Db = this.prisma): Promise<AssetVersionRow | null> {
    return db.assetVersion.findFirst({ where: { assetId }, orderBy: { version: 'desc' }, ...versionReadProjection });
  }

  async findActiveVersion(assetId: string, db: Db = this.prisma): Promise<AssetVersionRow | null> {
    return db.assetVersion.findFirst({ where: { assetId, status: 'active' }, ...versionReadProjection });
  }

  async hasBiometricVersion(assetId: string, db: Db = this.prisma): Promise<boolean> {
    return (await db.assetVersion.count({ where: { assetId, sensitivity: 'biometric' } })) > 0;
  }

  /** Changes `status` only; the immutability trigger refuses any other column change. */
  async updateStatus(rowId: number, status: AssetStatus, db: Db): Promise<AssetVersionRow> {
    return db.assetVersion.update({ where: { id: rowId }, data: { status }, ...versionReadProjection });
  }

  /**
   * ADR 0012 (AP-02, AP-03): writes a done job's purpose with `purposeSource: ai` unless the owner
   * wrote the purpose. The condition is part of the UPDATE (`WHERE purpose_source <> 'owner'`), so
   * two concurrent reads copy the same text and an owner edit that lands first is never
   * overwritten. Returns how many rows changed: 1, or 0 when the row is the owner's or gone.
   */
  async copyAiPurpose(key: { assetId: string; version: number; purpose: string }, db: Db = this.prisma): Promise<number> {
    const result = await db.assetVersion.updateMany({
      where: { assetId: key.assetId, version: key.version, purposeSource: { not: 'owner' } },
      data: { purpose: key.purpose, purposeSource: 'ai' },
    });
    return result.count;
  }

  /**
   * ADR 0012 (C-P4): the owner asked for a new purpose, so the row waits for the next job
   * (`purposeSource: none`, the current text kept until the job's copy replaces it).
   */
  async clearPurposeSource(assetId: string, version: number, db: Db = this.prisma): Promise<AssetVersionRow> {
    return db.assetVersion.update({ where: { assetId_version: { assetId, version } }, data: { purposeSource: 'none' }, ...versionReadProjection });
  }

  /**
   * ADR 0012 (C-P4, AP-03): the owner's purpose text, `purposeSource: owner`. Only the two purpose
   * columns change; the immutability trigger leaves them writable on a saved version. Null when the
   * version does not exist, so the caller answers its own not-found error.
   */
  async setOwnerPurpose(key: { assetId: string; version: number; purpose: string }, db: Db = this.prisma): Promise<AssetVersionRow | null> {
    const result = await db.assetVersion.updateMany({
      where: { assetId: key.assetId, version: key.version },
      data: { purpose: key.purpose, purposeSource: 'owner' },
    });
    if (result.count === 0) return null;
    return this.findVersion(key.assetId, key.version, db);
  }

  async listVersions(assetId: string, quality: QualityFilter, page: KeysetPage): Promise<RowPage> {
    const where: Prisma.AssetVersionWhereInput = { AND: [{ assetId }, ...qualityFilterWhere(quality)] };
    return this.page(where, page);
  }

  async findByContentHash(contentHash: Sha256): Promise<AssetVersionRow[]> {
    return this.prisma.assetVersion.findMany({
      where: { contentHash },
      orderBy: { id: 'asc' },
      take: MAX_VERSIONS_PER_HASH,
      ...versionReadProjection,
    });
  }

  async search(filter: VersionSearchFilter, page: KeysetPage): Promise<RowPage> {
    return this.page(searchWhere(filter), page);
  }

  private async page(where: Prisma.AssetVersionWhereInput, page: KeysetPage): Promise<RowPage> {
    const after = versionKeysetWhere(page.position);
    const pageWhere: Prisma.AssetVersionWhereInput = after === null ? where : { AND: [where, after] };
    // One extra row tells whether another page exists without a second query.
    const [rows, total] = await Promise.all([
      this.prisma.assetVersion.findMany({
        where: pageWhere,
        orderBy: versionOrderBy(page.position.sort),
        take: page.limit + 1,
        ...versionReadProjection,
      }),
      this.prisma.assetVersion.count({ where }),
    ]);
    return { rows: rows.slice(0, page.limit), total, hasMore: rows.length > page.limit };
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
