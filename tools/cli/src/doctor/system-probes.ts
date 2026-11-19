import { execFile } from 'node:child_process';

/** A9 label, as in apps/watcher/launchd/com.videostudio.watcher.plist.template. */
export const WATCHER_LAUNCHD_LABEL = 'com.videostudio.watcher';

/** Absolute paths: never resolved through PATH, so a planted binary is not run. */
const LAUNCHCTL_PATH = '/bin/launchctl';
const PROBE_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export type ProcessResult = { status: 'ok'; stdout: string } | { status: 'failed'; exitCode: number | null; missing: boolean };

/**
 * Runs a fixed argv with no shell and the explicit minimal environment the caller passes (SPEC
 * 0002 rev 3), never `process.env`. Output stays in memory for parsing; it is never logged.
 */
export function runReadOnly(command: string, args: readonly string[], environment: Readonly<Record<string, string>>): Promise<ProcessResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, shell: false, windowsHide: true, env: { ...environment } },
      (error, stdout) => {
        if (error === null) {
          resolve({ status: 'ok', stdout });
          return;
        }
        const code: unknown = 'code' in error ? error.code : undefined;
        resolve({ status: 'failed', exitCode: typeof code === 'number' ? code : null, missing: code === 'ENOENT' });
      },
    );
  });
}

export type WatcherAgentState =
  | { status: 'running'; pid: number }
  | { status: 'loaded-not-running' }
  | { status: 'not-loaded' }
  | { status: 'unknown' };

/**
 * Read-only `launchctl print gui/<uid>/com.videostudio.watcher` (never load or bootstrap; R1-22
 * owns registration). A loaded agent prints `state = running` and `pid = N`.
 */
export async function probeWatcherAgent(uid: number, environment: Readonly<Record<string, string>>): Promise<WatcherAgentState> {
  if (!Number.isSafeInteger(uid) || uid < 0) return { status: 'unknown' };
  const result = await runReadOnly(LAUNCHCTL_PATH, ['print', `gui/${uid}/${WATCHER_LAUNCHD_LABEL}`], environment);
  if (result.status === 'failed') return result.missing ? { status: 'unknown' } : { status: 'not-loaded' };
  const state = /^\s*state = (\S+)/m.exec(result.stdout)?.[1];
  const pidText = /^\s*pid = (\d+)/m.exec(result.stdout)?.[1];
  if (state === 'running' && pidText !== undefined) return { status: 'running', pid: Number.parseInt(pidText, 10) };
  return { status: 'loaded-not-running' };
}

export type ToolVersion = { status: 'found'; version: string } | { status: 'missing' } | { status: 'failed' };

/** `ffmpeg -version` / `ffprobe -version`, resolved through the child's PATH as the toolbox does. */
export async function probeToolVersion(tool: 'ffmpeg' | 'ffprobe', environment: Readonly<Record<string, string>>): Promise<ToolVersion> {
  const result = await runReadOnly(tool, ['-version'], environment);
  if (result.status === 'failed') return result.missing ? { status: 'missing' } : { status: 'failed' };
  const version = new RegExp(`^${tool} version (\\S+)`).exec(result.stdout)?.[1];
  return { status: 'found', version: version ?? 'desconhecida' };
}
