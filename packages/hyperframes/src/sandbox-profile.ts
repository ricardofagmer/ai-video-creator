import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from './package-paths';
import { SANDBOX_EXEC_PATH } from './render-command';

/*
 * The render sandbox profile shipped with this package (SPEC 0008 section 4.6). Its sha-256 is
 * part of the trace record: `engineState` compares it, so an edited profile makes the trace stale.
 */

export function sandboxProfile(): { path: string; sha256: string } {
  const path = join(packageRoot(), 'sandbox', 'render.sb');
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, sha256 };
}

/** Whether `/usr/bin/sandbox-exec` exists; the render refuses without it (`sandbox-unavailable`). */
export function sandboxExecExists(): boolean {
  return existsSync(SANDBOX_EXEC_PATH);
}
