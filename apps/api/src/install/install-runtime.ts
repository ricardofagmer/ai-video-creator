import { homedir } from 'node:os';

/*
 * The owner's home folder, injected so tests bind a fixed one. The clock and random source live in
 * `@studio/core/install`, shared with the CLI.
 */

/** Only the capture browser probe reads under it. */
export const INSTALL_HOME_DIRECTORY = Symbol('INSTALL_HOME_DIRECTORY');

export function systemHomeDirectory(): string {
  return homedir();
}
