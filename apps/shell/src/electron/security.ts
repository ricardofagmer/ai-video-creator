import { app, session } from 'electron';

/*
 * Vetting 0002 section 8, with the names confirmed in section 12. The shell's only window is the
 * packaged app's setup window, which loads one bundled local file under its own CSP; these settings
 * deny it (and any other web contents) new windows, navigation and every permission. No
 * command-line switch is appended anywhere in this package: the debugger-port switch is not blocked
 * by any fuse, so its absence from the code is the control (section 12, row 12 correction).
 */

/** Must run before `ready`. */
export function applyPreReadySecurity(): void {
  app.enableSandbox();
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (navigation) => navigation.preventDefault());
  });
}

/** Runs at `ready`. Both handlers deny: the 45.4.1 typings require the check handler too for complete denial. */
export function applyReadySecurity(): void {
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  defaultSession.setPermissionCheckHandler(() => false);
}
