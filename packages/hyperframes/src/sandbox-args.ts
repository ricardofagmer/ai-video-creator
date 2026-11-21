import { isAbsolute } from 'node:path';
import { HyperframesSandboxUnavailableError } from './errors';
import { type HyperframesRuntime } from './runtime';

/*
 * The `-f <profile> -D NAME=value …` arguments of `sandbox-exec` (SPEC 0008 section 17.5, K15,
 * K16, AC 87). Pure: built only from the request, never from the disk or `process.env`. The trace
 * controls reuse exactly these arguments (section 17.9), so the order below is frozen.
 */

export interface SandboxArgsRequest {
  /** The private staged copy of the template folder (`TEMPLATE_DIR`). */
  templateDir: string;
  runtime: HyperframesRuntime;
}

interface SandboxParameter<Value> {
  name: string;
  value: (request: SandboxArgsRequest) => Value;
}

/*
 * The seventeen parameters of `render.sb`, in the frozen order of section 17.5: the fifteen path
 * parameters first, then the two ports.
 */
const PATH_PARAMETERS: readonly SandboxParameter<string>[] = [
  { name: 'OWNER_HYPERFRAMES_DIR', value: ({ runtime }) => runtime.ownerConfigDir },
  { name: 'OWNER_HOME', value: ({ runtime }) => runtime.ownerHomeDir },
  { name: 'STUDIO_ROOT', value: ({ runtime }) => runtime.studioRoot },
  { name: 'DATA_HOME', value: ({ runtime }) => runtime.dataHomeRoot },
  { name: 'HF_ROOT', value: ({ runtime }) => runtime.hyperframesRoot },
  { name: 'HF_CONFIG_DIR', value: ({ runtime }) => runtime.configDir },
  { name: 'HF_CACHE_DIR', value: ({ runtime }) => runtime.cacheDir },
  { name: 'HF_HOME_DIR', value: ({ runtime }) => runtime.homeDir },
  { name: 'CHROME_DIR', value: ({ runtime }) => runtime.chromeDir },
  { name: 'SCRATCH_DIR', value: ({ runtime }) => runtime.tmpDir },
  { name: 'TEMPLATE_DIR', value: ({ templateDir }) => templateDir },
  { name: 'NODE_BIN', value: ({ runtime }) => runtime.nodePath },
  { name: 'CHROME_BIN', value: ({ runtime }) => runtime.browserPath },
  { name: 'FFMPEG_BIN', value: ({ runtime }) => runtime.ffmpegBin },
  { name: 'FFPROBE_BIN', value: ({ runtime }) => runtime.ffprobeBin },
];

const PORT_PARAMETERS: readonly SandboxParameter<number>[] = [
  { name: 'STUDIO_API_PORT', value: ({ runtime }) => runtime.apiPort },
  { name: 'STUDIO_WEB_PORT', value: ({ runtime }) => runtime.webPort },
];

const MIN_PORT = 1024;
const MAX_PORT = 65535;
/** A NUL would cut the value short; a line break could not be one profile token. */
const FORBIDDEN_CHARACTERS = /[\0\r\n]/;

/**
 * An absolute path with no NUL and no line break; anything else refuses before a start. A relative
 * path would resolve against the child's cwd, so the profile would guard the wrong folder.
 */
function checkedPath(value: string): string {
  if (value.length === 0 || !isAbsolute(value) || FORBIDDEN_CHARACTERS.test(value)) {
    throw new HyperframesSandboxUnavailableError();
  }
  return value;
}

function checkedPort(value: number): string {
  if (!Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new HyperframesSandboxUnavailableError();
  }
  return String(value);
}

/**
 * `-f <sandboxProfilePath>` and the seventeen `-D NAME=value` pairs. Each `NAME=value` is one
 * argument, never split, so a value with spaces stays whole. Throws
 * `HyperframesSandboxUnavailableError` for a relative path, a NUL or a line break in a value, or a
 * port outside 1024 to 65535.
 */
export function buildSandboxArgs(request: SandboxArgsRequest): readonly string[] {
  const args: string[] = ['-f', checkedPath(request.runtime.sandboxProfilePath)];
  for (const parameter of PATH_PARAMETERS) {
    args.push('-D', `${parameter.name}=${checkedPath(parameter.value(request))}`);
  }
  for (const parameter of PORT_PARAMETERS) {
    args.push('-D', `${parameter.name}=${checkedPort(parameter.value(request))}`);
  }
  return Object.freeze(args);
}
