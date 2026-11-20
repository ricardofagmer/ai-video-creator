/** The one switch the shell accepts; the uninstaller runs the app with it to remove the login item. */
export const UNREGISTER_LOGIN_ITEM_SWITCH = '--unregister-login-item';

export type ShellMode = { kind: 'tray' } | { kind: 'unregister-login-item' };

/**
 * Recognises only `--unregister-login-item`; every other argument (the executable path, a macOS
 * `-psn_` argument, anything else) is ignored and never reaches a spawn, a path or a URL.
 */
export function parseShellArguments(argv: readonly string[]): ShellMode {
  return argv.includes(UNREGISTER_LOGIN_ITEM_SWITCH) ? { kind: 'unregister-login-item' } : { kind: 'tray' };
}
