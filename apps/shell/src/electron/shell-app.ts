import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, dialog, nativeImage, shell, Tray } from 'electron';
import { type PackagedRuntime } from '@studio/core/runtime';
import { isProcessAlive } from '@studio/shared/run-files';
import { nodeSpawner } from '../actions/node-spawner';
import { StudioInvoker, type Spawner } from '../actions/studio-invoker';
import { detectShellMode, packagedShellConfig, type ShellMode } from '../config/packaged-config';
import { studioUrl } from '../actions/studio-url';
import { parseShellArguments } from '../cli/shell-arguments';
import { readShellConfig, ShellConfigError, type ShellConfig } from '../config/shell-config';
import { ShellController, type ShellSnapshot } from '../controller/shell-controller';
import { startInterval, startTimer } from '../controller/timers';
import { logDiagnostic } from '../logging/diagnostics';
import { packagedCliEnvironment, portalCliRequest } from '../portal/portal-cli';
import { PortalService } from '../portal/portal-service';
import { readPortalSettings } from '../portal/portal-settings';
import { PORTAL_SETTINGS_FILE_NAME, readPortalSettingsFile, withPortalSettingsFile } from '../portal/portal-settings-file';
import { nodeProcessRunner } from '../setup/process-runner';
import { resolveShellLocale, type ShellLocale } from '../i18n/locale';
import { setupLabels } from '../i18n/setup-labels';
import { shellLabels } from '../menu/labels';
import { buildIncompleteInstallationMenu, buildMenuModel, type MenuActionId, type MenuItemModel } from '../menu/menu-model';
import { dataHomePaths } from '../state/data-home-paths';
import { readFastInputs, slowInputsReader } from '../state/state-inputs';
import { readOpenAtLogin, writeOpenAtLogin } from './login-item';
import { renderMenu, type MenuHandlers } from './menu-renderer';
import { PackagedShell, packagedSpawner } from './packaged-mode';
import { applyPreReadySecurity, applyReadySecurity } from './security';
import { registerSetupScheme } from './setup-protocol';

export interface ShellAppOptions {
  readonly argv: readonly string[];
  /** `shell-config.json` beside the bundled `main.js`. */
  readonly configPath: string;
  /** Only the allowlisted names are ever copied to a child. */
  readonly environment: Readonly<Record<string, string | undefined>>;
}

// Module scope keeps the tray from being garbage collected, which would remove the icon.
let tray: Tray | null = null;
let packagedShell: PackagedShell | null = null;

/**
 * The packaged app's setup and uninstall entry points, for the menu (ticket 07); null in
 * development mode, where neither menu entry is shown.
 */
export function currentPackagedShell(): PackagedShell | null {
  return packagedShell;
}

function quit(controller: ShellController | null): void {
  controller?.stop();
  app.quit();
}

/** Re-sets the context menu only when the model changed, so an open menu is not replaced every 5 s. */
function menuPresenter(target: Tray, handlers: MenuHandlers, onMenuOpen: () => void): (items: MenuItemModel[]) => void {
  let shown = '';
  return (items) => {
    const key = JSON.stringify(items);
    if (key === shown) return;
    shown = key;
    const menu = renderMenu(items, handlers);
    menu.on('menu-will-show', onMenuOpen);
    target.setContextMenu(menu);
  };
}

function showIncompleteInstallation(target: Tray, locale: ShellLocale): void {
  const present = menuPresenter(target, { onAction: () => quit(null), onOpenAtLoginChange: () => undefined }, () => undefined);
  present(buildIncompleteInstallationMenu(locale));
}

function changeOpenAtLogin(checked: boolean): void {
  try {
    writeOpenAtLogin(checked);
    logDiagnostic({ event: 'login-item-changed', enabled: checked });
  } catch {
    logDiagnostic({ event: 'login-item-failed', reason: 'unexpected-error' });
  }
}

function openStudio(config: ShellConfig): void {
  // The only browser hand-off in the package: the loopback web origin, built from the bundled port.
  shell.openExternal(studioUrl(config.webPort)).catch(() => logDiagnostic({ event: 'open-studio-failed', reason: 'unexpected-error' }));
}

