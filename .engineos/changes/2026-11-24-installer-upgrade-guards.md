---
name: 2026-11-24-installer-upgrade-guards
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-24-installer-upgrade-guards-design.md
domain: backend
security_review: pending
preview: declined
risk: high
new_feature: false
release: false
---

## What
Two fixes in the desktop installer. `studio stop` now recognises the packaged API (its path holds
spaces) and services another app copy recorded, and setup's "Prepare the database" step refuses to
run `migrate deploy` while something still listens on the API port or has the database open. In the
packaged app the menu's Start runs setup first while the last setup run has not completed.

## Why
On 2026-11-24 an upgrade over a running install failed: the old API survived the new app's
`studio stop` and the database step answered `migrations-failed`; later the services started against
a database with a pending migration while setup was unfinished
(`.engineos/changes/2026-11-24-skills-page-redesign.md`, Verification, 07:39 to 08:05).

Root cause of the survival: `isLaunchedProcess` split the `ps` command line on whitespace and looked
for the entry file as one token. The packaged entry file is under
`/Applications/EngineOS Video Creator.app/`, so it was never found and every packaged API was judged
`foreign`: not signalled, its pid record removed. The move to the Trash was not the cause.

## Scope
- `tools/cli/src/services/`: `process-identity.ts`, `service-manager.ts`
- `apps/shell/src/setup/`: `database-holders.ts` (new), `start-gate.ts` (new),
  `steps/migrations.step.ts`, `setup-types.ts`, `setup-log.ts`
- `apps/shell/src/electron/`: `packaged-mode.ts`, `shell-app.ts`
- `apps/shell/src/i18n/`: `setup-labels-en.ts`, `setup-labels-pt-br.ts`, `setup-labels-es.ts`
  (two sentences each; outside the three folders of the task, allowed by the owner)
- Tests (authored, not run): five files listed under "What was made"
- Not touched: `apps/web`, the data home, any build or packaging output

## Checklist
- [x] Find why the old API was judged foreign, with evidence
- [x] Propose the quit behaviour and record the owner's decision
- [x] Spec under `docs/specs/`
- [x] `studio stop` recognises a spaced entry path and another copy's record
- [x] Migrations step refuses while the API port or the database is in use, with its own reasons
- [x] Packaged Start runs setup first while setup is incomplete
- [x] Unit tests authored
- [ ] Typecheck, lint and tests run (the owner answered "Skip for now" on 2026-11-24)
- [ ] Security review and independent critic pass (risk high; the owner declined both on 2026-11-24)

## What was made
- `isLaunchedProcess` matches the entry path as one whole argument of the command line, bounded by
  the ends of the line or whitespace, so a path with spaces matches and a longer path containing it
  does not.
