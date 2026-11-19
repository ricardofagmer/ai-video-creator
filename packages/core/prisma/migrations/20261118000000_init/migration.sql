-- Contract C8 (SPEC 0002, R1-05): initial schema. Hand-authored to match prisma/schema.prisma.
-- Applied only by `prisma migrate deploy` from scripts/install.sh (R1-22), which the owner runs.
-- Down path: the database is a new local file created by the install; rollback is deleting
-- `db/studio.sqlite` before any data is entered (SPEC 0002 section 12). After data exists,
-- recovery is a restore of that file from Time Machine.
--
-- CHECK constraints, partial unique indexes and triggers below are not representable in Prisma
-- schema. A later migration that redefines one of these tables must re-create them.

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (length("id") BETWEEN 1 AND 64),
    CHECK ("kind" IN ('template', 'ai-model', 'reference', 'prompt', 'skill', 'image', 'music', 'sfx', 'brand-kit'))
);

-- CreateTable
CREATE TABLE "asset_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "tags_json" TEXT NOT NULL DEFAULT '[]',
    "owner" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "storage_mode" TEXT NOT NULL,
    "reference_path" TEXT,
    "provenance_json" TEXT,
    "license_json" TEXT,
    "sensitivity" TEXT NOT NULL,
    "details_json" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "quality_score" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "embedding_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "asset_versions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("version" >= 1),
    CHECK ("status" IN ('draft', 'active', 'deprecated')),
    CHECK ("layout" IN ('file', 'folder')),
    CHECK ("storage_mode" IN ('store', 'reference')),
    CHECK ("sensitivity" IN ('normal', 'biometric', 'third-party')),
    CHECK (length("content_hash") = 64),
    CHECK ("size_bytes" >= 0),
    CHECK ("usage_count" >= 0),
    CHECK (("storage_mode" = 'reference' AND "reference_path" IS NOT NULL) OR ("storage_mode" = 'store' AND "reference_path" IS NULL)),
    -- Criterion 22: biometric material is registered by path and hash only.
    CHECK ("sensitivity" <> 'biometric' OR "storage_mode" = 'reference'),
    -- Criterion 7: a third-party version cannot be active without license and provenance.
    CHECK ("status" <> 'active' OR "sensitivity" <> 'third-party' OR ("license_json" IS NOT NULL AND "provenance_json" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (length("id") BETWEEN 1 AND 64)
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipe_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "owner" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "definition_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("version" >= 1),
    CHECK ("status" IN ('draft', 'active', 'deprecated')),
    CHECK (length("content_hash") = 64)
);

-- CreateTable
CREATE TABLE "run_index_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_since" DATETIME NOT NULL,
    "created_by" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "recipe_content_hash" TEXT NOT NULL,
    "cost_usd" REAL NOT NULL DEFAULT 0,
    "duration_ms" BIGINT NOT NULL DEFAULT 0,
    "totals_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "indexed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (length("id") = 26),
    CHECK ("status" IN ('draft', 'pending', 'running', 'waiting', 'paused', 'failed', 'interrupted', 'review', 'approved', 'rejected')),
    CHECK ("created_by" IN ('api', 'cli')),
    CHECK ("recipe_version" >= 1),
    CHECK ("cost_usd" >= 0),
    CHECK ("duration_ms" >= 0)
);

-- CreateTable
CREATE TABLE "run_outcomes" (
    "run_id" TEXT NOT NULL PRIMARY KEY,
    "decision" TEXT NOT NULL,
    "decided_by" TEXT NOT NULL,
    "decided_at" DATETIME NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "reviewer_scores_json" TEXT NOT NULL DEFAULT '{}',
    "qa_metrics_json" TEXT NOT NULL DEFAULT '{}',
    "recoveries" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" REAL NOT NULL DEFAULT 0,
    "duration_ms" BIGINT NOT NULL DEFAULT 0,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_outcomes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run_index_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("decision" IN ('approved', 'rejected')),
    CHECK ("rating" BETWEEN 1 AND 5),
    CHECK ("recoveries" >= 0),
    CHECK ("cost_usd" >= 0),
    CHECK ("duration_ms" >= 0)
);

