import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import { type DataHome } from '../paths/data-home';
import { type PrismaService } from '../prisma/prisma.service';
import { createPlatformHarness, type CapturedLogs, type MutableClock } from '../platforms/platform-harness.harness.test';

/*
 * Coverage harness of SPEC 2026-11-21-r1-r2-curator-coverage section 8.1 (rev 1). It wraps
 * `createPlatformHarness` instead of copying it, so there is one implementation of the throwaway
 * data home: a realpath'd mkdtemp folder under os.tmpdir(), a SQLite file migrated inside it (its
 * path is checked against the folder before the first connection), an injected clock and a capture
 * of every Nest log line. Test-only: nothing in the product imports this folder.
 */

/**
 * A fixed fake credential. Tests hand it to a fake secret source and assert it never reaches a
 * log, a file or an output. It is deliberately not shaped like any real provider key.
 */
export const COVERAGE_SENTINEL_KEY = 'coverage-sentinel-credential-never-logged';

/** Bounded so a prefix can never carry a path segment out of os.tmpdir(). */
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

export class InvalidCoveragePrefixError extends Error {
  constructor(readonly prefix: string) {
    super('coverage home prefix must be 1 to 48 lowercase letters, digits or dashes');
    this.name = 'InvalidCoveragePrefixError';
  }
}

export class CoverageHomeOutsideTemporaryError extends Error {
  constructor(readonly root: string) {
    super('coverage home root is not inside the realpath of os.tmpdir()');
    this.name = 'CoverageHomeOutsideTemporaryError';
  }
}

export interface CoverageHome {
  /** Realpath'd mkdtemp folder under os.tmpdir(). */
  root: string;
  /** Points inside `root` only. */
  dataHome: DataHome;
  /** Migrated throwaway database inside `root`. */
  prisma: PrismaService;
  clock: MutableClock;
  logs: CapturedLogs;
  /** Fixed fake credential, asserted absent from logs and outputs. */
  sentinelKey: string;
  /** Disconnects, restores the log mocks and removes `root`. */
  close(): Promise<void>;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep) && resolve(parent, path) === child;
}

/** A migrated throwaway data home for one test; call `close()` in `afterEach`. */
export async function createCoverageHome(options: { prefix: string; start: Date }): Promise<CoverageHome> {
  if (!PREFIX_PATTERN.test(options.prefix)) throw new InvalidCoveragePrefixError(options.prefix);
  const harness = await createPlatformHarness({ prefix: options.prefix, start: options.start });
  const temporaryRoot = await realpath(tmpdir());
  if (!isInside(temporaryRoot, harness.root) || !isInside(harness.root, harness.dataHome.databaseFile)) {
    await harness.close();
    throw new CoverageHomeOutsideTemporaryError(harness.root);
  }
  let closed = false;
  return {
    root: harness.root,
    dataHome: harness.dataHome,
    prisma: harness.prisma,
    clock: harness.clock,
    logs: harness.logs,
    sentinelKey: COVERAGE_SENTINEL_KEY,
    close: async (): Promise<void> => {
      // `afterEach` may run after a test already closed the home; the second call is a no-op.
      if (closed) return;
      closed = true;
      await harness.close();
    },
  };
}
