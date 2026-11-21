# 07-final-proof: Final proof (final gate only, owner approval required) (R4H-FP)

**What to build:** Evidence for AC 64 to 83 without starting one real process: tests on the fake process port, inspection, and the install record. Written and run only after the owner approves the final checkpoint.

**Blocked by:** 01 to 06 integrated; the owner's answer at the final checkpoint. The owner-run steps O2 to O4 do not block it, and it does not replace them

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 64
- AC 65
- AC 66
- AC 67
- AC 68
- AC 69
- AC 70
- AC 71
- AC 72
- AC 73
- AC 74
- AC 75
- AC 76
- AC 77
- AC 78
- AC 79
- AC 80
- AC 81
- AC 82
- AC 83 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md section 12. Unit tests: `flatInputSchemaIssues`, `templateFolderIssues`, `hyperframesTemplateIssues`, `engineState`, `buildRenderEnv`, `buildRenderArgv`, `pinnedBinPath` on a temporary `node_modules` fixture, variable resolution. Integration tests on a temporary data home with the fake process port, fake probe results and the mock providers: each refusal of section 5.2, the Remotion golden request, mock mode with either engine, the picture check and cut, version creation rules, `enable` refusals, `chrome install` and `trace` without a terminal. Inspection greps and diffs of section 12. The lockfile and manifest read, and the R4H-02 install record. The approved lint, typecheck, build and test commands, each once.

## Acceptance criteria
- [ ] Written and run only after approval; no `.only`; no weakened or skipped test.
- [ ] No test starts Chrome, `hyperframes`, `sandbox-exec`, `/usr/bin/log` or `/usr/bin/security`, and none reads the real data home, the real Keychain, `~/.hyperframes` or `~/.cache/hyperframes` (AC 82).
- [ ] Sentinel strings (a parent API key, a variable value, a staged path) are searched for in the child environment, the logs and every runner reply (AC 67, 81).
- [ ] Every AC from 64 to 83 has named evidence with output shown; AC 84 and 85 are reported as passed or pending from the owner's records, never assumed.

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They use pure functions, the in-memory fake process port exported by `@studio/hyperframes`, and `fs.mkdtemp` folders under the OS temp directory. No network, no real process, no real data home.

## Definition of Done
- [ ] Every approved command ran once at the final revision, with its output shown; a red result is reported as red.
- [ ] No production file changed.
- [ ] `security-reviewer` findings are listed with their state; the state of O2, O3 and O4 is stated beside them.

## EngineOS brief metadata
- Exclusive paths: test files and fixtures only (`**/*.test.ts`, fixtures); no production file
- dependsOn: 01-frozen-contracts, 02-dependency-install, 03-hyperframes-runtime, 04-watcher-engine-dispatch, 05-catalog-seed-template, 06-cli-owner-steps
- Owner: test-writer
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0008-hyperframes-templates.md`
