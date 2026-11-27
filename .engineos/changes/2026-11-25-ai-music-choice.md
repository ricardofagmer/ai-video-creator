---
name: 2026-11-25-ai-music-choice
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-ai-music-choice-design.md
domain: general
security_review: pending
preview: declined
risk: medium
new_feature: true
release: false
---

## What
Background music is chosen one of two ways on a preset: the owner picks the song (as today), or "AI decides" among catalog tracks carrying the chosen categories, with ElevenLabs generation when no track matches.

## Why
Owner request 2026-11-25: "we can decide the background music song, or we can have a option to the ai decides with a category: animated, excited, sad, upset, boring, classic, electronic, thoughtful, guitar, acoustic guitar, piano, voices and so on". Music tracks carried no mood or instrument, and a preset could only pin one song.

## Scope
- `packages/shared`: music categories, `MusicDetails.categories`, music stage params (`musicChoiceOf`, `withMusicChoice`), conflict `music-mode-conflict`, director `inputs.music` and `musicPick`.
- `packages/core`, `apps/api`, `seeds`: director packet and prompt, mock output, catalog persistence of categories.
- `apps/watcher`: candidate listing, scenes stage offers candidates, music stage pick, record and generation fallback.
- `apps/web`: catalog categories field, music mode control in the preset form and the wizard, texts in pt-BR, es and en.

## Checklist
- [x] Spec written and approved
- [x] Shared contract frozen
- [x] Core and api (worker)
- [x] Watcher (worker)
- [x] Web (worker)
- [x] Integration of the three returns
- [x] Visible check on the dev server (preset form and wizard)
- [ ] Final checkpoint (typecheck, lint, tests): owner answered "Skip for now" on 2026-11-25
- [ ] Security review: owner answered "Decline security review" on 2026-11-25; evidence stays missing

## What was made
- Shared: 17 music categories and `MusicDetails.categories` (default none); `musicChoiceOf` / `withMusicChoice` over the `music` stage params; conflict `music-mode-conflict`, and no `music` binding needed in auto mode; director `inputs.music` and `ScenesOutput.musicPick`.
- Core: `DirectorPacketSource.music` forwarded with two or more candidates; prompt `director@8` (pick one candidate, never cite it in `citedRefs`); mock scenes pick the first candidate.
- Watcher: `stages/music/` (candidates, director block, pick with hash check, auto flow, generation, ElevenLabs music client, pricing seam); `music.executor.ts` split into track and auto paths; `scenes.executor.ts` offers candidates; `music-pick.json` records the pick; pt-BR owner texts.
- Web: category picker on the catalog music form and badges on cards; "Choose the song" / "AI decides" in the preset form and the wizard; conflict sentence; texts in pt-BR, es and en.
- Seen on the dev server (127.0.0.1:4310, 2026-11-25): the Music row of `/receitas/carrinho-completo-9x16` and the "Voice and style" step of `/criar` show both options, and "AI decides" shows the 17 categories with nothing covered and no console error. Nothing was saved.

