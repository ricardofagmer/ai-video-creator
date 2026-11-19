-- Contract C8 delta (SPEC 0006 section 4.4, R3-AC-07): the platform sample size recorded with each
-- promotion approval. Hand-authored to match prisma/schema.prisma. Applied only by
-- `prisma migrate deploy` from scripts/install.sh, which the owner runs after the scoped
-- confirmation of SPEC 0006 section 16; no ticket executes it.
--
-- Additive only (K8): one `ALTER TABLE ... ADD COLUMN`, nullable, with no default and no backfill.
-- No table is dropped or redefined, so the R2 CHECK constraints and the append-only triggers
-- `promotion_approvals_never_updated` / `promotion_approvals_never_deleted` stay exactly as the R2
-- migration created them. No existing row is rewritten: every existing approval reads
-- `platform_sample_size_at_approval = NULL`, which the view returns as `null` ("not recorded")
-- rather than inventing a figure the owner never saw at approval time.
--
-- Down path: SQLite cannot drop the column without redefining `promotion_approvals` (K8). Recovery is
-- restoring the file copy of `db/studio.sqlite` taken before the migration runs; the column can also
-- stay unused (SPEC 0006 section 16).

-- AlterTable: the version's `quality_platform_sample_size` at approval; NULL for legacy approvals
-- and for recipe versions, which carry no platform figure.
ALTER TABLE "promotion_approvals" ADD COLUMN "platform_sample_size_at_approval" INTEGER;
