import { CLI_EXIT, runCli, type SetupContext } from '../setup-context';
import { type SetupStep } from '../setup-types';

const DOCTOR_ARGS: readonly string[] = ['doctor'];

/**
 * Step 9: `studio doctor`, the same health check the CLI offers. It changes nothing, so check and
 * run are the same call; exit 0 is healthy, anything else (6 unhealthy) fails setup with retry.
 */
export function doctorStep(context: SetupContext): SetupStep {
  const healthy = async (): Promise<boolean> => (await runCli(context, DOCTOR_ARGS)) === CLI_EXIT.ok;
  return {
    id: 'doctor',
    required: true,
    async check() {
      return (await healthy()) ? { kind: 'done' } : { kind: 'needed' };
    },
    async run() {
      return (await healthy()) ? { kind: 'done' } : { kind: 'failed', reason: 'doctor-unhealthy' };
    },
  };
}