- Real test run (2026-11-25, owner approved "Real run only", "AI decides (Recommended)", "Tag and activate all 4 (Recommended)", "Rebuild and restart (Recommended)", "Back up, then migrate (Recommended)"):
  - `shared`, `core`, `api` and `watcher` built without errors; API and watcher restarted from the new `dist`. Migration `20261125120000_music_cost_kind` applied to the local database after a backup (`studio.sqlite.before-music-cost-kind`, 233 cost rows before and after, integrity ok).
  - Seen in the app: the catalog music form saves categories and cards show them; four tracks active with categories; the wizard keeps "AI decides: Calm" up to the review step.
  - Run `01M89F9AEYP8GBTD9M2539G8NN` (preset `carrinho-completo-9x16@11`, one image reference, auto mode with `calm`) reached `review` with `final.mp4` (1080x1920, h264 + aac, 27.9 s, -16.2 LUFS). Two candidates matched; the director returned `musicPick`, and `stages/11-music/music-pick.json` records `source: catalog`, `mixkit-lullaby-night-531@2`, its hash and the reason. The music step text names the song and the reason. Run cost US$ 0.07.
  - Finding, not fixed: in that run the `scenes` check `refs-resolve` failed three times with "meeting-notes-thumbnail@1: não oferecido à etapa" and the stage went on with a warning. The cited ref is the owner's image, not the music candidate. Cause (read-only diagnosis, 2026-11-25): `assetProblems` in `apps/watcher/src/stages/executors/scene-refs.ts` requires every cited ref to be in `context.recipe.bindings`, but a run reference is in `run.references` and is offered to the director by `readReferenceMedia` (`owner-references-input.ts`: "The recipe pins none of them"). The check predates that offer, so it fails whenever the director shows an owner picture. Not caused by the music change. Fixed in source on 2026-11-25 (owner: "Yes, fix it"): `assetProblems` now accepts a ref that `preflight` resolved and that is in `run.references`, pinned to the hash `preflight` resolved; an unbound ref outside `run.references` is still refused. `@studio/watcher` built without errors and the watcher was restarted from the new `dist` (owner: "Rebuild and restart"). Proof run `01M89GAMXFWVF01JXZ512T86PE` (same preset, same image reference, auto mode `calm`; owner: "Yes, run it") reached `review` with `final.mp4`: `refs-resolve` passed on the first attempt ("1 de 1 referência(s) resolvida(s)"), no stage rerun, and `music-pick.json` again records `mixkit-lullaby-night-531@2` from the catalog. No automated test covers the check.
  - Run `01M89F544SRZ6HKM8346C2ZHCH` stopped at preflight (third-party image without a recorded license) and was left waiting.

## Not done
- Paid generation: the ElevenLabs path is written but always stops for a person, because the cost ledger has no music spend kind. Owner decision 2026-11-25: "Ship catalog pick now (Recommended)"; the cost kind is a follow-up change with its own spec (cost format, `cost_entries` migration, cost screen, price entry).
- No typecheck, lint or test has run on this change (only the four package builds above). The rerun reusing the recorded pick and the single-candidate and no-candidate paths were not exercised.
- Not seen in the browser: saving and reopening a preset in auto mode from the preset form.
- The read-only preset detail page does not show "AI decides".
- Seeded tracks carry no categories.

## User checklist
- [ ] Run or approve the final checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`) before relying on this change
- [ ] Tag the catalog's music tracks with categories so "AI decides" has tracks to pick from
- [ ] Confirm the ElevenLabs plan allows music generation and set its price in the price table

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-25 | Ricardo Fagmer | design choices | approved | Track source "Catalog, then generate"; timing "Per video, at run time (Recommended)"; category "Several allowed"; screens "Preset form and wizard (Recommended)"
- 2026-11-25 | Ricardo Fagmer | spec approval | approved | "Approve (Recommended)"; categories "Keep all 17 (Recommended)"; preview "No preview, build (Recommended)"
- 2026-11-25 | Ricardo Fagmer | agent topology | approved | "Scene director picks (Recommended)": no new agent, the director returns `musicPick`
- 2026-11-25 | Ricardo Fagmer | scope | approved | "Ship catalog pick now (Recommended)": generation stays fail-closed, cost kind is a follow-up
- 2026-11-25 | Ricardo Fagmer | final checks | skipped | "Skip for now": typecheck, lint and tests stay pending
- 2026-11-25 | Ricardo Fagmer | security review | refused | "Decline security review": no review ran; `security_review` stays pending and is not verified

## Changes registered
<filled on completion>

## Notes
- The mode lives in the `music` stage `params`, not in a new recipe field, so presets saved before keep their content hash.
- Three workers ran in parallel on disjoint folders after the shared contract was frozen (dispatch reason `parallel-independent`).
