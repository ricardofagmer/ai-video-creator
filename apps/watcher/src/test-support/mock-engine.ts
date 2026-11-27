import 'reflect-metadata';
import { resolve } from 'node:path';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readApprovalFile, readRunFile, runDirectory, writeApprovalFile, writeControlRequest, writeRunFile } from '@studio/shared/run-files';
import { type ControlRequest, type RunFile } from '@studio/shared/run-format';
import { RunEngine, type RunExecutionResult } from '../engine/run-engine';
import { noMockFault, parseMockFault } from '../mocks/mock-fault';
import { WatcherModule } from '../watcher.module';
import { createWatcherHome } from './watcher-home';

/*
 * Mock engine of SPEC 2026-11-21-r1-r2-curator-coverage section 8.2 (rev 1), following
 * `src/dev/run-fixture.ts`: the committed fixture run is copied through the C5 readers and writers
 * into a fresh temp runs root (validated on the way, the fixture itself never touched), the plan
 * approval is copied unless the test asks for a run held at the plan gate, and the engine runs in a
 * standalone Nest application context with every port mocked. No network, no child process, no
 * data home. Test-only: nothing in the product imports this folder.
 */

/** The committed fixture; only read. */
const FIXTURE_DIR = resolve(__dirname, '../../fixtures/product-tour-16x9');

/** What `RunEngine.execute` returns; the contract names it `RunEngineResult`. */
export type RunEngineResult = RunExecutionResult;

/** The fixture run's `run.json`; `startMockEngine({ run })` overrides its top-level fields. */
export type RunFixture = RunFile;

export interface MockEngineHandle {
  /** `WatcherModule.register({ ports: { kind: 'mock', fault } })`. */
  app: INestApplicationContext;
  /** Working copy of the fixture run inside a temp runs root. */
  runDir: string;
  execute(): Promise<RunEngineResult>;
  writeControl(request: ControlRequest): Promise<void>;
  /** `app.close()`, then removes the runs root. A second call is a no-op. */
  shutdown(): Promise<void>;
}

async function prepareWorkingCopy(runsRoot: string, options: { withPlanApproval: boolean; run: Partial<RunFixture> }): Promise<string> {
  const fixture = await readRunFile(FIXTURE_DIR);
  const run: RunFile = { ...fixture, ...options.run };
  const runDir = runDirectory(runsRoot, run.runId);
  await writeRunFile(runDir, run);
  const approval = await readApprovalFile(FIXTURE_DIR);
  if (options.withPlanApproval && approval.status === 'present') await writeApprovalFile(runDir, { ...approval.value, runId: run.runId });
  return runDir;
}

/**
 * Starts the engine on a working copy of the fixture run. `fault` is a `--fault` value
 * (`<scenario>[@<stageId>]`). `withPlanApproval: false` leaves the copy without approval.json, so
 * the run stops in `waiting` at the plan gate. `shutdown: 'sigterm-simulated'` binds a shutdown
 * signal, as the daemon does for SIGTERM, and `shutdown()` fires it before closing: an in-flight
 * step aborts and the run is left `running` for crash-resume. `'graceful'` (the default) binds no
 * signal, as the dev fixture does, and `shutdown()` lets an in-flight execution stop on its own.
 */
export async function startMockEngine(
  options: {
    fault?: string;
    withPlanApproval?: boolean;
    run?: Partial<RunFixture>;
    shutdown?: 'graceful' | 'sigterm-simulated';
  } = {},
): Promise<MockEngineHandle> {
  const fault = options.fault === undefined ? noMockFault : parseMockFault(options.fault);
  const home = await createWatcherHome({ prefix: 'studio-watcher-mock' });
  const shutdownSignal = options.shutdown === 'sigterm-simulated' ? new AbortController() : null;
  const boot = async (): Promise<{ app: INestApplicationContext; runDir: string }> => {
    const workingCopy = await prepareWorkingCopy(home.root, { withPlanApproval: options.withPlanApproval ?? true, run: options.run ?? {} });
    const context = await NestFactory.createApplicationContext(
      WatcherModule.register({ ports: { kind: 'mock', fault }, shutdown: shutdownSignal?.signal }),
    );
    return { app: context, runDir: workingCopy };
  };
  const { app, runDir } = await boot().catch(async (error: unknown): Promise<never> => {
    await home.close();
    throw error;
  });

  let inFlight: Promise<RunEngineResult> | null = null;
  let closed = false;
  return {
    app,
    runDir,
    execute: (): Promise<RunEngineResult> => {
      const execution = app.get(RunEngine).execute(runDir);
      inFlight = execution;
      return execution;
    },
    writeControl: (request: ControlRequest): Promise<void> => writeControlRequest(runDir, request),
    shutdown: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      shutdownSignal?.abort();
      // The caller sees the execution's result or error through `execute()`; this only waits until
      // no step writes into the folder about to be removed.
      if (inFlight !== null) await Promise.allSettled([inFlight]);
      try {
        await app.close();
      } finally {
        await home.close();
      }
    },
  };
}
