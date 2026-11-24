import { CLI_EXIT, runCli, type SetupContext } from '../setup-context';
import { type SetupStep, type StepRunResult } from '../setup-types';

const SEED_ARGS: readonly string[] = ['catalog', 'seed'];

/**
 * Step 7: `studio catalog seed`, which is idempotent in the CLI. The machine cannot cheaply say
 * whether this version's seeds are in, so the record keeps the version that last seeded: a second
 * run of the same version is already done (DI-AC-02) and an upgrade seeds what it brought
 * (DI-AC-05). A partial seed (exit 7) warns and is retried at the next launch.
 */
export function seedCatalogStep(context: SetupContext): SetupStep {
  return {
    id: 'seed-catalog',
    required: false,
    async check() {
      return (await context.record.read()).seededVersion === context.appVersion ? { kind: 'done' } : { kind: 'needed' };
    },
    async run(): Promise<StepRunResult> {
      const exit = await runCli(context, SEED_ARGS);
      if (exit === CLI_EXIT.partial) return { kind: 'warning', reason: 'seed-partial' };
      if (exit !== CLI_EXIT.ok) return { kind: 'warning', reason: 'seed-failed' };
      await context.record.update((record) => ({ ...record, seededVersion: context.appVersion }));
      return { kind: 'done' };
    },
  };
}