-- CreateTable
CREATE TABLE "run_outcome_assets" (
    "run_id" TEXT NOT NULL,
    "asset_version_id" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,

    PRIMARY KEY ("run_id", "asset_version_id"),
    CONSTRAINT "run_outcome_assets_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run_outcomes" ("run_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "run_outcome_assets_asset_version_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "asset_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (length("content_hash") = 64)
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "run_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "call_index" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "role" TEXT,
    "provider" TEXT NOT NULL,
    "model_id" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "tts_characters" INTEGER,
    "render_seconds" REAL,
    "usd" REAL NOT NULL,
    "price_table_version" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("kind" IN ('model', 'tts', 'render')),
    CHECK ("provider" IN ('claude', 'elevenlabs', 'local-voice', 'render')),
    CHECK ("call_index" >= 1),
    CHECK ("usd" >= 0)
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "assets_kind_idx" ON "assets"("kind");

-- CreateIndex
CREATE INDEX "asset_versions_content_hash_idx" ON "asset_versions"("content_hash");

-- CreateIndex
CREATE INDEX "asset_versions_status_idx" ON "asset_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_versions_asset_id_version_key" ON "asset_versions"("asset_id", "version");

-- CreateIndex
CREATE INDEX "recipe_versions_status_idx" ON "recipe_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipe_id_version_key" ON "recipe_versions"("recipe_id", "version");

-- CreateIndex
CREATE INDEX "run_index_entries_status_idx" ON "run_index_entries"("status");

-- CreateIndex
CREATE INDEX "run_index_entries_recipe_id_recipe_version_idx" ON "run_index_entries"("recipe_id", "recipe_version");

-- CreateIndex
CREATE INDEX "run_index_entries_created_at_idx" ON "run_index_entries"("created_at");

-- CreateIndex
CREATE INDEX "run_outcomes_decision_idx" ON "run_outcomes"("decision");

-- CreateIndex
CREATE INDEX "run_outcome_assets_asset_version_id_idx" ON "run_outcome_assets"("asset_version_id");

-- CreateIndex
CREATE INDEX "cost_entries_occurred_at_idx" ON "cost_entries"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_run_id_session_id_call_index_key" ON "cost_entries"("run_id", "session_id", "call_index");

-- ---------------------------------------------------------------------------------------------
-- Guards outside the Prisma schema. Each one backs a rule the catalog handlers also enforce.
-- ---------------------------------------------------------------------------------------------

-- PRD 5.4 rule 2: at most one active version per asset and per recipe.
CREATE UNIQUE INDEX "asset_versions_one_active_per_asset" ON "asset_versions"("asset_id") WHERE "status" = 'active';

CREATE UNIQUE INDEX "recipe_versions_one_active_per_recipe" ON "recipe_versions"("recipe_id") WHERE "status" = 'active';

-- PRD 5.4 rule 1 and criterion 6: a saved version's content never changes; an edit is N+1.
CREATE TRIGGER "asset_versions_content_immutable"
BEFORE UPDATE ON "asset_versions"
FOR EACH ROW
WHEN OLD."asset_id" IS NOT NEW."asset_id"
    OR OLD."version" IS NOT NEW."version"
    OR OLD."name" IS NOT NEW."name"
    OR OLD."summary" IS NOT NEW."summary"
    OR OLD."tags_json" IS NOT NEW."tags_json"
    OR OLD."owner" IS NOT NEW."owner"
    OR OLD."content_hash" IS NOT NEW."content_hash"
    OR OLD."size_bytes" IS NOT NEW."size_bytes"
    OR OLD."mime_type" IS NOT NEW."mime_type"
    OR OLD."layout" IS NOT NEW."layout"
    OR OLD."storage_mode" IS NOT NEW."storage_mode"
    OR OLD."reference_path" IS NOT NEW."reference_path"
    OR OLD."provenance_json" IS NOT NEW."provenance_json"
    OR OLD."license_json" IS NOT NEW."license_json"
    OR OLD."sensitivity" IS NOT NEW."sensitivity"
    OR OLD."details_json" IS NOT NEW."details_json"
    OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: a saved version is immutable; save version N+1');
END;

-- PRD 5.4 rule 3: deprecation never deletes; past manifests stay resolvable.
CREATE TRIGGER "asset_versions_never_deleted"
BEFORE DELETE ON "asset_versions"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'asset_versions: versions are never deleted; deprecate instead');
END;

CREATE TRIGGER "recipe_versions_content_immutable"
BEFORE UPDATE ON "recipe_versions"
FOR EACH ROW
WHEN OLD."recipe_id" IS NOT NEW."recipe_id"
    OR OLD."version" IS NOT NEW."version"
    OR OLD."name" IS NOT NEW."name"
    OR OLD."owner" IS NOT NEW."owner"
    OR OLD."content_hash" IS NOT NEW."content_hash"
    OR OLD."definition_json" IS NOT NEW."definition_json"
    OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
    SELECT RAISE(ABORT, 'recipe_versions: a saved version is immutable; save version N+1');
END;

CREATE TRIGGER "recipe_versions_never_deleted"
BEFORE DELETE ON "recipe_versions"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'recipe_versions: versions are never deleted; deprecate instead');
END;
