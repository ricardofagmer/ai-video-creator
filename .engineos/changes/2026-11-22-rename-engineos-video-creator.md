---
name: 2026-11-22-rename-engineos-video-creator
status: active
owner: Ricardo Fagmer
spec: n/a — product rename (string and identifier replacement), no new behavior; C21 spec link still to be confirmed before archival
domain: general
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
Rename the product from "Video Studio" to "EngineOS Video Creator": display name plus code identifiers.

## Why
The owner asked to rename the product to EngineOS Video Creator (2026-11-22).

## Scope
Live code, scripts, config and docs of the `video-studio/` monorepo: README, `design/`,
`docs/design-system.md`, `seeds/README.md`, `apps/*`, `packages/*`, `tools/cli`, `scripts/`,
`.github/workflows/ci.yml`. Excluded by owner decision: history (`docs/adr`, `docs/specs`,
`docs/prds`, `docs/vetting`, `.engineos/`) and machine state (data folder
`~/Library/Application Support/VideoStudio`, `com.videostudio.*` Keychain services, launchd
label, bundle id). Folders `video-studio/` and `ai-video-creator/` are not renamed.

## Checklist
- [x] Inventory display-name and identifier occurrences
- [x] Owner chose scope: display name + identifiers; history left as-is; live machine-state ids kept
- [x] Replace "Video Studio" with "EngineOS Video Creator" in live files
- [x] Rename `VIDEO_STUDIO_*` env vars to `ENGINEOS_VIDEO_CREATOR_*`
- [x] Rename trace/manifest service names `video-studio-{watcher,api,shell}` to `engineos-video-creator-*`
- [x] Root package `video-studio` renamed to `engineos-video-creator`; monogram "VS" to "VC"
- [x] Revert an accidental edit to the ignored build output `apps/shell/out/` (codesign --verify passes)
- [ ] Final checks (typecheck, lint, tests) — owner answered "Skip for now" (2026-11-22); pending

## What was made
Replaced the display name in 66 live files (web titles, logo, CLI dashboard and help, install and
uninstall messages, Keychain item labels, design references, README). Renamed every
`VIDEO_STUDIO_*` env var to `ENGINEOS_VIDEO_CREATOR_*` across code, tests, the launchd plist
template, scripts, README and `apps/web/.env.example`. Renamed the trace service names and the
shell manifest name. Renamed the root package and the logo monogram (VS to VC). Packaged app name
(`APP_NAME`, `STUDIO_SHELL_APP_NAME`) is now "EngineOS Video Creator".

## Not done
- Final checks (typecheck, lint, tests) not run: pending the owner's approval.
- History docs and `.engineos/` intentionally keep the old name (owner decision).
- Data folder, Keychain service names, launchd label and bundle id intentionally unchanged (owner decision).

## User checklist
- [ ] Run the final checks (typecheck, lint, tests) when ready; skipped for now on 2026-11-22
- [x] Re-run `scripts/install.sh` so the watcher's launchd plist uses the new env var names (2026-11-22)
- [x] Rename any personal `VIDEO_STUDIO_*` env overrides to `ENGINEOS_VIDEO_CREATOR_*` (none were set)
- [x] Rebuild the menu app; remove an old `Video Studio.app` if one is installed (2026-11-22)
- [x] Commit the change (commit `1fbf663` on main, not pushed)

## Verification
- [validation] pending — final-stage user approval required
- inspected: grep confirms no "Video Studio", `VIDEO_STUDIO_` or `video-studio-{watcher,api,shell}` left in live files; only the kept `VideoStudio` data-folder path remains (2026-11-22)
- inspected: `codesign --verify --deep --strict` on `apps/shell/out/Video Studio-darwin-arm64/Video Studio.app` passes after the revert (2026-11-22)

## Human decisions
2026-11-22 | Ricardo Fagmer | none (no hitl reason fired) | approved | Scope "Display name + identifiers"; history "Leave history as-is"; live state "Keep them unchanged"
2026-11-22 | Ricardo Fagmer | none (final checkpoint) | deferred | Final checks answer "Skip for now"; typecheck, lint and tests stay pending until reopened

## Changes registered
`git status --short` limited to this change (the working tree also holds earlier, unrelated
modifications and untracked test folders not made by this change; the four `??` files below are
pre-existing untracked files this change edited):

