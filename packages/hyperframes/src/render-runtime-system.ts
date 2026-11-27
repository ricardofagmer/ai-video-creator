import { verifyChromeBinary, type RecordedChromeBinary } from './chrome-binary';
import { resolveExecutable } from './executable-paths';
import { pinnedBinPath } from './pinned-bin';
import { sandboxExecExists, sandboxProfile } from './sandbox-profile';

/**
 * What the render runtime gate asks of the machine that a temporary data home cannot stand in for:
 * the installed pin, the shipped sandbox profile, `sandbox-exec`, the recorded Chrome binary and
 * the media programs. Everything else the gate reads straight from the disk. Every member is
 * read-only: none starts a process.
 */
export interface RenderRuntimeSystem {
  /** Throws `HyperframesPinMismatchError` when the installed package is not the pin. */
  pinnedBinPath(): string;
  sandboxProfile(): { path: string; sha256: string };
  sandboxExecExists(): boolean;
  /** Throws `HyperframesChromeMissingError` when the binary no longer matches `chrome.json`. */
  verifyChromeBinary(recorded: RecordedChromeBinary, options: { cacheDir: string }): Promise<void>;
  /** Throws `HyperframesSandboxUnavailableError` when nothing executable is found. */
  resolveExecutable(nameOrPath: string, searchPath: string): Promise<string>;
}

export const realRenderRuntimeSystem: RenderRuntimeSystem = {
  pinnedBinPath,
  sandboxProfile,
  sandboxExecExists,
  verifyChromeBinary,
  resolveExecutable,
};

const FAKE_PROFILE_SHA256 = '0'.repeat(64);

/**
 * A system for tests: the pin, the profile and `sandbox-exec` are present, the Chrome binary is
 * unchanged, and executables are looked up on the real disk, so a test places them in its own
 * temporary folder. Pass an override for the one answer a test wants to change.
 */
export function fakeRenderRuntimeSystem(overrides: Partial<RenderRuntimeSystem> = {}): RenderRuntimeSystem {
  return {
    pinnedBinPath: () => '/fake/node_modules/hyperframes/bin/hyperframes.mjs',
    sandboxProfile: () => ({ path: '/fake/sandbox/render.sb', sha256: FAKE_PROFILE_SHA256 }),
    sandboxExecExists: () => true,
    verifyChromeBinary: () => Promise.resolve(),
    resolveExecutable,
    ...overrides,
  };
}
