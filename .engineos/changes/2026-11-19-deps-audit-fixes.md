---
name: 2026-11-19-deps-audit-fixes
status: active
owner: Ricardo Fagmer
spec: n/a — two manifest edits plus the lockfile, owner-approved dependency change
domain: devops
security_review: pending
risk: medium
new_feature: false
release: false
---

## What
Upgrade the remotion family 4.0.300 to 4.0.541 in packages/video and add three pnpm overrides
(`@ai-sdk/provider-utils@3>undici` 6.29.1, `next>postcss` 8.5.33, `@prisma/config>deepmerge-ts` 8.0.2)
to clear the critical and high `pnpm audit --prod` advisories found at the end of super-dev run
2026-11-19-r3-outside-signals-2 (report section 9).

## Why
33 advisories (2 critical, 14 high) in dependencies that were in pnpm-lock.yaml before R3. The R3 run could not
change manifests, so the upgrade is this separate owner-directed change.

## Scope
package.json, packages/video/package.json, pnpm-lock.yaml. Branch chore/deps-audit-fixes (worktree
../video-studio-deps), based on feat/r3-outside-signals at 090a4b7.

## Targets and vetting
| Advisory | Fix | Evidence |
|---|---|---|
| remotion <4.0.410 (GHSA-g6pc-6676-c23j, GHSA-2jqp-f4gr-44fr, critical) | remotion 4.0.541 | published 2026-11-05 (4.0.545 is one day old); renderer drops extract-zip, pins ws 8.21.0; studio pins zod 4.6.7; no install scripts |
| ws 8.17.1 (GHSA-96hv-2xvq-fx4p) | via remotion | ws 8.21.0 is the first patched 8.x |
| extract-zip 2.0.1 (GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv) | via remotion | no patched extract-zip exists; remotion 4.0.541 no longer depends on it |
| undici 5.29.0 (5 advisories) and @fastify/busboy 2.1.1 (GHSA-x8mw-p69m-v3mx) | override undici 6.29.1 | @ai-sdk/anthropic 2.0.115 is the newest v2 and keeps undici ^5; provider-utils 3.0.46 only uses `undici.Agent` + `fetch` with `connect.lookup`; undici 6 has no busboy dependency |
| postcss 8.4.31 (GHSA-r28c-9q8g-f849, GHSA-6g55-p6wh-862q) | override postcss 8.5.33 | next 15.5.29 is the newest 15.x and pins 8.4.31; 8.5.33 was already in the lockfile |
| deepmerge-ts 7.1.5 (GHSA-ggr8-5vv4-36mx) | override deepmerge-ts 8.0.2 | prisma 6.19.3 is the newest 6.x; @prisma/config 7.10.1 ships 8.0.2; v8 breaking changes (Map merging, type renames) do not touch config merging |
| zod <4.6.6 (GHSA-mrhx-c7xc-m3w5) | not fixed here | needs a zod 3 to 4 migration across 180 source files incl. frozen @studio/shared contracts; owner chose a separate migration |

## Residual risk accepted for now
GHSA-mrhx-c7xc-m3w5 (zod 3.25.76): unbounded issue accumulation on large failing arrays. Bounded by the api JSON body
limit (`JSON_BODY_LIMIT` 1mb, apps/api/src/platform/api-config.ts) and the loopback-only listener. Follow-up: zod 4 migration.

## Checklist
- [x] Vet target versions against upstream repos and the GitHub advisory database
- [x] Owner approved manifest edits, worktree branch and install
- [x] Lockfile resolved with --lockfile-only --ignore-scripts; diff reviewed (72 removed, 146 added, all from remotion 4.0.541 manifests and the overrides)
- [x] `pnpm install --frozen-lockfile` in the worktree
- [x] `pnpm audit --prod` after the merge into feat/r3-outside-signals (`e256e3e`): 1 high left (zod, accepted residual), down from 33
- [x] `turbo run typecheck lint test build --filter='@studio/*'` on `e256e3e`: all pass (386 of 386 tests)
- [ ] `turbo run typecheck build --filter='@ace/*'` — skipped by the owner, pending
- [x] Committed on chore/deps-audit-fixes as `2d744ec`; merged into feat/r3-outside-signals as `e256e3e`

## Human decisions
- 2026-11-19 Ricardo Fagmer: approved manifest edits as shown; zod handled as explained residual plus later migration; worktree branch from feat/r3-outside-signals; install after lockfile diff review.
- 2026-11-19 Ricardo Fagmer: final checks — Skip for now. [validation] pending — final-stage user approval required.
- 2026-11-19 Ricardo Fagmer: merge into feat/r3-outside-signals (--no-ff), frozen install, `@studio/*` checks and `pnpm audit --prod` — approved; run from the R3 session.
- 2026-11-19: zod residual (GHSA-mrhx-c7xc-m3w5) resolved by the zod 4 migration (`b5ff010`), merged into feat/r3-outside-signals as `6f286b0`; `pnpm audit --prod` clean.
