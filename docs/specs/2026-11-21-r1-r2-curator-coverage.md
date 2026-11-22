# SPEC: R1, R2 and curator test and eval coverage

Date: 2026-11-21
Rev: 1
Status: draft (super-dev prepare; approval is recorded at review)
PRD: `docs/prds/2026-11-21-r1-r2-curator-coverage.md` (requirements CR1 to CR15)
Tickets: `docs/specs/r1-r2-curator-coverage/tickets/` (graph in `graph.md`)
Sources: `docs/specs/0001-agent-topology.md` section 11, `docs/specs/0004-curator-agent-topology.md`
section 11, `docs/specs/0005-curator.md` section 9, `docs/specs/0002-r1-studio-foundation.md`,
`docs/specs/0003-r2-improvement-loop.md`, `.engineos/changes/2026-11-18-r1-implementation.md`
lines 70 to 73 and 128.

## 1. Architecture and design decisions

The run adds tests only. Product code is read, never changed. Each ticket owns one set of
`__tests__` folders next to the code it covers, so tickets never share a file.

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | Test files live in `src/<area>/__tests__/` folders. | `src/<area>/coverage/`: the repository `.gitignore` line 7 ignores `coverage/`, so those files would never be committed. Colocated `foo.test.ts` beside each source file: several tickets would write into the same folders, which breaks disjoint exclusive paths. |
| D2 | Use the existing runner, `node --import tsx --test "src/**/*.test.ts"` (core, watcher, api, cli, shared). The glob already reaches `__tests__` folders and `*.eval.test.ts` files. | Vitest or Jest: a new dependency (`rules/base.md` Dependencies) and a second runner. |
| D3 | Eval cases are ordinary tests named `*.eval.test.ts`, with every provider faked through the existing mock responders. | A separate eval runner or the `eval-harness` scaffold: it adds a tool, and the topology specs already say evals use "the project's JavaScript test runner". |
| D4 | One frozen harness (section 8) built first by ticket 01; every other ticket consumes it read-only. | Each ticket builds its own temp home: duplicated safety code, and one weak copy could reach the real data home. |
| D5 | A test that fails because product code is wrong stays as written and is reported as a finding with file and line; the ticket ends `blocked` (`behavior-change-required`) and the owner decides at the report. The test is never weakened, skipped or deleted to pass. | Fixing product code in the run: outside the tickets' exclusive paths (`no-scope-expansion`). |

No decision here supersedes an ADR, so no new ADR is written; D2 follows the runner every package
already declares.

## 2. Stack and conventions

- TypeScript, `node:test` and `node:assert/strict`, run through tsx. NestJS testing uses
  `Test.createTestingModule` or `NestFactory.createApplicationContext` with mock ports, the way
  `apps/watcher/src/dev/run-fixture.ts` lines 54 to 60 does.
- One import statement per module, no `any`, no `as` to silence errors, English only, no emojis
  (`rules/base.md`).
- Test names state the behaviour ("refuses a biometric ref", not "test 3").
- Every test cleans up in `afterEach` through the harness `close()`.

## 3. Database schemas and migrations

Not applicable for changes: no schema change and no migration is authored. Tests that need a
database get a throwaway SQLite file inside their own temp folder, migrated by the existing
`applyMigrations` helper (as `createPlatformHarness` does at
`packages/core/src/platforms/platform-harness.harness.test.ts` lines 108 to 134). The harness
asserts the database path lies inside the temp root before connecting.

## 4. API contracts and integrations

No contract changes. Tests consume the existing `@studio/shared` schemas, the api route table and
the run-format files (`docs/RUN-FORMAT.md`). Every external integration (Claude, ElevenLabs, render,
platforms, embeddings) is faked through the existing mock ports; no test opens a network socket
other than a Nest test server bound to `127.0.0.1` on an ephemeral port.

## 5. Frontend and backend details

- Backend: core, watcher, api and cli tests (tickets 01 to 10).
- Frontend: not applicable. The web has no `test` script and no tsx; its one existing test file is
  reported as OQ4, not changed.

## 6. AuthN and AuthZ

No change. Ticket 09 tests the existing api session and authorization: unauthenticated requests
are refused, object-level access is enforced, and the BFF allowlist is respected. Tests use the
sentinel credential of section 8, never the Keychain.

