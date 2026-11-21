import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { type z } from 'zod';
import { writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import {
  HyperframesChromeFileSchema,
  HyperframesEngineFileSchema,
  HyperframesTraceFileSchema,
  type HyperframesChromeFile,
  type HyperframesEngineFile,
  type HyperframesTraceFile,
} from '../engine-files';
import { type HyperframesEngineFiles, type HyperframesFileRead } from '../engine-state';
import { HyperframesPathError, hyperframesPaths, isPathInsideFolder } from '../paths';

/*
 * Node-only read and write helpers of `<data home>/hyperframes/` (SPEC 0008 section 4.5). Folders
 * are `0700`, files `0600`. Readers never follow a link and never return a file that failed its
 * schema as present. Writers (the CLI only) use the C5 atomic tmp + rename helper.
 */

const FOLDER_MODE = 0o700;
const MAX_JSON_BYTES = 65_536;

async function readSmallRegularFile(filePath: string): Promise<{ status: 'absent' } | { status: 'invalid' } | { status: 'present'; text: string }> {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { status: 'absent' };
    return { status: 'invalid' };
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_JSON_BYTES) return { status: 'invalid' };
    return { status: 'present', text: await handle.readFile({ encoding: 'utf8' }) };
  } catch {
    // An unreadable file is reported as invalid, never as present (AC 70).
    return { status: 'invalid' };
  } finally {
    await handle.close();
  }
}

async function readHyperframesJson<T>(filePath: string, schema: z.ZodType<T, unknown>): Promise<HyperframesFileRead<T>> {
  const read = await readSmallRegularFile(filePath);
  if (read.status !== 'present') return read;
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return { status: 'invalid' };
  }
  const checked = schema.safeParse(parsed);
  return checked.success ? { status: 'present', value: checked.data } : { status: 'invalid' };
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    // Missing or unreadable both mean "not usable"; the engine state then refuses.
    return false;
  }
}

export async function readEngineFile(dataHomeRoot: string): Promise<HyperframesFileRead<HyperframesEngineFile>> {
  return readHyperframesJson(hyperframesPaths(dataHomeRoot).engineFile, HyperframesEngineFileSchema);
}

export async function readChromeFile(dataHomeRoot: string): Promise<HyperframesFileRead<HyperframesChromeFile>> {
  return readHyperframesJson(hyperframesPaths(dataHomeRoot).chromeFile, HyperframesChromeFileSchema);
}

export async function readTraceFile(dataHomeRoot: string): Promise<HyperframesFileRead<HyperframesTraceFile>> {
  return readHyperframesJson(hyperframesPaths(dataHomeRoot).traceFile, HyperframesTraceFileSchema);
}

/**
 * Everything `engineState` needs. An absent `hyperframes/` folder reads as every file absent, so
 * the state is `engine-disabled`. A Chrome path outside `cache/` counts as a missing binary.
 */
export async function readHyperframesEngineFiles(dataHomeRoot: string): Promise<HyperframesEngineFiles> {
  const paths = hyperframesPaths(dataHomeRoot);
  const [engine, chrome, trace, configSeeded] = await Promise.all([
    readEngineFile(dataHomeRoot),
    readChromeFile(dataHomeRoot),
    readTraceFile(dataHomeRoot),
    isRegularFile(paths.configFile),
  ]);
  const chromeBinaryPresent =
    chrome.status === 'present' &&
    isPathInsideFolder(paths.cacheDir, chrome.value.executablePath) &&
    (await isRegularFile(chrome.value.executablePath));
  return { engine, chrome, chromeBinaryPresent, configSeeded, trace };
}

async function ensureFolder(folder: string): Promise<void> {
  try {
    await mkdir(folder, { recursive: true, mode: FOLDER_MODE });
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw new RunFileWriteError(folder, { cause: error });
  }
  const stats = await lstat(folder);
  if (!stats.isDirectory()) throw new HyperframesPathError('not a directory');
}

/** Creates `hyperframes/` with `config/`, `cache/` and `home/`, all `0700` (CLI only, B6). */
export async function ensureHyperframesFolders(dataHomeRoot: string): Promise<void> {
  const paths = hyperframesPaths(dataHomeRoot);
  await ensureFolder(paths.root);
  await Promise.all([ensureFolder(paths.configDir), ensureFolder(paths.cacheDir), ensureFolder(paths.homeDir)]);
}

/** `studio hyperframes enable` / `disable`. Only the CLI calls it (section 5.6). */
export async function writeEngineFile(dataHomeRoot: string, file: HyperframesEngineFile): Promise<void> {
  const paths = hyperframesPaths(dataHomeRoot);
  await ensureFolder(paths.root);
  await writeJsonAtomic(paths.engineFile, HyperframesEngineFileSchema, file);
}

/** `studio hyperframes chrome install`; refuses a binary outside `cache/`. */
export async function writeChromeFile(dataHomeRoot: string, file: HyperframesChromeFile): Promise<void> {
  const paths = hyperframesPaths(dataHomeRoot);
  if (!isPathInsideFolder(paths.cacheDir, file.executablePath)) {
    throw new HyperframesPathError('the Chrome binary must sit inside hyperframes/cache/');
  }
  await ensureFolder(paths.root);
  await writeJsonAtomic(paths.chromeFile, HyperframesChromeFileSchema, file);
}

/** `studio hyperframes trace`. */
export async function writeTraceFile(dataHomeRoot: string, file: HyperframesTraceFile): Promise<void> {
  const paths = hyperframesPaths(dataHomeRoot);
  await ensureFolder(paths.root);
  await writeJsonAtomic(paths.traceFile, HyperframesTraceFileSchema, file);
}
