-- Desktop installer (ADR 0010 decision 7, plan C1 rev 1, ticket 01): portal pairing. Hand-authored
-- to match prisma/schema.prisma. Authored only; applying it is first-run setup step 3
-- (`prisma migrate deploy`) or `scripts/install.sh`, after the owner's scoped confirmation.
--
-- Additive only: two `CREATE TABLE` and two `CREATE INDEX`. No existing table is touched, so every
-- earlier CHECK constraint, partial index and trigger stays as created. Older builds ignore both
-- tables (plan section 7).
--
-- No column holds a pair code or a token: only their SHA-256 as lowercase hex (64 characters).
--
-- Down path: `DROP TABLE "install_pair_codes"; DROP TABLE "install_tokens";` loses only portal
-- pairings; the portal then shows "not paired" and the owner pairs again.

-- CreateTable: portal tokens; the api keeps at most five rows.
CREATE TABLE "install_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token_sha256" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    CHECK (length("token_sha256") = 64)
);

-- CreateIndex: one row per token digest.
CREATE UNIQUE INDEX "install_tokens_token_sha256_key" ON "install_tokens"("token_sha256");

-- CreateIndex: the oldest token is dropped first when a sixth pairing succeeds.
CREATE INDEX "install_tokens_created_at_idx" ON "install_tokens"("created_at");

-- CreateTable: the pending one-time pair code (5 minutes, single use, 5 failed attempts).
CREATE TABLE "install_pair_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code_sha256" TEXT NOT NULL,
    "issued_at" DATETIME NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    CHECK (length("code_sha256") = 64),
    CHECK ("failed_attempts" >= 0 AND "failed_attempts" <= 5)
);
