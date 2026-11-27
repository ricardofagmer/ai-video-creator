import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceRoot, type RenderRuntimeRequest, type StartingProcess } from '@studio/hyperframes';
import { locateMediaTool, locateNodeBinary, locateSandboxStudioRoot, type MediaToolName, type StudioRuntime } from '@studio/core/runtime';
import { type CliSettings } from '../settings/cli-settings.js';

/*
 * What a HyperFrames process started by the CLI is given (SPEC 0008 sections 4.4, 4.5 and 17.5).
 * A render or the trace asks the render runtime gate of `@studio/hyperframes` with
 * `renderRuntimeRequest` and completes it with `startingProcess`; `chrome install` asks
 * `checkInstallRuntime` and completes it with the same `startingProcess`. PATH is the CLI's child
 * PATH (ffmpeg). Nothing else of the caller's environment is used.
 */

/** Used only if the child environment somehow lacks PATH; same order as the CLI's own fallback. */
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
/** Packaged fallback: system folders only, never Homebrew (DI-AC-03). */
const PACKAGED_FALLBACK_PATH = '/usr/bin:/bin';

/** Who the CLI records as the writer of the gate files. */
export const HYPERFRAMES_CLI_ACTOR = 'cli';

function childPath(settings: CliSettings): string {
  return settings.childEnvironment['PATH'] ?? (settings.runtime.mode === 'packaged' ? PACKAGED_FALLBACK_PATH : FALLBACK_PATH);
}

/** By absolute path, never resolved through PATH: the CLI's own node, or the bundled one when packaged. */
function nodePathOf(settings: CliSettings): string {
  return locateNodeBinary(settings.runtime, process.execPath);
}

/**
 * The CLI has no stage settings: in development ffmpeg and ffprobe are found by name on its child
 * PATH (B12); packaged mode passes the bundled binary's absolute path, which the gate takes as is,
 * so a program on the PATH can never stand in for it.
 */
function mediaToolOf(runtime: StudioRuntime, tool: MediaToolName): string {
  const location = locateMediaTool(runtime, tool);
  return location.source === 'bundled' ? location.path : location.name;
}

/** The gate request of a CLI start. The ports come from `CliSettings.ports`; the gate checks their range. */
export function renderRuntimeRequest(settings: CliSettings, purpose: RenderRuntimeRequest['purpose']): RenderRuntimeRequest {
  return {
    purpose,
    dataHomeRoot: settings.dataHome.root,
    ownerHome: settings.homeDirectory,
    searchPath: childPath(settings),
    ffmpeg: mediaToolOf(settings.runtime, 'ffmpeg'),
    ffprobe: mediaToolOf(settings.runtime, 'ffprobe'),
    studioPorts: settings.ports,
    // The monorepo root in development, the app's runtime folder when packaged.
    studioRoot: locateSandboxStudioRoot(settings.runtime, workspaceRoot()),
  };
}

/** What the CLI process adds to a checked runtime (render, trace or install) before it starts HyperFrames in `tmpDir`. */
export function startingProcess(settings: CliSettings, tmpDir: string): StartingProcess {
  return { nodePath: nodePathOf(settings), tmpDir, path: childPath(settings) };
}

/** A private scratch folder (`0700` from mkdtemp) removed after the work, whatever its outcome. */
export async function withScratchFolder<T>(prefix: string, work: (folder: string) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
