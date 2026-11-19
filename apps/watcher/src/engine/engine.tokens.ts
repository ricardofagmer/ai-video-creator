/**
 * Injection tokens of the engine. The ports are framework-free interfaces (C6, C7), so Nest needs
 * a token per port. The composition root (`src/watcher-ports.module.ts`) binds each token per
 * selection, never inside the engine. The mock selection binds mocks; the catalog selection binds:
 * - `STAGE_EXECUTORS`: the R1-14 stage executors (`src/stages/**`).
 * - `ASSET_RESOLVER`: the R1-06 catalog adapter (`src/adapters/**`).
 * - `COST_LEDGER`, `PROVIDER_MODE`: core `CostLedgerService` and `ProviderModeService` (R1-11).
 * - `AGENTS`: core `AgentsService` (R1-12) when `agents: 'core'`; Recovery calls go through it.
 * - `STEP_FAILURE_POLICY`, `RUN_CONTROL`: engine seams with PRD 7.3 defaults in `EngineModule`
 *   (Recovery policy, control.json channel); `PREFLIGHT_CHECKS`: extra preflight checks, empty by
 *   default, which the composition root may fill (R1-06).
 * - `LEARNING_NOTES`: C6 `LearningNotesPort`, bound to core `LearningNotesReader` through
 *   `LearningsReadModule` (SPEC 0003 R2-07; read-only, ADR 0003), or to the empty mock.
 */
export const STAGE_EXECUTORS = Symbol('STAGE_EXECUTORS');
export const ASSET_RESOLVER = Symbol('ASSET_RESOLVER');
export const COST_LEDGER = Symbol('COST_LEDGER');
export const PROVIDER_MODE = Symbol('PROVIDER_MODE');
export const AGENTS = Symbol('AGENTS');
export const CLOCK = Symbol('CLOCK');
export const WATCHER_PROCESS = Symbol('WATCHER_PROCESS');
export const STEP_FAILURE_POLICY = Symbol('STEP_FAILURE_POLICY');
export const PREFLIGHT_CHECKS = Symbol('PREFLIGHT_CHECKS');
export const RUN_CONTROL = Symbol('RUN_CONTROL');
export const LEARNING_NOTES = Symbol('LEARNING_NOTES');

/** Tokens the composition root must bind before the engine module can boot. */
export const enginePortTokens: readonly symbol[] = [
  STAGE_EXECUTORS,
  ASSET_RESOLVER,
  COST_LEDGER,
  PROVIDER_MODE,
  AGENTS,
  CLOCK,
  WATCHER_PROCESS,
  LEARNING_NOTES,
];
