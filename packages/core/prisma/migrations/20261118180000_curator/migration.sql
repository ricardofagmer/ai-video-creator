-- Contract C8 delta (SPEC 0005 section 4.5, C5-02): the Curator. Hand-authored to match
-- prisma/schema.prisma. Applied only by `prisma migrate deploy` from scripts/install.sh, which the
-- owner runs after the scoped confirmation of SPEC 0005 section 16; no ticket executes it.
--
-- Additive only: one `CREATE TABLE`, one `CREATE INDEX` and one `ALTER TABLE ... ADD COLUMN` with a
-- default. No table is dropped or redefined, so the R1 and R2 CHECK constraints, partial unique
-- indexes and triggers stay exactly as the earlier migrations created them. No existing row is
-- deleted or rewritten: every existing `cost_entries` row reads `source_kind = 'run'`.
--
-- Down path: SQLite cannot drop the column without redefining `cost_entries` (K8). Recovery is
-- restoring the file copy of `db/studio.sqlite` taken before the migration runs; the table and the
-- column can also stay unused (SPEC 0005 section 16).

-- CreateTable: the owner's decision on a Curator proposal (topology 0004 section 6). Written by the
-- api only; read by the watcher's evidence collector for `declinedProposals`.
CREATE TABLE "curation_decisions" (
    "curation_id" TEXT NOT NULL PRIMARY KEY,
    "subject_kind" TEXT NOT NULL,
    "subject_ref" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "owner_reason" TEXT,
    "saved_ref" TEXT,
    "comparison_id" TEXT,
    "decided_by" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "decided_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CHECK ("subject_kind" IN ('prompt', 'skill', 'recipe')),
    CHECK ("decision" IN ('saved', 'declined')),
    CHECK (("decision" = 'saved') = ("saved_ref" IS NOT NULL)),
    CHECK ("decision" = 'saved' OR "comparison_id" IS NULL),
    CHECK ("decision" = 'declined' OR "owner_reason" IS NULL),
    CHECK ("owner_reason" IS NULL OR length("owner_reason") <= 300)
);

-- CreateIndex: the subject's newest declined proposals, newest first.
CREATE INDEX "curation_decisions_subject_ref_decided_at_idx" ON "curation_decisions"("subject_ref", "decided_at");

-- AlterTable: where a billed unit came from (B1). For a curation row `run_id` holds the curation id
-- and `step_key` holds `curation:call:<attempt>`.
ALTER TABLE "cost_entries" ADD COLUMN "source_kind" TEXT NOT NULL DEFAULT 'run' CHECK ("source_kind" IN ('run', 'curation'));
