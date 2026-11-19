import { Injectable } from '@nestjs/common';
import { Prisma, type RecipeVersion as RecipeVersionRow } from '@prisma/client';
import { type AssetStatus } from '@studio/shared/catalog';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;

export interface RecipeVersionFilter {
  recipeId: string | null;
  statuses: readonly AssetStatus[] | null;
}

export interface RecipeKeysetPage {
  /** Row id after which the page starts; null for the first page. */
  afterRowId: number | null;
  limit: number;
}

export interface RecipeRowPage {
  rows: RecipeVersionRow[];
  /** Rows matching the filter, ignoring the page position. */
  total: number;
  hasMore: boolean;
}

function filterWhere(filter: RecipeVersionFilter): Prisma.RecipeVersionWhereInput {
  const conditions: Prisma.RecipeVersionWhereInput[] = [];
  if (filter.recipeId !== null) conditions.push({ recipeId: filter.recipeId });
  if (filter.statuses !== null) conditions.push({ status: { in: [...filter.statuses] } });
  return { AND: conditions };
}

/** Data access for `recipes` and `recipe_versions` only; handlers own transactions. */
@Injectable()
export class RecipeVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recipeExists(recipeId: string, db: Db = this.prisma): Promise<boolean> {
    return (await db.recipe.findUnique({ where: { id: recipeId }, select: { id: true } })) !== null;
  }

  async createRecipe(recipeId: string, db: Db): Promise<void> {
    await db.recipe.create({ data: { id: recipeId } });
  }

  async insertVersion(data: Prisma.RecipeVersionUncheckedCreateInput, db: Db): Promise<RecipeVersionRow> {
    return db.recipeVersion.create({ data });
  }

  async findVersion(recipeId: string, version: number, db: Db = this.prisma): Promise<RecipeVersionRow | null> {
    return db.recipeVersion.findUnique({ where: { recipeId_version: { recipeId, version } } });
  }

  async findLatestVersionNumber(recipeId: string, db: Db = this.prisma): Promise<number> {
    const latest = await db.recipeVersion.findFirst({ where: { recipeId }, orderBy: { version: 'desc' }, select: { version: true } });
    return latest?.version ?? 0;
  }

  async findActiveVersion(recipeId: string, db: Db = this.prisma): Promise<RecipeVersionRow | null> {
    return db.recipeVersion.findFirst({ where: { recipeId, status: 'active' } });
  }

  /** Changes `status` only; the immutability trigger refuses any other column change. */
  async updateStatus(rowId: number, status: AssetStatus, db: Db): Promise<RecipeVersionRow> {
    return db.recipeVersion.update({ where: { id: rowId }, data: { status } });
  }

  async listVersions(filter: RecipeVersionFilter, page: RecipeKeysetPage): Promise<RecipeRowPage> {
    const where = filterWhere(filter);
    const pageWhere: Prisma.RecipeVersionWhereInput =
      page.afterRowId === null ? where : { AND: [where, { id: { gt: page.afterRowId } }] };
    // One extra row tells whether another page exists without a second query.
    const [rows, total] = await Promise.all([
      this.prisma.recipeVersion.findMany({ where: pageWhere, orderBy: { id: 'asc' }, take: page.limit + 1 }),
      this.prisma.recipeVersion.count({ where }),
    ]);
    return { rows: rows.slice(0, page.limit), total, hasMore: rows.length > page.limit };
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
