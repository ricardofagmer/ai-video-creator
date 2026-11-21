-- R4 review fix F-3 (SPEC 0007, review-fixes.md round 2): the watcher checks that the title,
-- caption, tags, visibility and AI disclosure in `request.json` are the ones the owner approved.
-- Only a SHA-256 of that metadata is stored; the owner's text never reaches SQLite.
-- Additive and nullable: existing rows stay valid, and a null hash makes the watcher refuse the
-- upload (fail closed) instead of trusting an unchecked request file.
-- Authored only; applying it needs the owner's scoped approval (gate 2).
ALTER TABLE "publication_attempts" ADD COLUMN "metadata_sha256" TEXT;
