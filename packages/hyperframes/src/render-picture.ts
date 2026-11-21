import { HyperframesProcessFailedError, HyperframesSandboxUnavailableError } from './errors';
import { type HyperframesProcessPort } from './process-port';
import { buildRenderArgv, buildRenderEnv } from './render-command';
import { type HyperframesRuntime } from './runtime';
import { sandboxExecExists } from './sandbox-profile';

export interface RenderPictureRequest {
  /** The private staged copy of the template folder; it is the process's cwd. */
  templateDir: string;
  variablesFile: string;
  output: string;
  runtime: HyperframesRuntime;
}

export interface RenderPicturePorts {
  process: HyperframesProcessPort;
  /** Defaults to checking `/usr/bin/sandbox-exec`; tests answer it without touching the disk. */
  sandboxExecExists?: () => boolean;
}

/**
 * One sandboxed render of the picture (SPEC 0008 section 5.2, tool-runner step 2). It never runs
 * `browser ensure` and never downloads: a missing Chrome fails inside the CLI, and the caller has
 * already refused unless `engineState` is `ready`. Without the sandbox nothing starts.
 */
export async function renderPicture(request: RenderPictureRequest, ports: RenderPicturePorts): Promise<{ renderSeconds: number }> {
  const sandboxAvailable = ports.sandboxExecExists ?? sandboxExecExists;
  if (!sandboxAvailable()) throw new HyperframesSandboxUnavailableError();
  const { command, args } = buildRenderArgv({
    templateDir: request.templateDir,
    variablesFile: request.variablesFile,
    output: request.output,
    runtime: request.runtime,
  });
  const startedAt = performance.now();
  const { exitCode } = await ports.process.run({ command, args, cwd: request.templateDir, env: buildRenderEnv(request.runtime) });
  if (exitCode !== 0) throw new HyperframesProcessFailedError('render-failed', exitCode);
  return { renderSeconds: Math.round(performance.now() - startedAt) / 1000 };
}
