---
name: 2026-11-23-brand-kit-images
status: active
owner: Ricardo Fagmer
spec: n/a — asset swap requested directly by the developer (images only, colors unchanged); no new behavior
domain: frontend
security_review: pending
risk: low
new_feature: false
release: false
---

## What
Apply EngineOS Brand Kit v1 images (logo mark, favicons, banners, macOS app icon) to the web studio, the download portal and the desktop shell packaging. Colors and tokens stay as they are.

## Why
The developer asked to apply the project's new digital identity from `EngineOS_Brand_Kit_v1.zip`, limited to images (answer on 2026-11-23: "only images, logos, banners, favicon, icons, the colors keep as it is").

## Scope
- `packages/ui/src/components/layout/Logo.tsx`, `Logo.module.css`: "VC" monogram replaced by the brand app tile image.
- `apps/web/public/brand/` (mark, light and dark banners), `apps/web/src/app/icon.png`, `apple-icon.png`.
- `apps/web/src/app/login/page.tsx`, `apps/web/src/features/auth/login.module.css`: theme-aware banner in the login intro.
- `apps/portal/public/brand/` (mark, hero), `apps/portal/src/app/icon.png`, `apple-icon.png`.
- `apps/portal/src/components/PortalPage.tsx`, `portal.module.css`: hero banner above the tagline.
- `apps/shell/resources/engineos.icns`, `apps/shell/scripts/package-app.mjs`: packager `icon` option.

## Checklist
- [x] Trim kit crops to their rounded tiles and make the outer corners transparent
- [x] Swap the shared Logo mark
- [x] Favicons and Apple touch icons for web and portal
- [x] Login banner per theme; portal hero banner
- [x] macOS app icon (.icns) wired into packaging
- [x] Visual check in the browser: web login light, dark, 375px; portal
- [ ] Lint and typecheck of web, portal, ui (awaiting developer approval)
- [ ] Packaged .app icon seen in Finder (needs a shell package run)

## What was made
- Cleaned four kit images with Pillow (trimmed to the tile, rounded transparent corners) and generated 64px and 180px favicons and a 16-1024px `.icns`.
- `Logo` now renders `/brand/engineos-mark.png` at `--size-logo`; every Logo consumer (studio navbar, login, portal) shows the brand tile.
- Web and portal serve `icon.png` and `apple-icon.png` through the Next app-router file convention (both answer 200 image/png).
- Login intro shows `engineos-banner-light.png` in light theme and `engineos-banner-dark.png` in dark theme, following both the forced `data-theme` and the system preference.
- Portal shows `engineos-hero.png` above the download heading.
- `package-app.mjs` passes `icon: resources/engineos.icns` to `@electron/packager`; the tray keeps its text title.

## Not done
- Lint and typecheck not run; the final checkpoint question is pending with the developer.
- The packaged app icon was not seen in Finder; no package run was done.
- Tray icon unchanged (it is a text title by design).

## User checklist
- [ ] Lint and typecheck of web, portal and ui (skipped for now on 2026-11-23; reopen when ready)
- [ ] Package the shell once and confirm the Finder icon
- [ ] Optional: provide a high-resolution app tile export (kit tile is 170px, so large icns sizes are upscaled and soft)
- [ ] Decide on the queued security review (login.module.css sits under the auth feature path; the change is visual only)

## Verification
- Browser check (manual, 2026-11-23): `/login?manual=1` on 127.0.0.1:4320 in dark, light and 375px; all three brand images loaded (`naturalWidth > 0`), the inactive banner had `display: none`, and the page did not scroll sideways (scrollWidth 375). Portal on 127.0.0.1:3100 showed the mark and the hero.
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-23 | Ricardo Fagmer | scope choice (no hitl reason fired) | approved | images only, colors unchanged; app-tile PNG chosen for the in-app mark.
- 2026-11-23 | Ricardo Fagmer | final checkpoint (lint, typecheck) | skipped | answer: "Skip for now"; checks stay pending, not green.
- No `hitl.required` reason fired (risk low, A2).

## Changes registered
Worktree already carried a lot of uncommitted work before this task (branch `chore/rename-change-record-followup`); the paths listed under Scope are the only ones this change touched.

`git status --short` (brand-relevant paths, 2026-11-23):
```
 M apps/shell/scripts/package-app.mjs
 M apps/web/src/app/login/page.tsx
 M packages/ui/src/components/layout/Logo.module.css
 M packages/ui/src/components/layout/Logo.tsx
?? apps/portal/public/
?? apps/portal/src/app/            (pre-existing untracked; adds icon.png, apple-icon.png)
?? apps/portal/src/components/     (pre-existing untracked; PortalPage.tsx, portal.module.css edited)
?? apps/shell/resources/
?? apps/web/public/                (pre-existing ajuda/ plus new brand/)
?? apps/web/src/app/apple-icon.png
?? apps/web/src/app/icon.png
?? apps/web/src/features/auth/login.module.css   (pre-existing untracked; banner rules added)
```

`git diff --stat HEAD` over the tracked files (includes earlier uncommitted work in the same files):
```
 apps/shell/scripts/package-app.mjs                 |  74 +++--
 apps/web/src/app/login/page.tsx                    |  90 +++++-
 packages/ui/src/components/layout/Logo.module.css  |  31 +-
 packages/ui/src/components/layout/Logo.tsx         |  22 +-
```

## Notes
- Kit PNGs are RGB with the dark sheet in the corners; the cleaning script is session scratch, not committed. Re-run it against a future kit version rather than copying raw crops.
- `--letter-spacing-logo` token is no longer used by Logo; left in place since colors and tokens were out of scope.