## 7. Error handling and edge cases

- Each typed error a covered module throws gets at least one test that triggers it.
- Fault scenarios use the watcher's existing fault switches (`--fault=<scenario>[@<stageId>]`).
- Edge cases named by the source specs are listed per ticket (biometric refs, injection text,
  frame budgets, body size limits, missing versions, crash-resume, stop wins over pause).
- A test that cannot run because a precondition is missing (binary, passphrase) is skipped with
  `test.skip` and a reason string naming the precondition, and the ledger records it as
  unavailable, never as passed.

## 8. Frozen harness contract (rev 1)

Owner: ticket 01. Consumers: tickets 02 to 08 (read-only). Any change bumps the rev and pauses
consumers (`rules/parallelism.md` Task ledger and contract drift).

### 8.1 Core: `packages/core/src/test-support/`

```ts
export interface CoverageHome {
  root: string;            // realpath'd mkdtemp folder under os.tmpdir()
  dataHome: DataHome;      // points inside root only
  prisma: PrismaService;   // migrated throwaway database inside root
  clock: MutableClock;
  logs: CapturedLogs;
  sentinelKey: string;     // fixed fake credential, asserted absent from logs and outputs
  close(): Promise<void>;  // disconnect, restore log mocks, rm -rf root
}
export function createCoverageHome(options: { prefix: string; start: Date }): Promise<CoverageHome>;
export const fixtures: {
  asset(overrides?: Partial<AssetFixture>): AssetFixture;
  recipe(overrides?: Partial<RecipeFixture>): RecipeFixture;
  run(overrides?: Partial<RunFixture>): RunFixture;
  reviewedRun(rating: 1 | 2 | 3 | 4 | 5, overrides?: Partial<RunFixture>): RunFixture;
  learningNote(text: string): LearningNoteFixture;
};
```

`createCoverageHome` wraps `createPlatformHarness` (lines 108 to 134 of the file cited in section 3)
rather than copying it. Fixture builders write through the real repositories, never raw SQL.

### 8.2 Watcher: `apps/watcher/src/test-support/`

```ts
export interface MockEngineHandle {
  app: INestApplicationContext;  // WatcherModule.register({ ports: { kind: 'mock', fault } })
  runDir: string;                // working copy of the fixture run inside a temp runs root
  execute(): Promise<RunEngineResult>;
  writeControl(request: ControlRequest): Promise<void>;
  shutdown(): Promise<void>;     // app.close() then rm -rf the runs root
}
export function startMockEngine(options?: {
  fault?: string;
  withPlanApproval?: boolean;
  run?: Partial<RunFixture>;
  shutdown?: 'graceful' | 'sigterm-simulated';
}): Promise<MockEngineHandle>;
export function createWatcherHome(options: { prefix: string }): Promise<{ root: string; close(): Promise<void> }>;
export function stubProcessIdentity(pid: number): () => void; // returns restore
```

`startMockEngine` follows `apps/watcher/src/dev/run-fixture.ts` lines 40 to 60 (working copy,
optional plan approval, mock ports). `ControlRequest` is the existing
`packages/shared/src/run-format/control.ts` schema.

### 8.3 Isolation test (one per package with tests: core, watcher, api, cli, toolbox)

Each package gets `src/test-support/isolation.test.ts` (core and watcher, ticket 01) or
`src/__tests__/isolation.test.ts` (api ticket 09, cli and toolbox ticket 10). It reads every
`*.test.ts` file of its package and fails when one contains: `homedir(`, `process.env` (outside the
harness), the Keychain helper path, `child_process`, `fetch(`, `ricardo-clone` or `.only(`. The
harness files themselves are allowlisted by path.

## 9. Testing and validation strategy

- Implementation tickets 01 to 10 author tests; they run no checks during implementation
  (`rules/verification.md`). Per-ticket checks are proposed at review (question 3).
- Proposed per-ticket checks (existing scripts only): the package `test` script of each ticket's
  package, filtered to its folder where the runner allows it, plus the package `typecheck`.
