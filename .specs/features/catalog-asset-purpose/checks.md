# Checks: catalog asset purpose

Proposed final evidence only. Nothing here runs before the owner's final approval
(rules/verification.md). Commands are existing workspace scripts; exact names get confirmed at the
final checkpoint.

| Claim | Proposed evidence |
|---|---|
| AP-01 enqueue on save, never fails the save | Unit test on `AssetPurposeEnqueuer` (requested / failed paths), plus a handler test that `create` still returns when the requester throws |
| AP-02 / AP-03 copy job to row, owner never overwritten | Unit tests on `asset-purpose.sync.ts`: done+none → ai; done+owner → untouched; two concurrent copies → one write |
| AP-04 output validation | Unit tests: 281 chars, empty, `<b>`, redaction hit → `failed` / `provider-error` |
| AP-05 biometric input | Unit test asserting `biometricPurposeInput` keys are exactly `name, kind, tags`, plus a handler test that a biometric row never reaches `purposeInput` |
| AP-06 content per kind | Table-driven handler test over each `AssetKind` with mock content readers |
| AP-07 ceiling, egress, mock | Handler tests in live (ceiling hit → `refused` / `month-ceiling`) and mock mode (no spend line) |
| AP-08 from-previous copy | `save-asset-version.handler` test: copied fields, requester not called |
| AP-09 / AP-10 detail UI states | Browser walk (qa-tester done-gate mode) of pending, failed+Retry, edit, regenerate, with screenshots |
| AP-11 hover title / alt | Browser check: `title` and `img[alt]` on grid cards and library tiles, with purpose and with fallback |
| AP-12 / AP-13 backfill | Query unit test (latest+active, dedupe, skips owner and open jobs). Browser walk: button hidden at 0, dialog count, cancel enqueues nothing |
| AP-14 agent tools | Existing `tool-fixtures.harness.test.ts` extended with `purpose` and a biometric exclusion case |
| Migration safe | `prisma migrate` on a disposable copy of the dev DB only, inside an approved test command |
| Whole change | `pnpm` lint, typecheck and build of `@studio/shared`, `@studio/core`, `api`, `watcher`, `web` |
| Security | `security-reviewer` on the diff (biometric builder, prompt input, new routes' authz), with separate consent |