- `recordedProcess` identifies the live pid against the entry path and port its own record names.
  The result is `ours` with a `current` flag (the recorded entry file is this copy's) or `foreign`.
  `stopService` stops any `ours` process and re-verifies with the recorded identity before
  `SIGKILL`; `startService` answers "already running" only for a current one and keeps another
  copy's record so `stop` can still stop it; `serviceState` reports another copy's service as a
  foreign record, as before.
- `database-holders.ts`: two read-only `lsof` questions through the injected process runner
  (listener on a TCP port; processes with a file open), answering `free`, `held` or `unknown`.
- `migrations.step.ts`: after `bootoutAgent` and `studio stop`, the step polls both questions (up to
  5 times, 500 ms apart). While either is not `free` it returns `failed` with `api-still-running`
  or `database-in-use` and never requests `migrate deploy`. `unknown` counts as in use.
- `setup-types.ts`: the two reason ids. The three label files: one sentence per reason and locale.
- `start-gate.ts`: `startGate(lastProgress)` answers `start` only for phase `complete`.
  `PackagedShell.requestStart()` logs `start-deferred` (new setup log event), opens the setup window
  and runs setup when the gate says `setup-first`; `shell-app.ts` spawns `studio start` only when it
  says `start`. Stop and development mode are unchanged.
- Tests authored, not run: `tools/cli/src/services/process-identity.test.ts`,
  `tools/cli/src/services/service-manager.test.ts` (real idle child processes in a temp folder;
  skipped where `/bin/ps` is not permitted), `apps/shell/src/setup/database-holders.test.ts`,
  `apps/shell/src/setup/steps/migrations.step.test.ts`, `apps/shell/src/setup/start-gate.test.ts`.

## Not done
- Quit does not stop the services: decided by the owner ("Keep running"), no code change.
- Setup does not stop a leftover process that has no pid record: it refuses and says so (spec,
  rejected alternatives).
- Follow-up, not in this change: setup's "start services" step calls services current when the app
  version and install path are unchanged. Two builds of version 0.1.0 at the same path look the same
  to it, so a rebuild with no pending migration keeps the old services serving.
- ADR 0005 was not edited; the spec records the quit decision.

## User checklist
- [ ] Run the final checks when you want them (skipped on 2026-11-24): typecheck and lint of `@studio/shell` and `@studio/cli`, then the five new test files; the code has never been compiled or run
- [ ] After the checks pass, ask for this record to be archived (recording was deferred on 2026-11-24; it stays active until then)
- [ ] Ask for the security review or the critic pass if you change your mind (both declined on 2026-11-24)
- [ ] Rebuild and repackage the desktop app when you want this fix installed (`pnpm exec turbo run build`, then `pnpm --filter @studio/shell run package:dmg`); nothing was built
- [ ] After installing that build, replace the app while the old one is running once, to see the upgrade pass

## Verification
[validation] pending — final-stage user approval required (typecheck, lint, tests)
Read-only observations on the owner's Mac, 2026-11-24, no check or test run:
- Between 08:11 and 08:16: `ps -ww -o command=` for the API (pid 14263, started 07:57:51) printed
  `/Applications/EngineOS Video Creator.app/Contents/Resources/runtime/node/bin/node /Applications/EngineOS Video Creator.app/Contents/Resources/runtime/payload/api/dist/main.js`.
  It listened on 4311 and both pid files were absent, after the app's relaunch at 08:11:10: the
  setup's `studio stop` had stopped the web and removed the API's record without signalling it.
- The old check on that exact line, `commandLine.split(/\s+/).includes(entryPath)`, evaluated with
  `node -e`: `false`.
- `lsof` answers the guard parses, seen at 08:19: `lsof -nP -iTCP:4311 -sTCP:LISTEN -t` printed one
  pid, exit 0; the same for unused port 4399 printed nothing, exit 1; `lsof -nP -t <database file>`
  printed two pids (watcher and API), exit 0; a missing file printed nothing, exit 1.
- At 08:19 the machine was healthy again (API pid 22505 and watcher pid 22498 started 08:16, both pid
  files present); not done by this session.
- The new code was read back after writing; it was not compiled, linted or executed.

## Human decisions
- 2026-11-24 | owner | high-risk | approved | quit behaviour: "Keep running (Recommended)"
- 2026-11-24 | owner | high-risk | approved | label files outside the named folders: "Allow the label files (Recommended)"
- 2026-11-24 | owner | none fired | declined | prototype preview: "No preview (Recommended)"
- 2026-11-24 | owner | none fired | deferred | final checks (typecheck and lint of @studio/cli and @studio/shell, the five new test files): "Skip for now". Nothing ran
- 2026-11-24 | owner | high-risk | declined | security review (read-only reviewer): "Decline security review". No reviewer ran; `security_review` stays pending
- 2026-11-24 | owner | high-risk | declined | independent critic pass: "Decline critic". No critic ran
- 2026-11-24 | owner | none fired | declined | extra artifact: "Proceed without artifact (Recommended)"
- 2026-11-24 | owner | none fired | declined | session retro: "No retro (Recommended)"
- 2026-11-24 | owner | none fired | deferred | archiving this record: "Defer recording (Recommended)". The record stays active until the final checks run; the session's Stop-gate deferral marker was created

## Changes registered
The folder is not a git repository; files written by this change:
- A `docs/specs/2026-11-24-installer-upgrade-guards-design.md`
- A `.engineos/changes/2026-11-24-installer-upgrade-guards.md`
- M `tools/cli/src/services/process-identity.ts`
- M `tools/cli/src/services/service-manager.ts`
- A `tools/cli/src/services/process-identity.test.ts`
- A `tools/cli/src/services/service-manager.test.ts`
- A `apps/shell/src/setup/database-holders.ts`
- A `apps/shell/src/setup/database-holders.test.ts`
- A `apps/shell/src/setup/start-gate.ts`
- A `apps/shell/src/setup/start-gate.test.ts`
- M `apps/shell/src/setup/steps/migrations.step.ts`
- A `apps/shell/src/setup/steps/migrations.step.test.ts`
- M `apps/shell/src/setup/setup-types.ts`
- M `apps/shell/src/setup/setup-log.ts`
- M `apps/shell/src/electron/packaged-mode.ts`
- M `apps/shell/src/electron/shell-app.ts`
- M `apps/shell/src/i18n/setup-labels-en.ts`
- M `apps/shell/src/i18n/setup-labels-pt-br.ts`
- M `apps/shell/src/i18n/setup-labels-es.ts`

## Notes
- Related earlier change: `.engineos/changes/2026-11-22-cli-service-port-identity.md` (the renamed
  `next-server` title rule this change keeps).
- The EngineOS path hook routes `tools/cli/**` to the `llm` intent; this change is installer work
  and was routed by hand (`corrected_from=llm,dba,record-change`).
- The sentence for `api-still-running` names port 4311, the packaged default
  (`PACKAGED_API_PORT`); change both together if that port ever changes.
