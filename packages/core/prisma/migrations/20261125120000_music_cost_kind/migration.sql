-- Contract C8 delta (docs/specs/2026-11-25-music-spend-kind-design.md, T2): ElevenLabs music
-- generation is a billed unit of its own, so `cost_entries.kind` also accepts 'music' and the new
-- nullable column `music_seconds` holds the requested track length. Hand-authored to match
-- prisma/schema.prisma. Applied only by `prisma migrate deploy` from scripts/install.sh / the
-- first-run setup migrations step, after the owner's scoped confirmation; no ticket executes it.
--
-- Not additive: SQLite cannot alter a CHECK in place, so `cost_entries` is redefined (create the
-- new table, copy every row with its id, drop the old one, rename, recreate both indexes). Every
-- column, default and CHECK is copied verbatim from 20261123180000_asset_job_cost_source; only the
-- `kind` list grows and `music_seconds` is added (NULL for every copied row). No row is deleted or
-- rewritten: the copy keeps every `id`, and AUTOINCREMENT continues from the highest copied id.
-- `cost_entries` has no foreign key, trigger or view, so nothing else refers to it.
--
-- Down path: once no 'music' row exists, the same redefinition with the old list
-- ('model', 'tts', 'render') and without `music_seconds` restores the previous table. Otherwise
-- recovery is restoring the file copy of `db/studio.sqlite` taken before the migration runs.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- RedefineTable
CREATE TABLE "new_cost_entries" (
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
    "music_seconds" REAL,
    "usd" REAL NOT NULL,
    "price_table_version" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_kind" TEXT NOT NULL DEFAULT 'run' CHECK ("source_kind" IN ('run', 'curation', 'asset-job')),
    CHECK ("kind" IN ('model', 'tts', 'render', 'music')),
    CHECK ("provider" IN ('claude', 'elevenlabs', 'local-voice', 'render')),
    CHECK ("call_index" >= 1),
    CHECK ("usd" >= 0)
);

INSERT INTO "new_cost_entries" (
    "id", "run_id", "session_id", "call_index", "kind", "step_key", "role", "provider", "model_id",
    "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "tts_characters",
    "render_seconds", "usd", "price_table_version", "occurred_at", "recorded_at", "source_kind"
)
SELECT
    "id", "run_id", "session_id", "call_index", "kind", "step_key", "role", "provider", "model_id",
    "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "tts_characters",
    "render_seconds", "usd", "price_table_version", "occurred_at", "recorded_at", "source_kind"
FROM "cost_entries";

DROP TABLE "cost_entries";
ALTER TABLE "new_cost_entries" RENAME TO "cost_entries";

-- CreateIndex
CREATE INDEX "cost_entries_occurred_at_idx" ON "cost_entries"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_run_id_session_id_call_index_key" ON "cost_entries"("run_id", "session_id", "call_index");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
