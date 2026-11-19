/**
 * Where command output goes. Commands receive it instead of touching `process.stdout`, so the
 * non-interactive commands stay testable and the Ink dashboard owns the screen alone.
 */
export interface Printer {
  line(text?: string): void;
  error(text: string): void;
}

export class ConsolePrinter implements Printer {
  line(text = ''): void {
    process.stdout.write(`${text}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${text}\n`);
  }
}
