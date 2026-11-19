-- Contract C8 delta (SPEC 0003 section 4.4, R2-02): the R2 improvement loop. Hand-authored to
-- match prisma/schema.prisma. Applied only by `prisma migrate deploy` from scripts/install.sh,
-- which the owner runs after the scoped confirmation of SPEC 0003 section 16.
--
-- Additive only: `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` and `CREATE TRIGGER`.
-- No table is dropped or redefined, so the R1 CHECK constraints, the partial unique indexes
-- "one active version per asset/recipe" and the R1 immutability triggers stay exactly as the init
-- migration created them. No existing row is deleted or rewritten: every added column is nullable
-- or has a default, and versions already `active` keep their status with a null
-- `activation_approval_id` (B15), because the activation triggers fire on transitions only.
--
-- Down path: SQLite cannot drop these triggers and columns safely by hand. Recovery is restoring
-- the file copy of `db/studio.sqlite` taken before the migration runs (SPEC 0003 section 16).

-- ---------------------------------------------------------------------------------------------
-- Added columns (9)
-- ---------------------------------------------------------------------------------------------

-- AlterTable: the score's sample size; 0 exactly when `quality_score` is null (guarded below).
ALTER TABLE "asset_versions" ADD COLUMN "quality_sample_size" INTEGER NOT NULL DEFAULT 0 CHECK ("quality_sample_size" >= 0);

-- AlterTable
ALTER TABLE "asset_versions" ADD COLUMN "quality_scored_at" DATETIME;

-- AlterTable: the `modelRef` that produced `embedding_json` (R2-03).
ALTER TABLE "asset_versions" ADD COLUMN "embedding_model" TEXT;

-- AlterTable: sha-256 of the embedding document, so a changed document reads as `stale` (R2-03).
ALTER TABLE "asset_versions" ADD COLUMN "embedding_input_hash" TEXT;

-- AlterTable
ALTER TABLE "asset_versions" ADD COLUMN "embedded_at" DATETIME;

-- AlterTable: the `promotion_approvals` row that made this version `active` (section 5.4).
ALTER TABLE "asset_versions" ADD COLUMN "activation_approval_id" INTEGER;

-- AlterTable
ALTER TABLE "recipe_versions" ADD COLUMN "activation_approval_id" INTEGER;

-- AlterTable: the A/B comparison a run belongs to (section 5.3); null on every ordinary run.
ALTER TABLE "run_index_entries" ADD COLUMN "comparison_id" TEXT;

-- AlterTable
ALTER TABLE "run_index_entries" ADD COLUMN "comparison_arm" TEXT CHECK ("comparison_arm" IN ('a', 'b') OR "comparison_arm" IS NULL);

-- ---------------------------------------------------------------------------------------------
-- New tables (3)
-- ---------------------------------------------------------------------------------------------

-- CreateTable: learnings written back from reviewed runs (section 5.5, B17). Rows beside the
-- immutable version, so saving one creates no version and changes no `content_hash`.
CREATE TABLE "asset_learning_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset_version_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source_run_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "retired_at" DATETIME,
    CONSTRAINT "asset_learning_notes_asset_version_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "asset_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (length("id") = 26),
    CHECK (length("text") BETWEEN 1 AND 500),
    CHECK (length("source_run_id") = 26),
    CHECK (length("created_by") BETWEEN 1 AND 100),
    CHECK ("status" IN ('active', 'retired')),
    CHECK (("status" = 'active' AND "retired_at" IS NULL) OR ("status" = 'retired' AND "retired_at" IS NOT NULL))
);

