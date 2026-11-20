import { app, nativeImage, shell, Tray } from 'electron';
import { isProcessAlive } from '@studio/shared/run-files';
import { nodeSpawner } from '../actions/node-spawner';
import { StudioInvoker } from '../actions/studio-invoker';
import { studioUrl } from '../actions/studio-url';
import { parseShellArguments } from '../cli/shell-arguments';
import { readShellConfig, ShellConfigError, type ShellConfig } from '../config/shell-config';
import { ShellController, type ShellSnapshot } from '../controller/shell-controller';
import { startInterval, startTimer } from '../controller/timers';
import { logDiagnostic } from '../logging/diagnostics';
import { labels } from '../menu/labels';
import { buildIncompleteInstallationMenu, buildMenuModel, type MenuActionId, type MenuItemModel } from '../menu/menu-model';
import { dataHomePaths } from '../state/data-home-paths';
import { readFastInputs, slowInputsReader } from '../state/state-inputs';
import { readOpenAtLogin, writeOpenAtLogin } from './login-item';
import { renderMenu, type MenuHandlers } from './menu-renderer';
import { applyPreReadySecurity, applyReadySecurity } from './security';

export interface ShellAppOptions {
  readonly argv: readonly string[];
  /** `shell-config.json` beside the bundled `main.js`. */
  readonly configPath: string;
  /** Only the allowlisted names are ever copied to a child. */
  readonly environment: Readonly<Record<string, string | undefined>>;
}

// Module scope keeps the tray from being garbage collected, which would remove the icon.
let tray: Tray | null = null;

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

function showIncompleteInstallation(target: Tray): void {
  const present = menuPresenter(target, { onAction: () => quit(null), onOpenAtLoginChange: () => undefined }, () => undefined);
  present(buildIncompleteInstallationMenu());
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

function startController(target: Tray, config: ShellConfig, environment: ShellAppOptions['environment']): ShellController {
  const paths = dataHomePaths(config.dataHome);
  const invoker = new StudioInvoker({ config, parentEnvironment: environment, spawner: nodeSpawner, startTimer });
  let present: (items: MenuItemModel[]) => void = () => undefined;
  const controller = new ShellController({
    readFast: () => readFastInputs(paths),
    readSlow: slowInputsReader(paths),
    invoker,
    now: () => Date.now(),
    isProcessAlive,
    startInterval,
    render: (snapshot: ShellSnapshot) => present(buildMenuModel({ ...snapshot, openAtLogin: readOpenAtLogin() })),
  });
  const onAction = (id: MenuActionId): void => {
    if (id === 'start' || id === 'stop') controller.requestAction(id);
    else if (id === 'open-studio') openStudio(config);
    else quit(controller);
  };
  const onOpenAtLoginChange = (checked: boolean): void => {
    changeOpenAtLogin(checked);
    void controller.refreshFast();
  };
  present = menuPresenter(target, { onAction, onOpenAtLoginChange }, () => void controller.refreshSlow());
  return controller;
}

async function startTray(options: ShellAppOptions): Promise<void> {
  applyReadySecurity();
  // Tray-only: no Dock icon. The packaged Info.plist also sets LSUIElement; both are kept on purpose.
  app.dock?.hide();
  // A text-title tray: no icon asset exists in the repository, and none is committed for this.
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(labels.trayTitle);
  let config: ShellConfig;
  try {
    config = await readShellConfig(options.configPath);
  } catch (error) {
    logDiagnostic({ event: 'config-invalid', reason: error instanceof ShellConfigError ? error.reason : 'unexpected-error' });
    showIncompleteInstallation(tray);
    return;
  }
  const controller = startController(tray, config, options.environment);
  app.on('before-quit', () => controller.stop());
  await controller.start();
  logDiagnostic({ event: 'shell-started' });
}

async function unregisterLoginItem(): Promise<void> {
  await app.whenReady();
  changeOpenAtLogin(false);
  app.quit();
}

/** Entry point of the main process. Creates no window, opens no listener and appends no switch. */
export function runShellApp(options: ShellAppOptions): void {
  applyPreReadySecurity();
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
