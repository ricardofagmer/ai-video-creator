import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { type ComponentState } from '@studio/shared/api';
import { ApiConfig, type InstallEnvironment } from '../../platform/api-config';
import { PROBE_PROCESS_RUNNER, type ProbeProcessRunner } from './process-runner';

const TOOLS = ['ffmpeg', 'ffprobe'] as const;
type MediaTool = (typeof TOOLS)[number];

export interface ToolInvocation {
  command: string;
  environment: Readonly<Record<string, string>>;
}

/**
 * C3 rev 2: with the runtime folder set (packaged), the tool is `<runtime>/bin/<tool>` and nothing
 * else; unset (development), the bare name is resolved through `PATH`, as the toolbox does.
 */
export function toolInvocation(tool: MediaTool, install: InstallEnvironment): ToolInvocation {
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
  if (install.runtimeDirectory !== null) return { command: join(install.runtimeDirectory, 'bin', executable), environment: {} };
  return { command: executable, environment: install.executableSearchPath === null ? {} : { PATH: install.executableSearchPath } };
}

/**
 * `ffmpeg -version` and `ffprobe -version`: `ok` when both run, `missing` when either is not found,
 * `degraded` when either is found but fails. Required component.
 */
@Injectable()
export class FfmpegProbe {
  constructor(
    private readonly config: ApiConfig,
    @Inject(PROBE_PROCESS_RUNNER) private readonly runner: ProbeProcessRunner,
  ) {}

  async probe(): Promise<ComponentState> {
    const outcomes = await Promise.all(
      TOOLS.map((tool) => {
        const invocation = toolInvocation(tool, this.config.install);
        return this.runner.run(invocation.command, ['-version'], invocation.environment);
      }),
    );
    if (outcomes.some((outcome) => outcome.status === 'not-found')) return 'missing';
    if (outcomes.some((outcome) => outcome.status === 'failed')) return 'degraded';
    return 'ok';
  }
}
