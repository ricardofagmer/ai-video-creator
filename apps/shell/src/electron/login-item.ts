import { app } from 'electron';

/** `app.getLoginItemSettings` / `setLoginItemSettings`, as typed in the installed 45.4.1 `electron.d.ts`. */
export function readOpenAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function writeOpenAtLogin(openAtLogin: boolean): void {
  app.setLoginItemSettings({ openAtLogin });
}
