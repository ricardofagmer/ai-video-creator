---
name: 2026-11-19-zod4-migration
status: done
completed: 2026-11-19
owner: Ricardo Fagmer
spec: docs/specs/2026-11-19-zod4-migration.md
domain: backend
security_review: not-required
risk: medium
new_feature: false
release: true
---

## What
Move every workspace from zod `^3.25.76` to `^4.6.7` and fix the zod 4 breaking changes, to clear
GHSA-mrhx-c7xc-m3w5 (high, zod < 4.6.6). Spans backend (api, watcher, core), frontend (web) and llm (Mastra
tool adapters in core); recorded under backend.

## Why
The advisory was left as a residual risk in 2026-11-19-deps-audit-fixes by owner decision; this is the
owner-requested follow-up change.

## Scope
Branch chore/zod4-migration (worktree ../video-studio-zod4), from chore/deps-audit-fixes at 2d744ec.
8 workspace manifests, pnpm-lock.yaml, zod type/API fixes in apps/api, apps/watcher, apps/web, packages/core,
packages/shared, packages/toolbox, tools/cli (packages/video: manifest only).

## Checklist
- [x] T0 manifests + lockfile (diff shown, install approved)
- [x] T1 packages/shared (typecheck clean, 149/149 shared tests)
- [x] T2 packages/core (typecheck clean)
- [x] T3 apps/api, apps/web, apps/watcher (typecheck clean)
- [x] T4 packages/toolbox, packages/video, tools/cli (typecheck clean; turbo typecheck 14/14)
- [x] T5 pnpm audit --prod clean of zod; turbo checks green with output

## What was made
- Moved zod 3.25.76 -> 4.6.7 in all 8 workspaces; zod 3 left pnpm-lock.yaml (vetted: npm latest, SLSA
  provenance from colinhacks/zod main, fixes the advisory from 4.6.6).
- @studio/shared: exported `RecipeBaseSchema` and `ScheduleFileBaseSchema` (the unrefined objects; zod 4
  throws on `.omit()` of a refined object) and rebuilt `RecipeSchema` / `ScheduleFileSchema` on them unchanged;
  switched the two enum-keyed records in ace/run.ts to `partialRecord` (keeps v3 partial behaviour); typed the
  `queryList` pipe; ported helper signatures off `ZodTypeDef`. No wire-shape change.
- core/api/web/watcher/toolbox: ported to v4 type names (`ZodSafeParseResult`, `ZodPreprocess`,
  `PropertyKey[]` issue paths, `ZodType<T, I>`); core `schedule.input.ts` reads `ScheduleFileBaseSchema.shape`.
- API `details.issues[].code` now carries zod 4 code names (owner decision).
- Wrote docs/specs/2026-11-19-zod4-migration.md (spec, inventory, tickets, decisions).

## Not done
- Done-gate browser walk (qa-tester): not run. The web/api edits are type-only signatures, and starting the
  stack needs the `.env` files this task placed off-limits.
- Planned T2-T4 workers were not dispatched: the remaining fallout after T1 was 6 type errors in 4 files,
  fixed inline by the supervisor (spec "Execution note").

## User checklist
- [ ] Commit the 34 changed files plus the spec and this record on chore/zod4-migration (git write, needs approval).
- [ ] Open the PR for chore/zod4-migration after chore/deps-audit-fixes lands, or stack it on that PR.
- [ ] Optional: walk the web app once (catalog asset form, new run form) with your local `.env` to see the
      v4 validation messages in place.
- [ ] When merging with feat/r3-outside-signals, rebase over its uncommitted api runs/core metrics edits
      (no file overlap with this change).

## Verification
- ran: `pnpm exec tsc -p tsconfig.json --noEmit` exit 0 (2026-11-19) — packages/shared
- ran: `pnpm test` exit 0 (2026-11-19) — packages/shared, 149 pass
- ran: `pnpm exec turbo run typecheck --continue` exit 0 (2026-11-19) — 14/14 tasks
- ran: `pnpm audit --prod` exit 0 (2026-11-19) — "No known vulnerabilities found"
- ran: `pnpm exec turbo run typecheck lint test build --filter='@studio/*'` exit 0 (2026-11-19) — 28/28 tasks, 355 tests pass
- ran: `pnpm exec turbo run typecheck build --filter='@ace/*'` exit 0 (2026-11-19) — 5/5 tasks, cache replays of runs on this tree
- Proportional checkpoint (`kernel checkpoint --risk medium --release true`): checks ask, security skip,
  security_reasons empty -> `security_review: not-required`.

