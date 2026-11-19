import { type Printer } from '../output/printer.js';
import { type CliSettings } from '../settings/cli-settings.js';

/** What every command handler receives from `main`; commands never read `process.env` themselves. */
export interface CommandDependencies {
  settings: CliSettings;
  printer: Printer;
  /** Aborted on Ctrl-C; long commands (import, seed, doctor) pass it down. */
  signal: AbortSignal;
}
