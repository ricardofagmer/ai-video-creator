# 02-web-compile: Compile the web after R3-06

**What to build:** R3-06 was integrated by inspection only. This ticket makes `@studio/web` typecheck and lint clean against the compiled shared contract.

**Blocked by:** 01-core-shared-compile

**Status:** ready-for-agent

## Requirements
- R3-AC-03
- R3-AC-07
- R3-AC-23 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
Package `@studio/web` (Next 15). Designs docs/specs/0006-r3-outside-signals-and-packaging.md sections 5.7 and 5.9. Keep pt-BR texts, both sample sizes on every score, both worst-case cost figures in the schedule create dialog, and no control that approves a run, promotes a version or publishes. Do not edit `package.json`, `tsconfig.json`, `next.config.ts` or `eslint.config.mjs`.

## Acceptance criteria
- [ ] `pnpm --filter @studio/web typecheck` exits 0.
- [ ] `pnpm --filter @studio/web lint` exits 0 without new disable comments.
- [ ] `grep -rn dangerouslySetInnerHTML apps/web/src` finds nothing.

## Testing requirements
The web package has no test runner; this ticket is covered by typecheck and lint, and the browser walk stays with the final proof.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `apps/web`
- dependsOn: 01-core-shared-compile
- Owner: frontend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
