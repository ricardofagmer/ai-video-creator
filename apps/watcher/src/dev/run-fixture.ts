import 'reflect-metadata';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readApprovalFile, readRunFile, runDirectory, writeApprovalFile, writeRunFile } from '@studio/shared/run-files';
import { RunEngine } from '../engine/run-engine';
import { noMockFault, parseMockFault, type MockFaultPlan } from '../mocks/mock-fault';
import { WatcherModule } from '../watcher.module';

/** The committed fixture; it is only read, the run happens on a working copy. */
const FIXTURE_DIR = resolve(__dirname, '../../fixtures/product-tour-16x9');

interface DevOptions {
  fault: MockFaultPlan;
  withPlanApproval: boolean;
}

function readOptions(): DevOptions {
  const { values } = parseArgs({
    options: {
      fault: { type: 'string' },
      'without-plan-approval': { type: 'boolean', default: false },
    },
    strict: true,
  });
  return {
    fault: values.fault === undefined ? noMockFault : parseMockFault(values.fault),
    withPlanApproval: values['without-plan-approval'] !== true,
  };
}

/**
 * Copies the fixture run into a fresh temp runs root through the C5 readers and writers, so the
 * copy is validated on the way and the committed fixture is never touched. Without plan
 * approval the copy has no approval.json and the run stops in `waiting` at the plan gate.
 */
async function prepareWorkingCopy(options: DevOptions): Promise<string> {
  const runsRoot = await mkdtemp(join(tmpdir(), 'studio-watcher-fixture-'));
  const run = await readRunFile(FIXTURE_DIR);
  const runDir = runDirectory(runsRoot, run.runId);
  await writeRunFile(runDir, run);
  const approval = await readApprovalFile(FIXTURE_DIR);
  if (options.withPlanApproval && approval.status === 'present') await writeApprovalFile(runDir, approval.value);
  return runDir;
}

/**
 * `pnpm --filter @studio/watcher dev:fixture [--fault=<scenario>[@<stageId>]] [--without-plan-approval]`:
 * runs the fixture once, offline, with every port mocked, in a standalone Nest application
 * context (no HTTP listener), then exits. Exit code 0 only when the run reached `review`.
 */
async function main(): Promise<void> {
  const logger = new Logger('run-fixture');
  const options = readOptions();
  const runDir = await prepareWorkingCopy(options);
  logger.log(`working copy: ${runDir}`);
  const app = await NestFactory.createApplicationContext(WatcherModule.register({ ports: { kind: 'mock', fault: options.fault } }));
  try {
    const result = await app.get(RunEngine).execute(runDir);
    logger.log(`run ${result.runId} ended as ${result.status}`);
    process.exitCode = result.status === 'review' ? 0 : 2;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('run-fixture').error('fixture run failed', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
