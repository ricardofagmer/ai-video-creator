---
name: 2026-11-27-skills-deck-real-cases
status: active
owner: Ricardo Fagmer
spec: none (fast change, low risk)
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The Skills tab of the catalog (`/catalogo?secao=ia-e-escrita&tipo=skill`) shows Skill Deck style cards: an animated cover per skill, a "Real case" section, the skill's use in recent runs, and a search box.

## Why
Owner request 2026-11-27, with `Skill Deck.html` attached: "our skills page under governance must be similar this, showing how the skill works with real cases". The owner picked the Video Studio catalog Skills tab as the target, the deck layout drawn with the app's own colours, and both curated cases and real run data.

## Scope
- `apps/web/src/features/skills/skill-stage.ts` (new): maps a skill's artwork glyph to one of 9 animated scenes.
- `apps/web/src/features/skills/components/SkillStage.tsx` (new): the animated cover (timeline, waveform, captions, paper, checklist, canvas, bars, graph, lines).
- `apps/web/src/features/skills/skill-stage.module.css` (new): the scenes and their loops, off under `prefers-reduced-motion`.
- `apps/web/src/features/skills/skill-cases.ts` (new): which skills have a recorded case and the run it comes from.
- `apps/web/src/features/skills/skill-usage.server.ts` (new): run count and newest run per bound asset, from the last 100 runs and their recipe versions.
- `apps/web/src/features/skills/skill-list.ts`: `busca` search parameter, search matching, hrefs that keep the search.
- `apps/web/src/features/skills/components/SkillList.tsx`: cover, "Real case" and run usage on each card.
- `apps/web/src/features/skills/components/SkillsCatalogPanel.tsx`: search form, usage load, tabs counted over the search result.
- `apps/web/src/features/skills/skills.module.css`: toolbar, search form, case and usage styles; wider card column.
- `apps/web/src/app/(studio)/catalogo/page.tsx`: passes the search to the panel.
- `apps/web/src/messages/skills/{pt-BR,en,es}.ts`: search texts, 9 cases, usage texts.

