import { readFile, readdir, stat } from 'node:fs/promises';
import { SeedEntryInvalidError, SeedSourceMissingError } from './seed.errors';
import { type OptionalSeedFolderState } from './seed-report';

/** Seed text files are small JSON and Markdown; anything larger is not a seed definition. */
const MAX_SEED_TEXT_BYTES = 1024 * 1024;

/** Far above the handful of recipes and prompts R1-15 authors; past it the folder is refused. */
const MAX_OPTIONAL_SEED_FILES = 200;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/** Reads a seed text file (UTF-8). A missing file fails the entry by name, never by path. */
export async function readSeedText(absolutePath: string, entryId: string): Promise<string> {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) throw new SeedEntryInvalidError(entryId, [{ path: 'file', message: 'not a regular file' }]);
    if (stats.size > MAX_SEED_TEXT_BYTES) {
      throw new SeedEntryInvalidError(entryId, [{ path: 'file', message: `larger than ${MAX_SEED_TEXT_BYTES} bytes` }]);
    }
    return await readFile(absolutePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) throw new SeedSourceMissingError(entryId);
    throw error;
  }
}

/** Reads and parses a seed JSON file; the caller validates the shape with its zod schema. */
export async function readSeedJson(absolutePath: string, entryId: string): Promise<unknown> {
  const text = await readSeedText(absolutePath, entryId);
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message can quote file content; report the fact only.
    throw new SeedEntryInvalidError(entryId, [{ path: 'file', message: 'not valid JSON' }]);
  }
}

export interface OptionalSeedFolder {
  state: OptionalSeedFolderState;
  /** File names (not paths) ending in the requested suffix, sorted. */
  fileNames: string[];
}

/** Lists an optional R1-15 folder. Absent and empty are normal states, not failures. */
export async function listOptionalSeedFolder(absolutePath: string, suffix: string): Promise<OptionalSeedFolder> {
  let names: string[];
  try {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFileError(error)) return { state: 'absent', fileNames: [] };
    throw error;
  }
  if (names.length > MAX_OPTIONAL_SEED_FILES) {
    throw new SeedEntryInvalidError(suffix, [{ path: 'folder', message: `more than ${MAX_OPTIONAL_SEED_FILES} files` }]);
  }
  names.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return { state: names.length === 0 ? 'empty' : 'loaded', fileNames: names };
}

export interface SkillFrontMatter {
  name: string;
  description: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'")) && trimmed.endsWith(trimmed.charAt(0));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Reads `name` and `description` from a SKILL.md front matter block. Only single-line values are
 * supported, which is the form every `fagmer-video-*` skill uses; anything else fails the entry
 * instead of guessing.
 */
export function parseSkillFrontMatter(text: string, entryId: string): SkillFrontMatter {
  const lines = text.split(/\r?\n/);
  const closing = lines.indexOf('---', 1);
  if (lines[0] !== '---' || closing === -1) {
    throw new SeedEntryInvalidError(entryId, [{ path: 'SKILL.md', message: 'missing front matter block' }]);
  }
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(':');
    if (separator > 0 && !line.startsWith(' ')) fields.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1)));
  }
  const name = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';
  if (name === '' || description === '') {
    throw new SeedEntryInvalidError(entryId, [{ path: 'SKILL.md', message: 'front matter needs single-line name and description' }]);
  }
  return { name, description };
}