-- CreateTable: one recorded owner approval per activation (section 5.4, criterion 35). Append-only.
CREATE TABLE "promotion_approvals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "target_kind" TEXT NOT NULL,
    "asset_version_id" INTEGER,
    "recipe_version_id" INTEGER,
    "decided_by" TEXT NOT NULL,
    "decided_at" DATETIME NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "evidence_json" TEXT NOT NULL,
    "replaced_version" INTEGER,
    "quality_score_at_approval" REAL,
    "sample_size_at_approval" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,
    CONSTRAINT "promotion_approvals_asset_version_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "asset_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "promotion_approvals_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("target_kind" IN ('asset-version', 'recipe-version')),
    CHECK (
        ("target_kind" = 'asset-version' AND "asset_version_id" IS NOT NULL AND "recipe_version_id" IS NULL)
        OR ("target_kind" = 'recipe-version' AND "recipe_version_id" IS NOT NULL AND "asset_version_id" IS NULL)
    ),
    CHECK (length("decided_by") BETWEEN 1 AND 100),
    CHECK (length("reason") <= 1000),
    CHECK ("replaced_version" IS NULL OR "replaced_version" >= 1),
    CHECK ("quality_score_at_approval" IS NULL OR "quality_score_at_approval" BETWEEN 1 AND 5),
    CHECK ("sample_size_at_approval" >= 0)
);

-- CreateTable: a rebuildable index of A/B comparisons; the two run.json files are the source of
-- truth (section 5.3).
CREATE TABLE "comparisons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject_json" TEXT NOT NULL,
    "brief_hash" TEXT NOT NULL,
    "run_a_id" TEXT NOT NULL,
    "run_b_id" TEXT NOT NULL,
    "started_at" DATETIME,
    CHECK (length("id") = 26),
    CHECK (length("title") BETWEEN 1 AND 200),
    CHECK (length("created_by") BETWEEN 1 AND 100),
    CHECK (length("brief_hash") = 64),
    CHECK (length("run_a_id") = 26),
    CHECK (length("run_b_id") = 26),
    CHECK ("run_a_id" <> "run_b_id")
);

-- CreateIndex
CREATE INDEX "asset_learning_notes_asset_version_id_status_idx" ON "asset_learning_notes"("asset_version_id", "status");

-- CreateIndex
CREATE INDEX "promotion_approvals_asset_version_id_idx" ON "promotion_approvals"("asset_version_id");

-- CreateIndex
CREATE INDEX "promotion_approvals_recipe_version_id_idx" ON "promotion_approvals"("recipe_version_id");

-- CreateIndex
CREATE INDEX "comparisons_created_at_idx" ON "comparisons"("created_at");

-- CreateIndex: `sort=quality` (descending score, ties by id; SPEC 0003 section 4.3).
CREATE INDEX "asset_versions_quality_score_id_idx" ON "asset_versions"("quality_score", "id");

-- ---------------------------------------------------------------------------------------------
-- Guards outside the Prisma schema (section 4.4). Each one backs a rule a handler also enforces.
-- ---------------------------------------------------------------------------------------------

-- Criterion 35: a version becomes `active` only with a fresh approval for exactly this row. The
-- approval must be the newest one recorded for the row and must differ from the one already
-- stored, so one approval activates one transition and a re-activation needs a new approval.
CREATE TRIGGER "asset_versions_activation_requires_approval"
BEFORE UPDATE ON "asset_versions"
FOR EACH ROW
WHEN NEW."status" = 'active' AND OLD."status" <> 'active' AND (
    NEW."activation_approval_id" IS NULL
    OR NEW."activation_approval_id" IS OLD."activation_approval_id"
    OR NEW."activation_approval_id" IS NOT (
        SELECT max(p."id") FROM "promotion_approvals" p
        WHERE p."target_kind" = 'asset-version' AND p."asset_version_id" = NEW."id"
    )
)
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: activation needs a new promotion approval for this version');
END;

-- The approval id changes only together with an approved transition to `active`.
CREATE TRIGGER "asset_versions_activation_approval_fixed"
BEFORE UPDATE ON "asset_versions"
FOR EACH ROW
WHEN NEW."activation_approval_id" IS NOT OLD."activation_approval_id"
    AND NOT (NEW."status" = 'active' AND OLD."status" <> 'active')
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: activation_approval_id changes only with an activation');
END;

-- No version is born `active` or with an approval: activation is always an approved transition.
CREATE TRIGGER "asset_versions_insert_not_active"
BEFORE INSERT ON "asset_versions"
FOR EACH ROW
WHEN NEW."status" = 'active' OR NEW."activation_approval_id" IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: a version is never inserted as active');
END;

