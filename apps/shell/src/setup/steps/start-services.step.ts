import { CLI_EXIT, runCli, type SetupContext } from '../setup-context';
import { MAX_PID_RECORD_BYTES, parseServicePidRecord, pidRecordPath, type ServiceName } from '../../state/pid-record';
import { type SetupStep, type StepRunResult } from '../setup-types';

const SERVICES: readonly ServiceName[] = ['api', 'web'];

type ServiceState = 'running-current' | 'running-other' | 'stopped';

/**
 * Reads the pid record `studio start` writes, through the injected file system. A live process
 * started from another app copy (an older version, a moved app) is `running-other`: it must be
 * restarted so the services run this version's code.
 */
async function serviceState(context: SetupContext, service: ServiceName): Promise<ServiceState> {
  const read = await context.files.readText(pidRecordPath(context.paths.dataHome.logs, service), MAX_PID_RECORD_BYTES);
  if (read.status !== 'read') return 'stopped';
  const parsed = parseServicePidRecord(read.text, service);
  if (parsed.status !== 'present' || !context.isProcessAlive(parsed.record.pid)) return 'stopped';
  const payload = context.paths.runtime.payload[service];
  return parsed.record.entryPath.startsWith(`${payload}/`) ? 'running-current' : 'running-other';
}

async function servicesState(context: SetupContext): Promise<readonly ServiceState[]> {
  return Promise.all(SERVICES.map((service) => serviceState(context, service)));
}

/**
 * Step 8: `studio start` (api and web on 127.0.0.1, which the locator enforces). Done when both
 * services run from this app copy and this version started them; otherwise a stop, then a start,
 * so an upgrade never leaves the previous version serving (DI-AC-05).
 */
export function startServicesStep(context: SetupContext): SetupStep {
  return {
    id: 'start-services',
    required: true,
    async check() {
      const states = await servicesState(context);
      const startedByThisVersion = (await context.record.read()).servicesVersion === context.appVersion;
      return startedByThisVersion && states.every((state) => state === 'running-current') ? { kind: 'done' } : { kind: 'needed' };
    },
    async run(): Promise<StepRunResult> {
      const states = await servicesState(context);
      if (states.some((state) => state !== 'stopped') && (await runCli(context, ['stop'])) !== CLI_EXIT.ok) {
        return { kind: 'failed', reason: 'services-failed' };
      }
      if ((await runCli(context, ['start'])) !== CLI_EXIT.ok) return { kind: 'failed', reason: 'services-failed' };
      await context.record.update((record) => ({ ...record, servicesVersion: context.appVersion }));
      return { kind: 'done' };
    },
  };
}