Second pass, same day (owner: "i cannot see this implemented yet", looking at the wizard's Skills tab; and "the second block is missaligned"):
- `apps/web/src/features/skills/skill-stage.ts`: each known skill id has its own scene; 16 scenes in all.
- `apps/web/src/features/skills/components/SkillStage.tsx`, `skill-stage.module.css`: 7 more scenes (chat, grade, logo, fade, sheet, diff, capture).
- `apps/web/src/features/catalog/components/CatalogAssetItem.tsx`: skill cards in the catalog lists play the animated cover.
- `apps/web/src/features/wizard/components/WizardLibraryCard.tsx`: skill cards in the wizard's "Add to pipeline" step play it too.
- `apps/web/src/features/common/poster-card.module.css`: the compact card's footer stays pinned to the card's bottom.

Third pass, same day (owner: "the silver light at background give the sensation of not modern system, adjust this"; the owner chose both silvers and the near-white look):
- `packages/ui/src/styles/tokens.css`: light theme page, card, muted surface, glass and border colours.
- `design/tokens.md`: the same values and the reason, in the token reference.
- `apps/web/src/features/skills/skill-stage.module.css`: the grey picture of the grade scene and the grey screen of the capture scene.

Fourth pass, same day (owner, with a screenshot of the light theme: "black in header is not good"):
- `apps/web/src/features/skills/skill-stage.module.css`: the cover's background and the colours of its marks follow the theme.

## Checklist
- [x] Animated cover on every skill card, in the app's own tokens
- [x] "Real case" per skill, with request, steps, result and source run
- [x] Run count and link to the newest run per skill
- [x] Search by id, name, briefing and tags, kept across category tabs
- [x] Seen in the app on the dev server
- [x] One scene per known skill, chosen by what the skill does
- [x] Animated cover on skill cards in the catalog lists and in the wizard
- [x] Compact card footer pinned to the bottom of its row
- [x] Light theme without silver greys: near-white page, white cards
- [x] No grey picture on a skill cover
- [x] No black band on a skill cover, in either theme
- [ ] Final checkpoint (typecheck, lint)

## What was made
- Each skill card has a looping cover scene chosen from its glyph and tinted with the card's poster tone.
- 9 skills carry a case retold from the recorded AI Creator Engine run `2026-11-16-s1-mock-smoke-test-automate-meeting-notes`; every number in the texts is read from that run's manifests, and the card names the run and says its providers were mocked.
- A skill with no recorded run shows "No recorded case for this skill yet."
- Each card shows "Used in N recent runs" and a link to the newest run, or "Not used in a recent run yet." A failed read of runs or recipes hides the line; the cards still render.
- A search form filters the cards on the server through `?busca=`; category tabs and counts follow the search, and "Clear search" removes it.
- Second pass: the cover scene is now picked by the skill's id (producer: chat bubbles; script: page; voiceover: waveform; fact-check: checklist; hook: captions; scene-generator: grid of tiles; demo-capture: recorded screen; tiktok-render: 9:16 canvas; quality-gate: sweep over a picture; seo-package: text lines; publish-review: diff; trend-research: graph; analytics-loop: bars). A skill not in the list keeps the scene of its artwork glyph.
- Second pass: the same animated cover shows on skill cards in the catalog section and kind lists and in the wizard's "Add to pipeline" Skills tab. Before, only the catalog Skills page had it.
- Second pass: on compact cards (catalog lists, wizard) the footer had lost `margin-top: auto` to a `margin` shorthand, so a card with less text than its row left a gap under the footer. The top margin is `auto` again.
- Third pass: the light theme page is `#F7F7FA` and cards are white; the muted surface is `#F1F1F4`, the glass is white at 80% and the border is `#E0E0E6`. This is app-wide: every page of the web app and every `@studio/ui` consumer reads these tokens. The dark theme is unchanged.
- Third pass: on skill covers the "before" half of the grade scene is the picture's own tones sunk into the black stage, and the capture scene's screen is a dark panel in the card's tone with a border of the same tone. Neither is grey now.
- Fourth pass: the cover is a surface of the theme washed with the card's tone at 12%: white under it on the light theme, `--color-gray-900` on the dark one. Marks are drawn in the text colour, so they are dark on the light cover and light on the dark one. The sheet of the script scene and the logo mark stay white in both themes, with a border or a shadow.

## Not done
- The Skill Deck's "Copy command" button was left out: studio skills are bound to presets and are not run as slash commands.
- 4 `fagmer-video-*` skills and the test skill have no case; no run was recorded for them.
- Run usage looks at the newest 100 runs and at most 20 distinct recipe versions; older runs are not counted.
- No typecheck, lint or test has run.
- Third pass: no contrast script was run on the new light values; the text, primary and warning colours were not changed, and they sit on lighter surfaces than before.
- Third pass: `apps/portal/out/` is a built copy and still holds the old greys until the portal is built again.

## User checklist
- [ ] Approve the final checks when wanted: `pnpm --filter @studio/web typecheck` and `pnpm --filter @studio/web lint`.

## Verification
Seen in the app on the dev server (127.0.0.1:4310, `/catalogo?secao=ia-e-escrita&tipo=skill`, 2026-11-27): animated covers on the cards; 9 "Real case" regions; `fagmer-video-hook` shows "Used in 40 recent runs" with a link to its newest run, other skills "Not used in a recent run yet."; `?busca=render` shows 3 skills, the tabs keep `busca`, "Clear search" is present; at 375px in the light theme the page has no horizontal overflow. No console error.
Second pass, seen in the app on the dev server (127.0.0.1:4310, 2026-11-27): Catalog Skills page shows a different scene on each of the 13 `fagmer-video-*` cards, all with a running animation; `/catalogo?secao=ia-e-escrita` shows the cover on all 14 skill cards and every card's footer ends at the card's bottom (gap 0 on 18 cards); `/criar`, step "Add to pipeline", tab "Skills" shows the cover on 16 of 16 cards, and tab "AI & writing" shows both "Add" footers on one line. No console error.
Third pass, seen in the app on the dev server (127.0.0.1:4310, 2026-11-27): in the light theme the page computes to `rgb(247, 247, 250)` and a card to `rgb(255, 255, 255)` with a `rgb(224, 224, 230)` border, on the catalog Skills page and on `/criar`; the quality-gate cover shows a dark toned picture under the colour sweep and the demo-capture cover a dark toned screen, in both themes; the dark theme looks as before. No console error.
Fourth pass, seen in the app on the dev server (127.0.0.1:4310, catalog Skills page, 2026-11-27): 14 of 14 covers; on the light theme the cover computes to a gradient from `color(srgb 0.917 0.923 0.980)` to `color(srgb 0.981 0.899 0.936)` and the marks read on it; on the dark theme the cover is a deep toned surface, not black. No console error. The wizard and the catalog section lists use the same component and were not opened again.
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-27 | Ricardo Fagmer | target page | approved | "Video Studio catalog skills"
- 2026-11-27 | Ricardo Fagmer | real cases source | approved | "Both"
- 2026-11-27 | Ricardo Fagmer | visual style | approved | "Deck layout, console colours (Recommended)"
- 2026-11-27 | Ricardo Fagmer | cards or table | approved | "Cards replace table (Recommended)"
- 2026-11-27 | Ricardo Fagmer | planning | approved | "Fast change (supervisor)"
- 2026-11-27 | Ricardo Fagmer | real runs | approved | "Count plus latest run (Recommended)"
- 2026-11-27 | Ricardo Fagmer | final checks | skipped | "Skip for now": typecheck and lint stay pending
- 2026-11-27 | Ricardo Fagmer | where the covers show | approved | "Every skill card (Recommended)"
- 2026-11-27 | Ricardo Fagmer | scene per skill | approved | "One fixed per skill (Recommended)"
- 2026-11-27 | Ricardo Fagmer | which silver | approved | "Both": the light theme page and cards, and the grey pictures on skill covers
- 2026-11-27 | Ricardo Fagmer | light theme look | approved | "Near-white, white cards (Recommended)"

## Changes registered
The working tree also holds other sessions' uncommitted work (230 files in `git diff --stat HEAD`); only this change's lines are listed. Nothing is committed, no file was moved or renamed.

`git status --short` (2026-11-27, this change's files):
```
 M apps/web/src/app/(studio)/catalogo/page.tsx
 M apps/web/src/features/skills/components/SkillList.tsx
 M apps/web/src/features/skills/components/SkillsCatalogPanel.tsx
 M apps/web/src/features/skills/skill-list.ts
 M apps/web/src/features/skills/skills.module.css
 M apps/web/src/messages/skills/en.ts
 M apps/web/src/messages/skills/es.ts
 M apps/web/src/messages/skills/pt-BR.ts
?? .engineos/changes/2026-11-27-skills-deck-real-cases.md
?? apps/web/src/features/skills/components/SkillStage.tsx
?? apps/web/src/features/skills/skill-cases.ts
?? apps/web/src/features/skills/skill-stage.module.css
?? apps/web/src/features/skills/skill-stage.ts
?? apps/web/src/features/skills/skill-usage.server.ts
```

`git diff --stat HEAD` (2026-11-27, this change's files; new files are untracked and not counted):
```
 apps/web/src/app/(studio)/catalogo/page.tsx        |   9 +-
 .../src/features/skills/components/SkillList.tsx   |  65 ++++-
 .../skills/components/SkillsCatalogPanel.tsx       |  78 ++++--
 apps/web/src/features/skills/skill-list.ts         |  34 ++-
 apps/web/src/features/skills/skills.module.css     |  92 +++++--
 apps/web/src/messages/skills/en.ts                 |  94 +++++++
 apps/web/src/messages/skills/es.ts                 |  94 +++++++
 apps/web/src/messages/skills/pt-BR.ts              |  99 ++++++++
```
`catalogo/page.tsx` and the three `messages/skills` files may also carry lines from other sessions' work in the same tree.

Second pass also modified, with no move or rename: `apps/web/src/features/catalog/components/CatalogAssetItem.tsx`, `apps/web/src/features/wizard/components/WizardLibraryCard.tsx` (untracked, new in another session), `apps/web/src/features/common/poster-card.module.css`, and again `skill-stage.ts`, `SkillStage.tsx`, `skill-stage.module.css`, `SkillList.tsx`.

Third pass also modified, with no move or rename: `packages/ui/src/styles/tokens.css`, `design/tokens.md`, and again `apps/web/src/features/skills/skill-stage.module.css`.

The record stays `status: active`: no check has run, so it cannot be marked done or archived yet.
