-- Contract C8 delta (SPEC 0007 section 4.5, R4-01): connected platforms. Hand-authored to match
-- prisma/schema.prisma. Applied only by `prisma migrate deploy` from scripts/install.sh, which the
-- owner runs after the scoped confirmation of SPEC 0007 section 16 (a file copy of
-- `db/studio.sqlite` first); no ticket executes it (AC 61).
--
-- Additive only (K8): one `CREATE TABLE`, three `CREATE INDEX` and four `ALTER TABLE ... ADD COLUMN`
-- (two with defaults, two nullable). No table is dropped or redefined, so the R1 to R3 CHECK
-- constraints, partial unique indexes and triggers stay exactly as the earlier migrations created
-- them. No existing row is deleted or rewritten: every existing publication reads
-- `origin = 'manual'`, `attempt_id = NULL`, `platform_media_id = NULL`, and every existing import
-- reads `origin = 'upload'`. The two added `origin` columns carry no CHECK (an added column cannot
-- without a redefinition); the handlers check them with zod.
--
-- No column holds a token, a client secret, a title, a caption, a tag or an account label.
--
-- Down path: SQLite cannot drop the columns without redefining their tables (K8). Recovery is
-- restoring the file copy taken before the migration runs; the table and the columns can also stay
-- unused (SPEC 0007 section 16).

-- CreateTable: one studio publish attempt (section 5.4). The foreign key to `run_outcomes` means an
-- attempt cannot exist for an unreviewed run; the handler also requires `decision = 'approved'`.
CREATE TABLE "publication_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL, "platform" TEXT NOT NULL, "connection_id" TEXT NOT NULL, "mode" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL, "state" TEXT NOT NULL, "reason_id" TEXT,
    "artifact_sha256" TEXT NOT NULL, "artifact_bytes" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL, "ai_disclosure" BOOLEAN NOT NULL,
    "biometric_refs_json" TEXT NOT NULL DEFAULT '[]', "biometric_confirmed_at" DATETIME NOT NULL,
    "approval_decided_at" DATETIME NOT NULL, "publication_id" TEXT,
    "requested_by" TEXT NOT NULL, "created_by" TEXT NOT NULL, "correlation_id" TEXT,
    "requested_at" DATETIME NOT NULL, "expires_at" DATETIME NOT NULL, "updated_at" DATETIME NOT NULL,
    CHECK ("platform" IN ('youtube', 'instagram', 'tiktok')),
    CHECK ("mode" IN ('mock', 'live')),
    CHECK ("state" IN ('queued', 'uploading', 'processing', 'sent-to-inbox', 'published', 'failed', 'cancelled', 'expired', 'outcome-unknown', 'inbox-unconfirmed')),
    CONSTRAINT "publication_attempts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run_outcomes" ("run_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: a repeated `idempotencyKey` (a double click) finds the stored attempt.
CREATE UNIQUE INDEX "publication_attempts_idempotency_key_key" ON "publication_attempts"("idempotency_key");

-- CreateIndex: at most one open attempt per run and platform (`publish-already-in-progress`).
-- Prisma cannot express a partial index; it lives only here.
CREATE UNIQUE INDEX "publication_attempts_open_key" ON "publication_attempts"("run_id", "platform") WHERE "state" IN ('queued', 'uploading', 'processing', 'sent-to-inbox');

-- CreateIndex: the attempts of one run (dialog, sync, insights).
CREATE INDEX "publication_attempts_run_id_idx" ON "publication_attempts"("run_id");

-- AlterTable: where a publication came from (`manual` | `studio` | `mock`), its attempt, and the
-- platform media id the poller resolves (Instagram).
ALTER TABLE "run_publications" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "run_publications" ADD COLUMN "attempt_id" TEXT;
ALTER TABLE "run_publications" ADD COLUMN "platform_media_id" TEXT;

-- AlterTable: how an import arrived (`upload` | `api`, Q3).
ALTER TABLE "metric_imports" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'upload';
