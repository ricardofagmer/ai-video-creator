import { AbsolutePathSchema } from '../common/ids';
import { HYPERFRAMES_CONFIG_FILE_NAME, HYPERFRAMES_FOLDER_NAME, hyperframesFileNames } from './constants';

/*
 * Every path under `<data home>/hyperframes/` (SPEC 0008 section 4.5), built with POSIX string
 * joins so the module stays browser-safe. The data home root is validated as an absolute path
 * without `.` or `..` segments first, so no result can leave `hyperframes/`.
 */

/** A data home root that is not an absolute path, or a path outside `hyperframes/`. */
export class HyperframesPathError extends Error {
  constructor(reason: string) {
    super(`Refused HyperFrames path (${reason})`);
    this.name = 'HyperframesPathError';
  }
}

export interface HyperframesPaths {
  /** `<data home>/hyperframes/` */
  root: string;
  engineFile: string;
  chromeFile: string;
  traceFile: string;
  configDir: string;
  configFile: string;
  cacheDir: string;
  homeDir: string;
}

export function hyperframesPaths(dataHomeRoot: string): HyperframesPaths {
  const checked = AbsolutePathSchema.safeParse(dataHomeRoot);
  if (!checked.success) throw new HyperframesPathError('data home root must be an absolute path');
  const base = checked.data.replace(/\/+$/, '');
  if (base.length === 0) throw new HyperframesPathError('data home root must not be the file system root');
  const root = `${base}/${HYPERFRAMES_FOLDER_NAME}`;
  const configDir = `${root}/${hyperframesFileNames.config}`;
  return {
    root,
    engineFile: `${root}/${hyperframesFileNames.engine}`,
    chromeFile: `${root}/${hyperframesFileNames.chrome}`,
    traceFile: `${root}/${hyperframesFileNames.trace}`,
    configDir,
    configFile: `${configDir}/${HYPERFRAMES_CONFIG_FILE_NAME}`,
    cacheDir: `${root}/${hyperframesFileNames.cache}`,
    homeDir: `${root}/${hyperframesFileNames.home}`,
  };
}

/**
 * True when `candidate` is an absolute path strictly inside `folder`, with no `.` or `..` segment
 * and no doubled slash. Used to keep `chrome.json.executablePath` under `cache/`.
 */
export function isPathInsideFolder(folder: string, candidate: string): boolean {
  const checked = AbsolutePathSchema.safeParse(candidate);
  if (!checked.success || candidate.includes('//')) return false;
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  return candidate.startsWith(prefix) && candidate.length > prefix.length;
}
