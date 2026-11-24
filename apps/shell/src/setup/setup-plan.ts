import { type PackagedRuntime } from '@studio/core/runtime';
import { type SetupFileSystem } from './setup-file-system';
import { type SetupLogger } from './setup-log';
import { type SetupPlan } from './setup-orchestrator';
import { setupPaths } from './setup-paths';
import { SetupRecordStore } from './setup-record';
import { type ProcessRunner } from './process-runner';
import { type SetupContext, type StudioPorts } from './setup-context';
import { type Clock, type SetupInteraction } from './setup-types';
import { dataFoldersStep } from './steps/data-folders.step';
import { doctorStep } from './steps/doctor.step';
import { migrationsStep } from './steps/migrations.step';
import { optionalComponentsReport, optionalDownloadsStep } from './steps/optional-downloads.step';
import { passphraseStep } from './steps/passphrase.step';
import { seedCatalogStep } from './steps/seed-catalog.step';
import { startServicesStep } from './steps/start-services.step';
import { verifyPayloadStep } from './steps/verify-payload.step';
import { watcherAgentStep } from './steps/watcher-agent.step';

/** What the Electron side knows about this machine and this app copy; everything else is derived. */
export interface SetupEnvironment {
  readonly runtime: PackagedRuntime;
  readonly appBundle: string;
  readonly appVersion: string;
  readonly homeDirectory: string;
  readonly dataHome: string;
  readonly uid: number;
  readonly ports: StudioPorts;
  readonly parentEnvironment: Readonly<Record<string, string | undefined>>;
}

/** The injected effects: production passes the node implementations, tests pass fakes. */
export interface SetupEffects {
  readonly run: ProcessRunner;
  readonly files: SetupFileSystem;
  readonly clock: Clock;
  readonly pause: (milliseconds: number) => Promise<void>;
  readonly log: SetupLogger;
  readonly isProcessAlive: (pid: number) => boolean;
}

export function createSetupContext(environment: SetupEnvironment, effects: SetupEffects, interaction: SetupInteraction): SetupContext {
  const paths = setupPaths(environment);
  return {
    paths,
    appVersion: environment.appVersion,
    ports: environment.ports,
    parentEnvironment: environment.parentEnvironment,
    record: new SetupRecordStore(effects.files, { dataHomeRoot: paths.dataHome.root, file: paths.setupStateFile }),
    interaction,
    ...effects,
  };
}

/** The nine steps of plan section 5, in their fixed order (`SETUP_STEP_IDS`). */
export function packagedSetupPlan(context: SetupContext): SetupPlan {
  return {
    steps: [
      verifyPayloadStep(context),
      dataFoldersStep(context),
      migrationsStep(context),
      passphraseStep(context),
      optionalDownloadsStep(context),
      watcherAgentStep(context),
      seedCatalogStep(context),
      startServicesStep(context),
      doctorStep(context),
    ],
    components: () => optionalComponentsReport(context),
  };
}