interface ControllerSetup {
  readonly config: ShellConfig;
  readonly environment: ShellAppOptions['environment'];
  readonly locale: ShellLocale;
  readonly spawner: Spawner;
  /** Packaged mode: the runtime variable and minimal PATH for the portal's CLI calls too. */
  readonly runtime?: PackagedRuntime;
}

/** The menu's portal entries; network and CLI calls happen only on a click or a menu opening. */
function createPortalService(setup: ControllerSetup, onChange: () => void): PortalService {
  const { config, environment, runtime } = setup;
  return new PortalService({
    settings: readPortalSettings(environment),
    installedVersion: app.getVersion(),
    run: nodeProcessRunner,
    cliRequest: portalCliRequest({
      config,
      parentEnvironment: environment,
      ...(runtime === undefined ? {} : { adaptEnvironment: packagedCliEnvironment(runtime) }),
    }),
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    startTimer,
    openExternal: (url) => shell.openExternal(url),
    onChange,
  });
}

/**
 * The uninstall flow handles its own outcomes; a rejection (a dialog or a removal throwing) would
 * otherwise be unhandled and the owner left guessing, so it is reported as "did not finish".
 */
function uninstallFromMenu(locale: ShellLocale): void {
  const packaged = currentPackagedShell();
  if (packaged === null) return;
  packaged.uninstall().catch(() => {
    const labels = setupLabels[locale].uninstall;
    // Last resort: if even the error dialog fails there is no other surface to report on.
    dialog.showMessageBox({ type: 'error', message: labels.failedMessage, buttons: [labels.ok] }).catch(() => undefined);
  });
}

/** Ticket 07 entries; the packaged ones do nothing in development, where they are not shown. */
function runPortalAction(id: MenuActionId, portal: PortalService, locale: ShellLocale): void {
  if (id === 'connect-portal') void portal.connect();
  else if (id === 'disconnect-portal') void portal.disconnect();
  else if (id === 'open-update') void portal.openUpdate();
  else if (id === 'setup') currentPackagedShell()?.openSetupWindow();
  else if (id === 'uninstall') uninstallFromMenu(locale);
}

/**
 * Menu: "Start". The packaged app starts nothing while its setup is unfinished: the packaged shell
 * runs setup instead, and setup starts the services itself. Development has no setup to wait for.
 */
function startFromMenu(controller: ShellController): void {
  const packaged = currentPackagedShell();
  if (packaged !== null && packaged.requestStart().kind === 'setup-first') return;
  controller.requestAction('start');
}

function startController(target: Tray, setup: ControllerSetup): ShellController {
  const { config, environment, locale, spawner } = setup;
  const paths = dataHomePaths(config.dataHome);
  const invoker = new StudioInvoker({ config, parentEnvironment: environment, spawner, startTimer });
  let present: (items: MenuItemModel[]) => void = () => undefined;
  let lastSnapshot: ShellSnapshot | null = null;
  const show = (snapshot: ShellSnapshot): void => {
    lastSnapshot = snapshot;
    const packaged = currentPackagedShell() !== null;
    present(buildMenuModel({ ...snapshot, locale, openAtLogin: readOpenAtLogin(), portal: portal.menuState(), packaged }));
  };
  // A portal change re-renders from the last snapshot; before the first one there is no menu yet.
  const portal = createPortalService(setup, () => {
    if (lastSnapshot !== null) show(lastSnapshot);
  });
  const controller = new ShellController({
    readFast: () => readFastInputs(paths),
    readSlow: slowInputsReader(paths),
    invoker,
    now: () => Date.now(),
    isProcessAlive,
    startInterval,
    render: show,
  });
  const onAction = (id: MenuActionId): void => {
    if (id === 'start') startFromMenu(controller);
    else if (id === 'stop') controller.requestAction(id);
    else if (id === 'open-studio') openStudio(config);
    else if (id === 'quit') quit(controller);
    else runPortalAction(id, portal, locale);
  };
  const onOpenAtLoginChange = (checked: boolean): void => {
    changeOpenAtLogin(checked);
    void controller.refreshFast();
  };
  present = menuPresenter(target, { onAction, onOpenAtLoginChange }, () => {
    void controller.refreshSlow();
    // The only trigger of the release-manifest request: the owner opened the menu.
    void portal.checkForUpdate();
  });
  return controller;
}

