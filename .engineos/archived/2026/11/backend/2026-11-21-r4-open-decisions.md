---
name: 2026-11-21-r4-open-decisions
status: done
owner: Ricardo Fagmer
spec: docs/specs/0007-r4-connected-platforms.md (sections 5.2, 5.5); docs/specs/0005-curator.md (cost.json)
domain: backend
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
Close the four R4 owner decisions left open in `.engineos/changes/2026-11-20-r4-implementation.md`
and the curator `estimated` cost flag left open in `.engineos/changes/2026-11-19-curator-implementation.md`.

## Why
The R4 run and the curator run each ended with items only the owner could decide. The owner
answered all four on 2026-11-21; the `estimated` flag was approved with "Finish R4 open items".

## Scope
In: the shared reason and revoke enums, the disconnect answer through core, api, web and CLI,
the watcher re-check reason, the web queued text, ADR 0007, SPEC 0007 section 5.5 text, the curator
cost schema and recorder, RUN-FORMAT and SPEC 0005 field lists, and the tests the new
behaviour changes (owner decision 2026-11-21: "Fix tests, then commit"). Out: the live platform clients (tickets 07 to 09), any migration (`publication_attempts.reason_id`
is a plain string with no CHECK).

## Checklist
- [x] Keychain `-T /usr/bin/security` ACL recorded as an accepted risk in ADR 0007, with a revisit trigger
- [x] `request-mismatch` failure reason for a request/row mismatch; the withdrawn-upload path stays `internal-error`
- [x] Neutral queued text "Na fila: o watcher envia entre uma execução e outra." (no contract change)
- [x] Disconnect answer carries `revoke` (`revoked` | `skipped` | `failed`); web and CLI show the remove-access hint only when not `revoked`
- [x] Curator `cost.json` sessions carry optional `estimated: true` on worst-case entries
- [x] R4 and curator records: open items closed
- [x] Tests updated for the new behaviour (request-mismatch, revoke outcome)
- [x] Final typecheck, lint and tests: green in CI (run 44972966686 on `6ca2833`); not run locally

## What was made
- `packages/shared/src/platforms/enums.ts`: `request-mismatch` in `PublishFailureReasonSchema`;
  new `RevokeOutcomeSchema` / `RevokeOutcome`.
- `packages/shared/src/api/platforms.ts`: `DisconnectResultSchema` (strict `PlatformView` plus `revoke`).
- `packages/core/src/platforms/commands/{platform.commands,disconnect.handler}.ts`: `DisconnectCommand`
  answers `DisconnectResult`; the handler returns the revoke outcome it already logged.
- `apps/api/src/connections/{platform-response.assembler,platforms.controller}.ts`: the DELETE route
  answers `DisconnectResult`, checked against its strict schema.
- `apps/web/src/features/platforms/{platforms-api.ts,components/ConnectionActions.tsx}`: the client
  parses `DisconnectResultSchema`; the alert confirms the revoke or asks to remove access.
- `tools/cli/src/platforms/platform-gateway.ts`, `tools/cli/src/commands/platforms.command.ts`: the
  same rule for `studio platforms disconnect`.
- `apps/watcher/src/platforms/publish-recheck.ts`: a row mismatch refuses `request-mismatch`.
- `apps/web/src/features/publishing/publish-labels.ts`, `tools/cli/src/platforms/platform-labels.ts`:
  label for `request-mismatch`; `packages/core/src/insights/insights.repository.ts`: counted as a
  pre-upload failure.
- `apps/web/src/features/publishing/{publish-labels.ts,components/PublishAttemptStatus.tsx,components/PublishAttemptList.tsx}`:
  `QUEUED_BETWEEN_RUNS_TEXT` with the neutral text.
- `packages/shared/src/curation/cost.ts`, `packages/core/src/agents/curator/curator-cost.recorder.ts`:
  optional `estimated: true`; older files without it still parse.
- Docs: `docs/adr/0007-platform-connections.md` (accepted risk, revisit trigger),
  `docs/specs/0007-r4-connected-platforms.md` section 5.5 text, `docs/RUN-FORMAT.md` and
  `docs/specs/0005-curator.md` cost field lists.
- Not compiled, nothing run. Proportional checkpoint 2026-11-21: checks ask, security skip (files>3, domains>1, risk:medium). No live provider or platform call.

## Tests updated
- `apps/watcher/src/platforms/publish.step.request-match.test.ts`: a row mismatch now fails `request-mismatch`.
- `apps/api/src/connections/{rev7-bus.harness,platforms.controller}.test.ts`: the bus fake answers
  `DisconnectResult`; the controller test asserts `revoke`.
- `tools/cli/src/platforms/platform-cli.harness.test.ts`: the fake gateway answers `revoke` (default `skipped`);
  `tools/cli/src/commands/platforms.command.test.ts`: one case per branch (remove-access hint, confirmed revoke).
- `packages/core/src/platforms/commands/{connection-secrets,disconnect}.test.ts`: assert `revoked`,
  `skipped` (mock mode) and `failed` (refused revoke).
- No curator, web or label test referenced the changed code.

## Verification
Local final checks were skipped by the owner on 2026-11-21 ("Skip for now"), so CI is the only evidence.
- CI run 44972966686 on `6ca2833` (PR #11, https://github.com/ricardofagmer/ai-video-creator/pull/11):
  install, typecheck, lint, test and build all `success`.
- PR #11 squash-merged into `main` on 2026-11-22T01:47:14Z as `c6396d1`.
- Not verified: no browser walk of the web disconnect alert, no live platform call (tickets 07 to 09 still need credentials).

## Human decisions
2026-11-21 | Ricardo Fagmer | Keychain ACL | accepted as risk | "Accept as risk (Recommended)"
2026-11-21 | Ricardo Fagmer | Mismatch reason id | approved | "request-mismatch only (Recommended)"
2026-11-21 | Ricardo Fagmer | Queued text | approved | "True neutral text (Recommended)"
2026-11-21 | Ricardo Fagmer | Revoke result | approved | "Add revoke result (Recommended)"
2026-11-21 | Ricardo Fagmer | Curator estimated flag | approved | "Finish R4 open items (Recommended)"
2026-11-21 | Ricardo Fagmer | Final checks (typecheck, lint) | deferred to end of product work | "Keep checks for the end"
2026-11-21 | Ricardo Fagmer | Broken tests | fix before commit | "Fix tests, then commit (Recommended)"
2026-11-21 | Ricardo Fagmer | Final checks (typecheck, lint, 6 test files) | skipped for now; validation pending | "Skip for now"
2026-11-21 | Ricardo Fagmer | Commit, push, open PR #11 | approved | "Commit all, incl. coverage (Recommended)", "Push it (Recommended)", "Open the PR (Recommended)"
2026-11-21 | Ricardo Fagmer | Close and archive this record on a new docs branch + PR | approved | "Close and archive (Recommended)", "New branch + PR (Recommended)"
