/*
 * Process identity stub of SPEC 2026-11-21-r1-r2-curator-coverage section 8.2 (rev 1). The watcher
 * binds `WATCHER_PROCESS` to `process.pid` when its module graph is built, so a test that stubs the
 * pid BEFORE `startMockEngine` runs the engine as another process (crash-resume, ownership). The
 * stub changes the property only; signals still go to real pids. Test-only.
 */

export class InvalidProcessIdError extends Error {
  constructor(readonly pid: number) {
    super('a stubbed pid must be a positive safe integer');
    this.name = 'InvalidProcessIdError';
  }
}

/** Makes `process.pid` read `pid`; the returned function restores the real value (idempotent). */
export function stubProcessIdentity(pid: number): () => void {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new InvalidProcessIdError(pid);
  const original = Object.getOwnPropertyDescriptor(process, 'pid');
  Object.defineProperty(process, 'pid', { value: pid, writable: false, enumerable: true, configurable: true });
  let restored = false;
  return (): void => {
    if (restored) return;
    restored = true;
    if (original === undefined) Reflect.deleteProperty(process, 'pid');
    else Object.defineProperty(process, 'pid', original);
  };
}
