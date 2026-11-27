import { type HyperframesProcessPort } from '@studio/hyperframes';
import { type TerminalPort } from '../terminal/line-prompt.js';

/*
 * What `studio hyperframes` touches outside its own code, injected so the commands are testable on
 * the fake process port with a temporary data home (SPEC 0008 K11). The real adapters live in
 * `real-ports.ts`; tests never import them.
 */

/** One line of a sandbox denial in the system log: process, operation and target only. */
export interface SandboxDenial {
  process: string;
  operation: string;
  target: string;
}

export type SandboxLogRead = { status: 'read'; denials: readonly SandboxDenial[] } | { status: 'unavailable' };

/** ffprobe's stdout, or `unavailable` when it did not start, timed out, exited non-zero or wrote too much. */
export type ProbeOutput = { status: 'read'; stdout: string } | { status: 'unavailable' };

export interface HyperframesSystemPort {
  sandboxExecExists(): boolean;
  /** Sandbox denials logged between the two instants (`/usr/bin/log show`). */
  readSandboxDenials(window: { start: Date; end: Date }): Promise<SandboxLogRead>;
  /**
   * Runs `program` (the render runtime's resolved `ffprobeBin`: the PATH match in development, the
   * bundled binary when packaged) by `args`, with `searchPath`, the CLI's child PATH. The picture
   * check of `@studio/hyperframes` builds the arguments and reads the output.
   */
  readProbe(program: string, args: readonly string[], searchPath: string): Promise<ProbeOutput>;
  /** Waits before the log read so the last denials are flushed; aborts with the command. */
  pause(milliseconds: number, signal: AbortSignal): Promise<void>;
}

/** Section 7 CLI events; fields are states, versions and counts only. */
export type HyperframesCliEvent =
  | { event: 'hyperframes.engine-changed'; state: 'enabled' | 'disabled' }
  | { event: 'hyperframes.chrome-installed'; version: string; sizeBytes: number }
  | { event: 'hyperframes.trace-finished'; result: 'pass' | 'fail'; deniedNetwork: number; controlDenied: boolean };

export interface HyperframesEventPort {
  record(event: HyperframesCliEvent): Promise<void>;
}

export interface HyperframesCommandPorts {
  now(): Date;
  terminal: TerminalPort;
  /** The process adapter for one command, bound to its abort signal. */
  process(signal: AbortSignal): HyperframesProcessPort;
  system: HyperframesSystemPort;
  events: HyperframesEventPort;
}