CREATE TRIGGER "recipe_versions_activation_requires_approval"
BEFORE UPDATE ON "recipe_versions"
FOR EACH ROW
WHEN NEW."status" = 'active' AND OLD."status" <> 'active' AND (
    NEW."activation_approval_id" IS NULL
    OR NEW."activation_approval_id" IS OLD."activation_approval_id"
    OR NEW."activation_approval_id" IS NOT (
        SELECT max(p."id") FROM "promotion_approvals" p
        WHERE p."target_kind" = 'recipe-version' AND p."recipe_version_id" = NEW."id"
    )
)
BEGIN
    SELECT RAISE(ABORT, 'recipe_versions: activation needs a new promotion approval for this version');
END;

CREATE TRIGGER "recipe_versions_activation_approval_fixed"
BEFORE UPDATE ON "recipe_versions"
FOR EACH ROW
WHEN NEW."activation_approval_id" IS NOT OLD."activation_approval_id"
    AND NOT (NEW."status" = 'active' AND OLD."status" <> 'active')
BEGIN
    SELECT RAISE(ABORT, 'recipe_versions: activation_approval_id changes only with an activation');
END;

CREATE TRIGGER "recipe_versions_insert_not_active"
BEFORE INSERT ON "recipe_versions"
FOR EACH ROW
WHEN NEW."status" = 'active' OR NEW."activation_approval_id" IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'recipe_versions: a version is never inserted as active');
END;

-- C1 rule (section 4.2): the score is null exactly when the sample size is 0, and bounded 1..5.
CREATE TRIGGER "asset_versions_quality_consistent_update"
BEFORE UPDATE ON "asset_versions"
FOR EACH ROW
WHEN (NEW."quality_score" IS NULL AND NEW."quality_sample_size" > 0)
    OR (NEW."quality_score" IS NOT NULL AND NEW."quality_sample_size" = 0)
    OR (NEW."quality_score" IS NOT NULL AND (NEW."quality_score" < 1 OR NEW."quality_score" > 5))
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: quality_score is null exactly when quality_sample_size is 0, and within 1..5');
END;

CREATE TRIGGER "asset_versions_quality_consistent_insert"
BEFORE INSERT ON "asset_versions"
FOR EACH ROW
WHEN (NEW."quality_score" IS NULL AND NEW."quality_sample_size" > 0)
    OR (NEW."quality_score" IS NOT NULL AND NEW."quality_sample_size" = 0)
    OR (NEW."quality_score" IS NOT NULL AND (NEW."quality_score" < 1 OR NEW."quality_score" > 5))
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: quality_score is null exactly when quality_sample_size is 0, and within 1..5');
END;

-- Approvals are append-only, for assets and recipes alike.
CREATE TRIGGER "promotion_approvals_never_updated"
BEFORE UPDATE ON "promotion_approvals"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'promotion_approvals: approvals are append-only');
END;

CREATE TRIGGER "promotion_approvals_never_deleted"
BEFORE DELETE ON "promotion_approvals"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'promotion_approvals: approvals are append-only');
END;

-- Learnings are never deleted; the only change is retiring an active note once.
CREATE TRIGGER "asset_learning_notes_never_deleted"
BEFORE DELETE ON "asset_learning_notes"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'asset_learning_notes: notes are never deleted; retire instead');
END;

CREATE TRIGGER "asset_learning_notes_retire_only"
BEFORE UPDATE ON "asset_learning_notes"
FOR EACH ROW
WHEN NOT (
    OLD."status" = 'active' AND NEW."status" = 'retired'
    AND OLD."retired_at" IS NULL AND NEW."retired_at" IS NOT NULL
    AND NEW."id" IS OLD."id"
    AND NEW."asset_version_id" IS OLD."asset_version_id"
    AND NEW."text" IS OLD."text"
    AND NEW."source_run_id" IS OLD."source_run_id"
    AND NEW."created_by" IS OLD."created_by"
    AND NEW."created_at" IS OLD."created_at"
)
BEGIN
    SELECT RAISE(ABORT, 'asset_learning_notes: the only change is retiring an active note');
END;
