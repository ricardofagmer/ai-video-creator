-- Contract C8 delta (SPEC 0006 section 4.5, R3-02): outside signals. Hand-authored to match
-- prisma/schema.prisma. Applied only by `prisma migrate deploy` from scripts/install.sh, which the
-- owner runs after the scoped confirmation of SPEC 0006 section 16; no ticket executes it.
--
-- Additive only (K8): three `CREATE TABLE`, three `CREATE INDEX` and one `ALTER TABLE ... ADD COLUMN`
-- with a default. No table is dropped or redefined, so the R1 and R2 CHECK constraints, partial
-- unique indexes and triggers stay exactly as the earlier migrations created them. No existing row
-- is deleted or rewritten: every existing `asset_versions` row reads
-- `quality_platform_sample_size = 0`, which keeps it at most `quality_sample_size`.
--
-- The new column is not listed in `asset_versions_content_immutable` (init migration), so the
-- quality service can write it like the other score columns.
--
-- Down path: SQLite cannot drop the column without redefining `asset_versions` (K8). Recovery is
-- restoring the file copy of `db/studio.sqlite` taken before the migration runs; the tables and the
-- column can also stay unused (SPEC 0006 section 16).

-- CreateTable: where the owner published an approved run (section 5.1). The foreign key to
-- `run_outcomes` means a publication exists only for a reviewed run; the handler also requires
-- `decision = 'approved'` (L4).
CREATE TABLE "run_publications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_video_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_on" TEXT,
    "recorded_by" TEXT NOT NULL,
    "correlation_id" TEXT,
    "recorded_at" DATETIME NOT NULL,
    CHECK ("platform" IN ('youtube', 'instagram', 'tiktok')),
    CHECK (length("url") <= 300 AND length("platform_video_id") <= 40),
    CONSTRAINT "run_publications_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run_outcomes" ("run_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: one platform video is linked to at most one run.
CREATE UNIQUE INDEX "run_publications_platform_platform_video_id_key" ON "run_publications"("platform", "platform_video_id");

-- CreateIndex: the publications of one run page.
CREATE INDEX "run_publications_run_id_idx" ON "run_publications"("run_id");

-- CreateTable: one applied CSV import; hash, size and counts only, never the file (B12).
CREATE TABLE "metric_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "file_bytes" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL, "matched" INTEGER NOT NULL, "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL, "unchanged" INTEGER NOT NULL, "unmatched" INTEGER NOT NULL, "issues" INTEGER NOT NULL,
    "imported_by" TEXT NOT NULL,
    "correlation_id" TEXT,
    "imported_at" DATETIME NOT NULL,
    CHECK ("platform" IN ('youtube', 'instagram', 'tiktok'))
);

-- CreateIndex: the repeated-file check (`duplicateFile`, section 5.3 idempotency).
CREATE INDEX "metric_imports_file_sha256_idx" ON "metric_imports"("file_sha256");

-- CreateTable: cumulative metrics of one publication as of a day, per source (section 5.2).
CREATE TABLE "platform_metric_snapshots" (
    "publication_id" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "import_id" TEXT,
    "views" INTEGER NOT NULL,
    "likes" INTEGER, "comments" INTEGER, "shares" INTEGER, "saves" INTEGER,
    "impressions" INTEGER, "reach" INTEGER, "followers_gained" INTEGER,
    "watch_time_seconds" INTEGER, "average_view_duration_seconds" REAL, "average_view_percent" REAL,
    "recorded_at" DATETIME NOT NULL,
    PRIMARY KEY ("publication_id", "as_of_date", "source"),
    CHECK ("source" IN ('csv', 'form')),
    CHECK (("source" = 'csv') = ("import_id" IS NOT NULL)),
    CHECK ("views" >= 0),
    CONSTRAINT "platform_metric_snapshots_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "run_publications" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AlterTable: the reviewed runs of a score that carried a platform signal (section 5.4).
ALTER TABLE "asset_versions" ADD COLUMN "quality_platform_sample_size" INTEGER NOT NULL DEFAULT 0;
