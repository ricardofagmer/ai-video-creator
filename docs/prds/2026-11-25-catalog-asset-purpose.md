---
name: catalog-asset-purpose
status: accepted
owner: Ricardo Fagmer
---

## Problem
Catalog cards show a name, kind, tags and a thumbnail. Many assets have names that say nothing
("hf-3", "prompt-v2"), so the owner has to open each one to learn what it does (owner, 2026-11-25).
An optional `summary` field exists, but it is rarely filled in and no page shows it.

## Goal & success metrics
- Every non-deprecated asset version shown in the catalog carries a short "what is this for" text.
  The owner does not have to type it.
- The text is visible without opening the asset (hover) and on the detail page.
- Success: after backfill, 100% of latest and active versions have a purpose, or a visible failed
  state with Retry. Registering an asset is no slower than today.

## Users & use cases
- The owner, browsing the catalog: hover a square to see what the asset is for.
- The owner, on an asset page: read, correct or regenerate the text.
- The studio's agents: pick assets better because search and describe results now carry a purpose.

## Requirements
1. Saving a new asset, a new version with new bytes, or a by-reference registration queues an AI
   purpose job. The save never waits for it and never fails because of it.
2. The purpose is 1 to 2 sentences, max 280 chars, plain text, in Portuguese.
3. The AI reads metadata plus readable content (prompt, skill and template text, stored images,
   reference analysis). Music, SFX and links give metadata only.
4. Biometric assets: the AI receives only name, kind and tags (ADR 0012).
5. The detail page shows the purpose. While the job is open it shows "Gerando finalidade…", and on
   failure or refusal it shows the reason plus a Retry button.
6. The owner can edit the text and can regenerate it. An owner edit is never overwritten
   automatically.
7. The catalog square has a `title` with the purpose on the whole card and an `alt` with the purpose
   on the thumbnail. With no purpose, both fall back to the asset name.
8. A `from-previous` version keeps its source's purpose and does not call the AI.
9. A "Gerar finalidades" button on the catalog page shows how many assets lack a purpose. It asks
   for confirmation, then queues jobs for the latest and active versions with no purpose and no
   open job. The button hides when the count is 0.
10. `CatalogSearchTool` and `AssetDescribeTool` return `purpose`. Biometric rows stay excluded.

## Non-goals
- No change to the semantic index or the embeddings.
- No translation: one pt-BR text per version.
- No AI purpose for old deprecated versions unless the owner clicks Regenerate on them.
- No hand-port to `video-studio-deps` or `video-studio-zod4`. They get the feature on rebase.
- No audio analysis of music or SFX.

## Open questions
None. All decisions were settled in the 2026-11-25 grilling.