- Final proof (ticket 11), outside the sandbox, build first:
  1. `pnpm build`
  2. `pnpm typecheck`
  3. `pnpm lint`
  4. `pnpm test`
  5. `node tools/cli/dist/main.js --help`
  6. `VIDEO_STUDIO_HOME=<temp> bash scripts/install.sh --dry-run`
  7. `shellcheck scripts/install.sh scripts/uninstall.sh scripts/lib/common.sh` (unavailable when
     shellcheck is not installed; never installed by the run)
  8. `pnpm --filter @studio/watcher dev:fixture`
- The coverage ledger (`docs/specs/r1-r2-curator-coverage/coverage-ledger.md`) lists each
  requirement, test file, case count and result, and every owner-run item with its reason.

## 10. Deployment considerations

Not applicable: tests only; nothing is deployed, installed or published. `install.sh` runs only
with `--dry-run` and a temp `VIDEO_STUDIO_HOME`.

## 11. Tickets

| Ticket | Title | dependsOn | Owner | Exclusive paths |
|---|---|---|---|---|
| 01-coverage-harness | Coverage harness and isolation tests | none | test-writer | `packages/core/src/test-support`, `apps/watcher/src/test-support` |
| 02-watcher-engine | Watcher engine tests and loop evals | 01 | test-writer | `apps/watcher/src/engine/__tests__` |
| 03-watcher-stages-daemon | Stages, adapters, daemon and v1 end-to-end eval | 01 | test-writer | `apps/watcher/src/stages/__tests__`, `apps/watcher/src/adapters/__tests__`, `apps/watcher/src/daemon/__tests__` |
| 04-watcher-curation | Watcher curation and curator end-to-end eval | 01 | test-writer | `apps/watcher/src/curation/__tests__` |
| 05-core-agent-evals | Topology v1 tool and agent evals, Mastra assumptions | 01 | test-writer | `packages/core/src/agents/__tests__` |
| 06-core-curator | Curator evals (ground check, Curator, Scriptwriter, Scene director) | 01 | test-writer | `packages/core/src/curation/__tests__`, `packages/core/src/agents/curator/__tests__` |
| 07-core-r1-data | Core R1 data tests | 01 | test-writer | `packages/core/src/{catalog,recipes,runs,review,outcomes,costs,seed,providers}/__tests__` (8 literal folders, listed in the ticket) |
| 08-core-r2-loop | Core R2 loop tests | 01 | test-writer | `packages/core/src/{quality,embeddings,promotion,learnings,comparisons}/__tests__` (5 literal folders, listed in the ticket) |
| 09-api-routes | api route tests | none | test-writer | `apps/api/src/__tests__` |
| 10-cli-toolbox | CLI and toolbox tests | none | test-writer | `tools/cli/src/__tests__`, `packages/toolbox/src/__tests__`, `packages/toolbox/package.json` |
| 11-final-proof | Final proof and coverage ledger | 01 to 10 | test-writer | `docs/specs/r1-r2-curator-coverage/coverage-ledger.md` |

## 12. Traceability

| Requirement | Tickets | Gap |
|---|---|---|
| CR1 | 01-coverage-harness | none |
| CR2 | 02-watcher-engine | none |
| CR3 | 03-watcher-stages-daemon | none |
| CR4 | 04-watcher-curation | none |
| CR5 | 05-core-agent-evals | none |
| CR6 | 05-core-agent-evals | none |
| CR7 | 05-core-agent-evals | none |
| CR8 | 04-watcher-curation (end-to-end case), 06-core-curator (23 cases) | none |
| CR9 | 07-core-r1-data | none |
| CR10 | 08-core-r2-loop | none |
| CR11 | 09-api-routes | none |
| CR12 | 10-cli-toolbox | none |
| CR13 | 01 to 10 (each DoD), 11-final-proof | cross-cutting; verified by the isolation tests and the ledger |
| CR14 | 11-final-proof | none |
| CR15 | 11-final-proof | none |

## 13. Open questions

OQ1 to OQ8 are listed in the PRD with their defaults. They are asked at review only where the
default needs the owner (OQ1, OQ2, OQ5, OQ6 stay owner-run; OQ3 is attempted; OQ4, OQ7, OQ8 are
reported).

## 14. Risks

- Tests may expose real defects. Handled by D5: findings are reported, product code is not
  changed in the run.
- The Mastra version may not match assumption text written before install. Ticket 05 records each
  assumption as confirmed or refuted with the installed version.
- Prisma client generation must exist before core tests run; the final proof builds first.