## Human decisions
No `hitl.required` reason fired (risk medium; no reason from registries/policy.json hitl.reasons). Owner
decisions taken through clickable questions:

| When | Who | Reason ids | Decision |
|---|---|---|---|
| 2026-11-19 | Ricardo Fagmer | — | New branch from committed deps branch; approved |
| 2026-11-19 | Ricardo Fagmer | — | API issue codes follow zod 4 values (shape unchanged); approved |
| 2026-11-19 | Ricardo Fagmer | — | typecheck + @studio/shared tests allowed during implementation; approved |
| 2026-11-19 | Ricardo Fagmer | — | Spec and tickets; approved |
| 2026-11-19 | Ricardo Fagmer | — | `git worktree add -b chore/zod4-migration`; approved and run |
| 2026-11-19 | Ricardo Fagmer | — | Manifest + lockfile diff shown; `pnpm install --frozen-lockfile` approved and run |
| 2026-11-19 | Ricardo Fagmer | — | Final-gate checks (audit + both turbo commands); approved and run once |
| 2026-11-19 | Ricardo Fagmer | — | Extra artifact offer; declined |

## Changes registered
`git status --short` (2026-11-19, before archiving this record):
```
 M apps/api/package.json
 M apps/api/src/catalog/catalog-upload.service.ts
 M apps/api/src/platform/api-config.ts
 M apps/watcher/package.json
 M apps/watcher/src/mocks/executors/mock-artifacts.ts
 M apps/watcher/src/mocks/executors/mock-stage-behaviour.ts
 M apps/watcher/src/stages/process/tool-runner.client.ts
 M apps/watcher/src/stages/shared/stage-io.ts
 M apps/web/package.json
 M apps/web/src/features/catalog/asset-form/kind-details-model.ts
 M apps/web/src/features/runs/new-run-model.ts
 M apps/web/src/lib/config/web-config.ts
 M packages/core/package.json
 M packages/core/src/agents/call/role-parsers.ts
 M packages/core/src/agents/tools/mastra-tool.adapter.ts
 M packages/core/src/agents/tools/tool-wrapper.ts
 M packages/core/src/embeddings/embedding-source.mapper.ts
 M packages/core/src/providers/provider-modes.config.ts
 M packages/core/src/schedules/schedule.input.ts
 M packages/shared/package.json
 M packages/shared/src/ace/run.ts
 M packages/shared/src/agents/tool-envelope.ts
 M packages/shared/src/api/common.ts
 M packages/shared/src/api/recipes.ts
 M packages/shared/src/api/schedules.ts
 M packages/shared/src/recipes/recipe.ts
 M packages/shared/src/run-files/atomic-write.ts
 M packages/shared/src/run-files/read.ts
 M packages/shared/src/schedules/schedule-file.ts
 M packages/toolbox/package.json
 M packages/toolbox/src/media/media-args.ts
 M packages/video/package.json
 M pnpm-lock.yaml
 M tools/cli/package.json
?? .engineos/changes/2026-11-19-zod4-migration.md
?? docs/specs/2026-11-19-zod4-migration.md
```
- `git diff --stat HEAD`: 34 files changed, 144 insertions(+), 144 deletions(-).
- Movements: none (no renames or moves); this record moves to `.engineos/archived/` on archive.
- Not committed; base 2d744ec. `apps/web/next-env.d.ts` (rewritten by `next build`) was restored to HEAD.

## Notes
- zod 4 traps typecheck does not catch: `.omit/.pick/.partial` on refined objects throw at module load;
  enum-keyed `z.record` is exhaustive (use `z.partialRecord`); regex-string keys stay `z.record`.
