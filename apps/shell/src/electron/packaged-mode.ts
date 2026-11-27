import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { isProcessAlive } from '@studio/shared/run-files';
import { runtimeChildEnvironment, type PackagedRuntime } from '@studio/core/runtime';
import { type Spawner } from '../actions/studio-invoker';
import { packagedDataHome, PACKAGED_API_PORT, PACKAGED_WEB_PORT } from '../config/packaged-config';
import { type ShellLocale } from '../i18n/locale';
import { nodeProcessRunner } from '../setup/process-runner';
import { PACKAGED_BASE_PATH, type SetupContext } from '../setup/setup-context';
import { nodeSetupFileSystem } from '../setup/setup-file-system';
import { stderrSetupLogger } from '../setup/setup-log';
import { runSetup } from '../setup/setup-orchestrator';
import { createSetupContext, packagedSetupPlan, type SetupEnvironment } from '../setup/setup-plan';
import { type SetupInteraction, type SetupProgress } from '../setup/setup-types';
import { startGate, type StartGate } from '../setup/start-gate';
import { serveSetupFiles } from './setup-protocol';
import { SetupWindow } from './setup-window';
import { runUninstallFlow } from './uninstall-flow';

/*
 * Packaged mode wiring (desktop installer): first-run setup at every launch, the setup window, the
 * uninstall flow, and the menu's `studio start|stop` children with the runtime variable and the
 * minimal PATH. Development mode never reaches this module.
 */

/**
 * Wraps the menu's spawner: the CLI child gets `ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR` and PATH =
 * bundled folders + `/usr/bin:/bin`, replacing the Homebrew fallback of `actions/child-environment.ts`.
 */
export function packagedSpawner(runtime: PackagedRuntime, inner: Spawner): Spawner {
  return (request) => inner({ ...request, env: runtimeChildEnvironment(runtime, { ...request.env, PATH: PACKAGED_BASE_PATH }) });
}

/** `<App>.app/Contents/Resources` -> `<App>.app`. */
export function appBundleOf(resourcesPath: string): string {
  return dirname(dirname(resourcesPath));
}

/** Refuses every question: the uninstall context never asks one. */
const NO_INTERACTION: SetupInteraction = {
  requestPassphrase: () => Promise.resolve({ kind: 'cancelled' }),
  requestConsent: () => Promise.resolve('declined'),
};

export interface PackagedShellOptions {
  readonly runtime: PackagedRuntime;
  readonly resourcesPath: string;
  readonly locale: ShellLocale;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** What ticket 07's menu entries call; one instance per packaged launch. */
export class PackagedShell {
  private readonly window: SetupWindow;
  private readonly setupEnvironment: SetupEnvironment;
  private running: Promise<SetupProgress> | null = null;
  private lastProgress: SetupProgress | null = null;

  constructor(private readonly options: PackagedShellOptions) {
    const homeDirectory = homedir();
    this.setupEnvironment = {
      runtime: options.runtime,
      appBundle: appBundleOf(options.resourcesPath),
      appVersion: app.getVersion(),
      homeDirectory,
      dataHome: packagedDataHome(homeDirectory),
      // Always present on macOS; an impossible uid would only make launchctl refuse, never target root.
      uid: process.getuid?.() ?? -1,
      ports: { web: PACKAGED_WEB_PORT, api: PACKAGED_API_PORT },
      parentEnvironment: options.environment,
    };
    serveSetupFiles(join(__dirname, 'setup.html'));
    this.window = new SetupWindow({
      locale: options.locale,
      files: { html: join(__dirname, 'setup.html'), preload: join(__dirname, 'setup-preload.js') },
      onRetry: () => void this.runSetup(),
    });
  }

  /** Called at launch. The window opens on a first run, a refusal, a failure or a question. */
  async startAtLaunch(): Promise<SetupProgress> {
    const dataHome = await nodeSetupFileSystem.inspect(this.setupEnvironment.dataHome);
    if (dataHome.kind !== 'folder') this.window.show();
    return this.runSetup();
  }

  /** Menu: "Set up" / "Repair". Shows the window and runs setup again (already-done steps are skipped). */
  openSetupWindow(): void {
    this.window.show();
    if (this.lastProgress?.phase !== 'running') void this.runSetup();
  }

  /**
   * Menu: "Start". While the last setup run has not completed, Start is answered by the setup
   * window and a setup run (or the one in progress): setup's step 8 starts the services once the
   * database and the watcher are ready. The caller spawns `studio start` only on `start`.
   */
  requestStart(): StartGate {
    const gate = startGate(this.lastProgress);
    if (gate.kind === 'setup-first') {
      stderrSetupLogger({ event: 'start-deferred' });
      this.openSetupWindow();
    }
    return gate;
  }

  /** Menu: "Uninstall". Native dialogs, then the app quits; cancelling changes nothing. */
  async uninstall(): Promise<void> {
    await runUninstallFlow(this.context(NO_INTERACTION), this.options.locale);
  }

  private context(interaction: SetupInteraction): SetupContext {
    return createSetupContext(
      this.setupEnvironment,
      { run: nodeProcessRunner, files: nodeSetupFileSystem, clock: () => new Date(), pause, log: stderrSetupLogger, isProcessAlive },
      interaction,
    );
  }

  /** One run at a time; a second request while one runs joins it. */
  private runSetup(): Promise<SetupProgress> {
    if (this.running !== null) return this.running;
    const run = runSetup({
      appBundlePath: this.setupEnvironment.appBundle,
      interaction: this.window,
      createPlan: (interaction) => packagedSetupPlan(this.context(interaction)),
      log: stderrSetupLogger,
      onProgress: (progress) => this.onProgress(progress),
    }).finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  private onProgress(progress: SetupProgress): void {
    this.lastProgress = progress;
    this.window.showProgress(progress);
    if (progress.phase === 'refused' || progress.phase === 'failed') this.window.show();
  }
}