```
 M .github/workflows/ci.yml
 M README.md
 M apps/api/src/platform/api-config.ts
 M apps/shell/README.md
 M apps/shell/scripts/package-app.mjs
 M apps/shell/src/actions/child-environment.ts
 M apps/shell/src/actions/studio-invoker.test.ts
 M apps/shell/src/cli/shell-arguments.test.ts
 M apps/watcher/launchd/com.videostudio.watcher.plist.template
 M apps/watcher/src/hyperframes-runtime/sandbox-args.test.ts
 M apps/watcher/src/stages/shared/stage-settings.ts
 M apps/web/.env.example
 M apps/web/package.json
 M apps/web/src/app/(studio)/layout.tsx
 M apps/web/src/app/layout.tsx
 M apps/web/src/app/login/page.tsx
 M apps/web/src/lib/config/web-config.ts
 M design/README.md
 M design/componentes-estudio.md
 M design/componentes.md
 M design/telas/01-layout-e-login.md
 M design/telas/02-catalogo-lista.md
 M design/telas/03-catalogo-ativo.md
 M design/telas/04-catalogo-envio.md
 M design/telas/05-receitas-lista.md
 M design/telas/06-receita-editor.md
 M design/telas/07-execucoes-lista-e-nova.md
 M design/telas/08-execucao-linha-do-tempo.md
 M design/telas/09-revisao.md
 M docs/design-system.md
 M package.json
 M packages/core/prisma/schema.prisma
 M packages/core/src/paths/data-home.ts
 M packages/core/src/platforms/clients/mock/mock-platform-client.ts
 M packages/core/src/platforms/platform-modes.config.ts
 M packages/core/src/platforms/vault/keychain-token-vault.test.ts
 M packages/core/src/platforms/vault/token-vault.port.ts
 M packages/core/src/providers/provider-modes.config.ts
 M packages/core/src/secrets/secret-names.ts
 M packages/core/src/seed/commands/seed-catalog.command.ts
 M packages/core/src/seed/seed-source.ts
 M packages/core/src/seed/seed.errors.ts
 M packages/eslint-config/package.json
 M packages/shared/src/platforms/enums.ts
 M packages/shared/src/telemetry/allowlist.test.ts
 M packages/shared/src/telemetry/allowlist.ts
 M packages/shared/src/telemetry/trace-export.test.ts
 M packages/shared/src/telemetry/trace-export.ts
 M packages/tsconfig/package.json
 M packages/ui/package.json
 M packages/ui/src/components/layout/Logo.tsx
 M packages/ui/src/styles/tokens.css
 M packages/video/src/templates/product-tour/tour-sample.ts
 M scripts/install.sh
 M scripts/lib/common.sh
 M scripts/uninstall.sh
 M seeds/README.md
 M tools/cli/src/commands/platforms.command.test.ts
 M tools/cli/src/commands/platforms.command.ts
 M tools/cli/src/errors/cli.errors.ts
 M tools/cli/src/errors/error-report.ts
 M tools/cli/src/program/program.ts
 M tools/cli/src/services/service-spec.ts
 M tools/cli/src/settings/cli-settings.ts
 M tools/cli/src/traces/traces-export.command.test.ts
 M tools/cli/src/ui/dashboard.tsx
?? apps/api/src/__tests__/isolation.test.ts
?? apps/watcher/src/test-support/isolation.test.ts
?? packages/core/src/test-support/isolation.test.ts
?? tools/cli/src/__tests__/settings.test.ts
```

`git diff --stat HEAD` over the tracked files above: 66 files changed, 219 insertions(+), 165 deletions(-).
No renames or moves.

## Notes
Commit scope (2026-11-22, owner chose "Commit on main"): the 66 tracked rename files plus this
record. Left out: the 4 untracked test files above (they hold earlier, unrelated work). For
`tools/cli/src/services/service-spec.ts` and `apps/web/src/app/login/page.tsx`, which also carry
unrelated uncommitted work (CLI port identity, login redesign), only the rename was staged (HEAD
content with the rename applied); the other work stays uncommitted in the working tree.

Follow-ups run on 2026-11-22: no personal `VIDEO_STUDIO_*` variables were set (shell files and
environment checked); the old `~/Applications/Video Studio.app` had its login item unregistered
and was moved to the Trash; `scripts/install.sh` was re-run without a database backup (owner
answer "Install without backup"); its first run stopped at step 8 with "database is locked", so
the running web, api and watcher were stopped and the installer re-run (step 8: no pending migrations).
Step 12 only accepts an answer typed at a terminal; on the owner's "go for step 12" the installer
was run under `expect`, which sent "s" at that question. Two more re-runs were needed because the
api and watcher again held `studio.sqlite` at step 8; they were stopped with `studio stop` and
`launchctl bootout` first. Final run: step 12 built and installed
`~/Applications/EngineOS Video Creator.app` (codesign --verify --deep --strict passes); step 13
re-registered `com.videostudio.watcher` (running) with plist keys `ENGINEOS_VIDEO_CREATOR_API_PORT`
and `ENGINEOS_VIDEO_CREATOR_WEB_PORT`; step 14 seed: 0 created, 34 unchanged, 0 failed; step 15
started web and api, `studio doctor` "Resultado: tudo certo" (warnings only for the provisional
search model).

The first bulk edit failed harmlessly (zsh does not word-split unquoted variables); the second
pass also hit the gitignored build output `apps/shell/out/`, which was reverted byte-exact.
