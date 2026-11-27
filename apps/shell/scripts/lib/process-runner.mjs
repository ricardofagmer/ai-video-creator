// The one way the staging modules start a program: an absolute executable, an argument array and
// no shell, so a path holding spaces or quotes is always one argument. Injected into every module
// that runs a tool, so the planning code can be exercised without starting any process.
import { spawnSync } from 'node:child_process';
import { fail } from './failure.mjs';

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

/**
 * Returns `run(executable, args, options)`. `options.capture` returns stdout as text instead of
 * inheriting it; a non-zero exit, a signal or a start failure throws a StagingError naming
 * `options.what`.
 */
export function createProcessRunner() {
  return function run(executable, args, options = {}) {
    if (!executable.startsWith('/')) fail(`refusing to run "${executable}": only absolute executables are started.`);
    const result = spawnSync(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      encoding: options.capture ? 'utf8' : undefined,
      maxBuffer: MAX_CAPTURE_BYTES,
    });
    const what = options.what ?? executable;
    if (result.error !== undefined) fail(`${what} could not start (${result.error.message}).`);
    if (result.status !== 0) fail(`${what} failed (exit ${result.status ?? `signal ${result.signal ?? 'unknown'}`}).`);
    return options.capture ? String(result.stdout) : '';
  };
}
