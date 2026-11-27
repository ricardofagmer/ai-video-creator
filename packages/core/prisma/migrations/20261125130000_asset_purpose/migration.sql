-- Contract C1 delta (ADR 0012, plan C-P1): every catalog version gets a purpose text, written by the
-- asset purpose writer or by the owner. Hand-authored to match prisma/schema.prisma. Applied only by
-- `prisma migrate deploy` from scripts/install.sh / the first-run setup migrations step, after the
-- owner's scoped confirmation; no ticket executes it.
--
-- Additive only: two `ALTER TABLE ... ADD COLUMN` with defaults. No table is dropped or redefined,
-- so the earlier CHECK constraints, partial unique indexes and triggers stay exactly as the earlier
-- migrations created them. No existing row is deleted or rewritten: every existing `asset_versions`
-- row reads `purpose = ''` and `purpose_source = 'none'`, which the backfill (ticket 05) can fill.
--
-- The new columns are not listed in `asset_versions_content_immutable` (init migration), so the
-- api's copy of a done purpose job and the owner's purpose edit can change them on a saved version.
-- Every other column of a saved version stays immutable.
--
-- Down path: SQLite cannot drop the columns without redefining `asset_versions`. Recovery is
-- restoring the file copy of `db/studio.sqlite` taken before the migration runs; the columns can
-- also stay unused, since a reader that predates them never selects them.

-- AlterTable
ALTER TABLE "asset_versions" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT '' CHECK (length("purpose") <= 280);

-- AlterTable
ALTER TABLE "asset_versions" ADD COLUMN "purpose_source" TEXT NOT NULL DEFAULT 'none' CHECK ("purpose_source" IN ('none', 'ai', 'owner'));
