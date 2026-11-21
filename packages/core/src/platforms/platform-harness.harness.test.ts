import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { mock } from 'node:test';
import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { DataHome } from '../paths/data-home';
import { PrismaService } from '../prisma/prisma.service';
import { type PlatformClock } from './platform-runtime';

/*
 * Test-only integration harness (SPEC 0007 section 12): a throwaway data home under os.tmpdir(), a
 * fresh SQLite file migrated from prisma/migrations and deleted afterwards, an injected clock and a
 * capture of every Nest log line. The studio's real data home and database are never opened: the
 * harness refuses any database path outside the temp folder before connecting. Helpers only: the
 * `.harness.test.ts` name keeps the file out of the build; it declares no test.
 */

const MIGRATIONS_DIRECTORY = resolve(__dirname, '..', '..', 'prisma', 'migrations');

/** A clock the test moves by hand. */
export class MutableClock implements PlatformClock {
  private current: number;

  constructor(start: Date) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

/** Every Nest log call while the harness lives, as inspected text. */
export class CapturedLogs {
  readonly lines: string[] = [];

  record(level: string, args: readonly unknown[]): void {
    this.lines.push(`${level} ${inspect(args, { depth: 8, breakLength: Number.POSITIVE_INFINITY })}`);
  }

  text(): string {
    return this.lines.join('\n');
  }
}

export interface PlatformHarness {
  root: string;
  dataHome: DataHome;
  platformRoot: string;
  prisma: PrismaService;
  clock: MutableClock;
  logs: CapturedLogs;
  close(): Promise<void>;
}

/**
 * SQL statements of one migration file. Comment lines are dropped; a `CREATE TRIGGER` statement
 * ends at its `END;` line (its body holds semicolons), every other statement at a line ending `;`.
 */
export function splitMigrationStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('--')) continue;
    current.push(line);
    const isTrigger = /^CREATE\s+TRIGGER/i.test(current[0]?.trim() ?? '');
    const ends = isTrigger ? trimmed.toUpperCase() === 'END;' : trimmed.endsWith(';');
    if (ends) {
      statements.push(current.join('\n'));
      current = [];
    }
  }
  assert.equal(current.length, 0, 'a migration ends inside a statement');
  return statements;
}

async function applyMigrations(prisma: PrismaService): Promise<void> {
  const folders = (await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(folders.length >= 6, 'expected the R1 to R4 migrations');
  for (const folder of folders) {
    const sql = await readFile(join(MIGRATIONS_DIRECTORY, folder, 'migration.sql'), 'utf8');
    for (const statement of splitMigrationStatements(sql)) await prisma.$executeRawUnsafe(statement);
  }
}

type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose';
const capturedLevels: readonly LogLevel[] = ['log', 'warn', 'error', 'debug', 'verbose'];

/** Replaces the Nest logger's instance methods; returns the restore functions. */
function captureLogs(logs: CapturedLogs): (() => void)[] {
  return capturedLevels.map((level) => {
    const replaced = mock.method(Logger.prototype, level, (...args: unknown[]): void => logs.record(level, args));
    return (): void => replaced.mock.restore();
  });
}

/** A migrated throwaway data home; call `close()` in `afterEach`. */
export async function createPlatformHarness(options: { prefix: string; start: Date }): Promise<PlatformHarness> {
  const temporaryRoot = await realpath(tmpdir());
  const root = await mkdtemp(join(temporaryRoot, `${options.prefix}-`));
  const dataHome = new DataHome(root);
  // Safety: the database must live inside this test's temp folder, never the studio's data home.
  assert.ok(resolve(dataHome.databaseFile).startsWith(`${root}${sep}`), 'database outside the temp data home');
  const platformRoot = join(root, 'platform');
  await mkdir(platformRoot, { recursive: true });
  const logs = new CapturedLogs();
  const logMocks = captureLogs(logs);
  const prisma = new PrismaService(dataHome);
  await prisma.onModuleInit();
  await applyMigrations(prisma);
  return {
    root,
    dataHome,
    platformRoot,
    prisma,
    clock: new MutableClock(options.start),
    logs,
    close: async (): Promise<void> => {
      await prisma.$disconnect();
      for (const restore of logMocks) restore();
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Every file under `root`, read as latin1 so binary SQLite pages are scanned too. */
export async function readAllFiles(root: string): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await readAllFiles(path)));
    else if (entry.isFile()) files.push({ path, text: (await readFile(path)).toString('latin1') });
  }
  return files;
}
