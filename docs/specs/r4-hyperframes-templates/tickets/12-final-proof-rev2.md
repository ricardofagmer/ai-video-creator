# 12-final-proof-rev2: Final proof, rev 2 (final gate only, owner approval required) (R4H-FP2)

**What to build:** Evidence for AC 86 to 97 after tickets 08 to 11 integrate: the owner-approved final checks, a security re-review of the four fixes, and the update of the existing test expectations that the rev 2 contracts break. **No new tests: the owner decided "No tests, next task" (SPEC 0008 OD8, K17).**

**Blocked by:** 08 to 11 integrated; the owner's answer at the final checkpoint. The owner-run steps O3 and O4 come after it; it does not replace them

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 86
- AC 87
- AC 88
- AC 89
- AC 90
- AC 91
- AC 92
- AC 93
- AC 94
- AC 95
- AC 96
- AC 97 (SPEC 0008 section 17.13). AC 98 is the owner's (step O3) and is reported as passed or pending, never assumed.

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 17.13 and 17.14.

1. **Expectation updates only.** Existing tests that restate a contract rev 2 changed are brought to the new contract and nothing else: the frozen argv and the runtime fixture in `apps/watcher/src/hyperframes-runtime/*.test.ts` (seventeen `-D` pairs, 47 arguments, the nine new runtime fields), the `hyperframes-render` request fixtures of the watcher (the nine new `runtime` fields), and the CLI trace fixtures (runtime fields, control arguments). An existing test of the staged copy or of `templateFolderIssues` is touched only if its current expectation contradicts section 17.7 or 17.8. Not allowed: a new test file, a new `it`/`describe`, a new fixture file, a deleted or skipped test, a weakened assertion. Each changed expectation is listed with the file, the old value, the new value and the rev 2 section that changed it.
2. **Evidence without new tests.** For each of AC 86 to 96: the diff lines and greps that show it (for example the profile text against section 17.4, the absence of `copyFile`, the single `O_NOFOLLOW` open, the `-D` order), plus any existing test that now covers it. An AC with inspection evidence only is reported as such; it is not reported as tested.
3. **Approved checks.** The lint, typecheck, build and test commands the owner approves at the final checkpoint, each once at the final revision.
4. **Security re-review.** The supervisor dispatches the read-only `security-reviewer` on the integrated diff with M1, L1, L2 and L3 as the remit, after the owner's consent at the final checkpoint.

## Acceptance criteria
- [ ] Run only after approval; no `.only`; no skipped, deleted or weakened test; no new test, case or fixture (AC 97).
- [ ] The list of changed expectations is complete: every changed test file appears in it with the contract that changed it (AC 97).
- [ ] No test starts Chrome, `hyperframes`, `sandbox-exec`, `/usr/bin/log` or `/usr/bin/security`, and none reads the real data home, `~/.ssh`, a Keychain or an `.env` file (rev 1 AC 82 still holds).
- [ ] Every AC from 86 to 96 has named evidence, labelled "existing test" or "inspection", with output shown.
- [ ] AC 98 and rev 1 AC 84 and 85 are reported as passed or pending from the owner's records.

## Testing requirements
Existing tests only, run by the packages' existing `test` scripts (`node --import tsx --test`). They keep using pure functions, the in-memory fake process port and `fs.mkdtemp` folders. New tests for AC 86 to 96 are the next task, by the owner's decision, and are named as a gap in the report.

## Definition of Done
- [ ] Every approved command ran once at the final revision, with its output shown; a red result is reported as red.
- [ ] No production file changed; no file outside existing `**/*.test.ts` and existing fixtures changed.
- [ ] `security-reviewer` findings are listed with their state against M1 and L1 to L3; the state of O3 and O4 and of the open decision OD10 is stated beside them.
- [ ] The report says in plain words that this wave added no tests and which ACs rest on inspection.

## EngineOS brief metadata
- Exclusive paths: existing `**/*.test.ts` and existing fixtures only, expectations only; no production file, no new file
- dependsOn: 08-runtime-sandbox-hardening, 09-watcher-sandbox-params-chrome-verify, 10-cli-trace-rev2, 11-template-folder-lint
- Owner: test-writer (expectation updates and approved checks); the supervisor dispatches `security-reviewer`
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` section 17 (rev 2, frozen)
