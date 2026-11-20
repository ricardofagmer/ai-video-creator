import { stripTerminalControls } from './terminal-text.js';

/**
 * Where command output goes. Commands receive it instead of touching `process.stdout`, so the
 * non-interactive commands stay testable and the Ink dashboard owns the screen alone.
 */
export interface Printer {
  line(text?: string): void;
  error(text: string): void;
}

/** Every line passes through one filter, so no command can print a terminal control sequence. */
export class ConsolePrinter implements Printer {
  line(text = ''): void {
    process.stdout.write(`${stripTerminalControls(text)}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${stripTerminalControls(text)}\n`);
  }
}
