import { dirname } from 'node:path';
import { probeFileHolder, probePortListener } from '../database-holders';
import { bootoutAgent } from '../launchd-agent';
import { packagedChildEnvironment, runCli, type SetupContext } from '../setup-context';
import { type ProcessRequest } from '../process-runner';
import { type SetupStep, type StepFailureReason } from '../setup-types';

/**
 * Same URL `@studio/core/prisma` `sqliteDatasourceUrl` builds (connection limit 1, 5 s lock wait).
 * Rebuilt here because that subpath also exports the Prisma service, which must not enter the
 * Electron bundle; drift is a review item for the final gate.
 */
export function sqliteDatasourceUrl(databaseFile: string): string | null {
  if (!databaseFile.startsWith('/') || /[?#\0]/.test(databaseFile)) return null;
  return `file:${databaseFile}?connection_limit=1&socket_timeout=5`;
}

type PrismaCommand = 'status' | 'deploy';

/**
 * `<node> <prisma cli> migrate <status|deploy> --schema <staged schema>` (plan 9.1), with the
 * bundled schema engine and Prisma's update check and telemetry off, so no request leaves the Mac.
 */
function prismaRequest(context: SetupContext, command: PrismaCommand, databaseUrl: string): ProcessRequest {
  const { runtime, prismaSchema } = context.paths;
  return {
    command: runtime.nodeBinary,
    args: [runtime.prisma.cliEntry, 'migrate', command, '--schema', prismaSchema],
    cwd: dirname(prismaSchema),
    env: packagedChildEnvironment(context, {
      ENGINEOS_VIDEO_CREATOR_DATABASE_URL: databaseUrl,
      PRISMA_SCHEMA_ENGINE_BINARY: runtime.prisma.schemaEngine,
      CHECKPOINT_DISABLE: '1',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    }),
  };
}

async function prismaExitCode(context: SetupContext, command: PrismaCommand): Promise<number | null> {
  const databaseUrl = sqliteDatasourceUrl(context.paths.dataHome.databaseFile);
  if (databaseUrl === null) return null;
  const result = await context.run(prismaRequest(context, command, databaseUrl));
  return result.kind === 'exited' ? result.code : null;
}

/** A process that was just told to stop may need a moment to close its listener and the database. */
const RELEASE_WAIT_POLLS = 5;
const RELEASE_POLL_MILLISECONDS = 500;

type DatabaseBlocker = Extract<StepFailureReason, 'api-still-running' | 'database-in-use'>;

/**
 * What still uses the database, or null when nothing does. An answer the machine did not give
 * (`unknown`) counts as in use: with the owner's data behind it, the step fails closed.
 */
async function databaseBlocker(context: SetupContext): Promise<DatabaseBlocker | null> {
  if ((await probePortListener(context.run, context.ports.api)) !== 'free') return 'api-still-running';
  if ((await probeFileHolder(context.run, context.paths.dataHome.databaseFile)) !== 'free') return 'database-in-use';
  return null;
}

async function waitForFreeDatabase(context: SetupContext): Promise<DatabaseBlocker | null> {
  let blocker = await databaseBlocker(context);
  for (let poll = 0; blocker !== null && poll < RELEASE_WAIT_POLLS; poll += 1) {
    await context.pause(RELEASE_POLL_MILLISECONDS);
    blocker = await databaseBlocker(context);
  }
  return blocker;
}

/**
 * Step 3: pending migrations only (`migrate deploy`; never `dev`, `db push` or a reset). `migrate
 * status` exits 0 only when the database exists and nothing is pending, which is what makes a second
 * run report this step as already done and an upgrade apply what it brought (DI-AC-05).
 */
export function migrationsStep(context: SetupContext): SetupStep {
  return {
    id: 'migrations',
    required: true,
    async check() {
      return (await prismaExitCode(context, 'status')) === 0 ? { kind: 'done' } : { kind: 'needed' };
    },
    async run() {
      // An earlier install (install.sh, an older app) keeps the database open through its watcher
      // agent and its services, and `migrate deploy` then stops on "database is locked". Both are
      // stopped first; steps 6 and 8 start this version's watcher and services again.
      const agentStopped = await bootoutAgent(
        { run: context.run, pause: context.pause },
        { domain: context.paths.launchdDomain, service: context.paths.launchdService },
      );
      if (!agentStopped) return { kind: 'failed', reason: 'migrations-failed' };
      // The exit code is not trusted: `stop` only signals what it recorded, and a service with no
      // record (or anything else on the port or the file) survives it. The machine is asked instead,
      // and `migrate deploy` never runs against a database something else still uses.
      await runCli(context, ['stop']);
      const blocker = await waitForFreeDatabase(context);
      if (blocker !== null) return { kind: 'failed', reason: blocker };
      return (await prismaExitCode(context, 'deploy')) === 0 ? { kind: 'done' } : { kind: 'failed', reason: 'migrations-failed' };
    },
  };
}