async function startTray(options: ShellAppOptions): Promise<void> {
  applyReadySecurity();
  // Tray-only: no Dock icon. The packaged Info.plist also sets LSUIElement; both are kept on purpose.
  app.dock?.hide();
  // A text-title tray: no icon asset exists in the repository, and none is committed for this.
  // The menu follows the Mac's language list; a change takes effect at the next launch.
  const locale = resolveShellLocale(app.getPreferredSystemLanguages());
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(shellLabels[locale].trayTitle);
  let mode: ShellMode;
  try {
    mode = detectShellMode(process.resourcesPath);
  } catch {
    // A runtime folder the locator refuses: the bundle is damaged, never silently development.
    logDiagnostic({ event: 'config-invalid', reason: 'unexpected-error' });
    showIncompleteInstallation(tray, locale);
    return;
  }
  if (mode.kind === 'packaged') {
    await startPackaged(tray, { options, locale, runtime: mode.runtime });
    return;
  }
  let config: ShellConfig;
  try {
    config = await readShellConfig(options.configPath);
  } catch (error) {
    logDiagnostic({ event: 'config-invalid', reason: error instanceof ShellConfigError ? error.reason : 'unexpected-error' });
    showIncompleteInstallation(tray, locale);
    return;
  }
  const controller = startController(tray, { config, environment: options.environment, locale, spawner: nodeSpawner });
  app.on('before-quit', () => controller.stop());
  await controller.start();
  logDiagnostic({ event: 'shell-started' });
}

interface PackagedStart {
  readonly options: ShellAppOptions;
  readonly locale: ShellLocale;
  readonly runtime: PackagedRuntime;
}

/**
 * The packaged shell's environment: the process environment over the bundled `portal-settings.json`
 * beside this bundle's `main.js`. A damaged file disables the portal entries (logged), never the app.
 */
async function packagedEnvironment(environment: ShellAppOptions['environment']): Promise<ShellAppOptions['environment']> {
  const file = await readPortalSettingsFile(join(__dirname, PORTAL_SETTINGS_FILE_NAME));
  if (file.kind === 'invalid') {
    logDiagnostic({ event: 'config-invalid', ...(file.problem === 'invalid-value' ? {} : { reason: file.problem }) });
  }
  return withPortalSettingsFile(environment, file);
}

/**
 * Packaged mode: the configuration comes from the app's own runtime folder (no `shell-config.json`
 * is baked), the menu's CLI children get the runtime variable and the minimal PATH, and first-run
 * setup runs in the background at every launch.
 */
async function startPackaged(target: Tray, start: PackagedStart): Promise<void> {
  const { options, locale, runtime } = start;
  // The setup window is the only window; closing it must leave the tray running.
  app.on('window-all-closed', () => undefined);
  const config = packagedShellConfig(runtime, homedir());
  const environment = await packagedEnvironment(options.environment);
  packagedShell = new PackagedShell({ runtime, resourcesPath: process.resourcesPath, locale, environment });
  const controller = startController(target, { config, environment, locale, spawner: packagedSpawner(runtime, nodeSpawner), runtime });
  app.on('before-quit', () => controller.stop());
  await controller.start();
  logDiagnostic({ event: 'shell-started' });
  void packagedShell.startAtLaunch();
}

async function unregisterLoginItem(): Promise<void> {
  await app.whenReady();
  changeOpenAtLogin(false);
  app.quit();
}

/**
 * Entry point of the main process. Opens no listener and appends no switch; the only window is the
 * packaged app's local setup window.
 */
export function runShellApp(options: ShellAppOptions): void {
  applyPreReadySecurity();
  registerSetupScheme();
  if (parseShellArguments(options.argv).kind === 'unregister-login-item') {
    // The uninstaller's call: no lock (the tray may be running) and no tray.
    unregisterLoginItem().catch(() => app.quit());
    return;
  }
  if (!app.requestSingleInstanceLock()) {
    logDiagnostic({ event: 'second-instance-quit' });
    app.quit();
    return;
  }
  app
    .whenReady()
    .then(() => startTray(options))
    .catch(() => {
      logDiagnostic({ event: 'startup-failed', reason: 'unexpected-error' });
      app.quit();
    });
}
