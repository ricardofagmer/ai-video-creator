# 10-cli-toolbox: CLI and toolbox tests

## Description
The `studio` CLI commands and the toolbox helpers are pinned by tests, and the toolbox gains a
`test` script so its tests run with the rest of the monorepo.

## Requirements
CR12, CR13

## Technical details
- Code under test: `tools/cli/src/` commands (parsing, output, exit codes) and
  `packages/toolbox/src/` (including `hashing.ts` and its own `sha256:`-prefixed `canonicalJson`).
- Toolbox `package.json`: add `"test": "node --import tsx --test \"src/**/*.test.ts\""`, the same
  runner as core; tsx is already a toolbox devDependency (`^4.20.0`). No other field changes and no
  install.
- No dependency on ticket 01: CLI tests run commands in-process against a temp home with the rules
  of section 8.1 of `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1`; no child process.
- Files: `tools/cli/src/__tests__/commands.test.ts`, `tools/cli/src/__tests__/isolation.test.ts`,
  `packages/toolbox/src/__tests__/hashing.test.ts`, `packages/toolbox/src/__tests__/isolation.test.ts`,
  plus one file per further toolbox module.
- Owner agent: test-writer.

## dependsOn
none

## Acceptance criteria
1. Each CLI command parses its documented flags, refuses an unknown flag and returns its documented
   exit code; `--help` lists every command.
2. Toolbox hashing is deterministic for reordered keys and differs on any value change.
3. `packages/toolbox/package.json` gains exactly the `test` script; nothing else changes.
4. Both isolation tests follow section 8.3.

## Testing requirements
Author the files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under the three exclusive paths.
2. No child process, network, Keychain or home directory access.
3. Product defects are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `tools/cli/src/__tests__`, `packages/toolbox/src/__tests__`,
  `packages/toolbox/package.json`
- dependsOn: none
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (sections 8.1 rules and 8.3)
