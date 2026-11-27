import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { ASSET_JOBS_FOLDER_NAME } from '@studio/shared/asset-jobs';
import { AbsolutePathSchema, EmbeddingModelManifestSchema } from '@studio/shared/catalog';
import { CURATIONS_FOLDER_NAME } from '@studio/shared/curation';
import { PLATFORM_FOLDER_NAME } from '@studio/shared/platforms';
import { SCHEDULES_FOLDER_NAME } from '@studio/shared/schedules';

/**
 * The one environment variable that moves the data home, for tests and development only. The
 * installed studio leaves it unset and uses the macOS location of D5.
 */
export const DATA_HOME_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_HOME';

/** D5: `~/Library/Application Support/VideoStudio/`, relative to the user's home folder. */
export const DEFAULT_DATA_HOME_SEGMENTS: readonly string[] = ['Library', 'Application Support', 'VideoStudio'];

/** SQLite file name inside `db/`; `*.sqlite` is git-ignored at the repository root. */
export const DATABASE_FILE_NAME = 'studio.sqlite';

/** Owner-only: the data home holds catalog rows that point at biometric material (PRD 12). */
export const DATA_HOME_DIRECTORY_MODE = 0o700;

export class InvalidDataHomeError extends Error {
  readonly category = 'validation';

  constructor(readonly reason: 'not-absolute' | 'not-normalized' | 'contains-nul') {
    super(`Invalid data home (${DATA_HOME_ENV_VAR}): ${reason}`);
    this.name = 'InvalidDataHomeError';
  }
}

export class InvalidModelRefError extends Error {
  readonly category = 'validation';

  constructor() {
    super('Invalid embedding modelRef: expected <model id>@<revision> as one path segment');
    this.name = 'InvalidModelRefError';
  }
}

/**
 * Resolved data-home folders (D5, ADR 0003). A class so Nest can inject it by type; it holds
 * absolute paths only, never a secret. `models` is the fifth folder (SPEC 0003 B6, L7;
 * docs/RUN-FORMAT.md section 22): written only by the installer and `studio models fetch`, read by
 * the api and the CLI, never by the watcher. `curations` (SPEC 0005 section 4.6, docs/RUN-FORMAT.md
 * section 23): the api creates each `curations/<id>/` folder once; the watcher writes inside it
 * after its claim. `schedules` (SPEC 0006 section 4.6, docs/RUN-FORMAT.md section 24): the api or
 * CLI writes `schedule.json`; the watcher writes `cursor.json` and `slots.jsonl` beside it.
 * `platform` (SPEC 0007 section 4.6, docs/RUN-FORMAT.md section 26): connected accounts, gates,
 * publish requests, the poll cursor and the metrics inbox; the api or CLI and the watcher each
 * write their own files inside it, through `@studio/shared/platforms/files`. `assetJobs`
 * (docs/specs/2026-11-23-guided-creation-design.md): the api writes each `job.json` `requested`;
 * the watcher writes every later state and the voice sample clips, through
 * `@studio/shared/asset-jobs/files`.
 */
export class DataHome {
  readonly db: string;
  readonly assets: string;
  readonly runs: string;
  readonly logs: string;
  readonly models: string;
  readonly curations: string;
  readonly schedules: string;
  readonly platform: string;
  readonly assetJobs: string;
  readonly embeddingModels: string;
  readonly databaseFile: string;

  constructor(readonly root: string) {
    this.db = join(root, 'db');
    this.assets = join(root, 'assets');
    this.runs = join(root, 'runs');
    this.logs = join(root, 'logs');
    this.models = join(root, 'models');
    this.curations = join(root, CURATIONS_FOLDER_NAME);
    this.schedules = join(root, SCHEDULES_FOLDER_NAME);
    this.platform = join(root, PLATFORM_FOLDER_NAME);
    this.assetJobs = join(root, ASSET_JOBS_FOLDER_NAME);
    this.embeddingModels = join(this.models, 'embeddings');
    this.databaseFile = join(this.db, DATABASE_FILE_NAME);
  }

  /**
   * `<data home>/models/embeddings/<modelRef>/`. The ref is re-validated against the manifest
   * pattern so it is always one path segment and can never point outside `embeddings/`.
   */
  embeddingModelDirectory(modelRef: string): string {
    if (!EmbeddingModelManifestSchema.shape.modelRef.safeParse(modelRef).success) throw new InvalidModelRefError();
    return join(this.embeddingModels, modelRef);
  }
}

function assertUsableRoot(root: string): void {
  if (root.includes('\u0000')) throw new InvalidDataHomeError('contains-nul');
  if (!isAbsolute(root)) throw new InvalidDataHomeError('not-absolute');
  const hasTrailingSlash = root.length > 1 && root.endsWith('/');
  if (normalize(root) !== root || hasTrailingSlash || !AbsolutePathSchema.safeParse(root).success) {
    throw new InvalidDataHomeError('not-normalized');
  }
}

export interface DataHomeSource {
  homeDirectory: string;
  /** Value of `ENGINEOS_VIDEO_CREATOR_HOME`; undefined or empty means the default location. */
  override: string | undefined;
}

export function resolveDataHome(source: DataHomeSource): DataHome {
  const override = source.override?.trim();
  const root = override !== undefined && override !== '' ? override : join(source.homeDirectory, ...DEFAULT_DATA_HOME_SEGMENTS);
  assertUsableRoot(root);
  return new DataHome(root);
}

/**
 * Creates the four D5 data folders, `curations/`, `schedules/`, `platform/` and `asset-jobs/` if
 * absent (idempotent); never touches existing content. `curations/` (SPEC 0005 B13, L5), `schedules/`
 * (SPEC 0006 section 4.6), `platform/` (SPEC 0007 section 4.6) and `asset-jobs/` (guided-creation
 * design) are created here because two
 * processes write inside each at run time, the api and the watcher. All are `0700`. It
 * deliberately does not create `models/`: its only writers are the installer and `studio models
 * fetch` (docs/RUN-FORMAT.md section 22), and every process, the watcher included, runs this at
 * start.
 */
export async function ensureDataHomeDirectories(dataHome: DataHome): Promise<void> {
  const directories = [dataHome.db, dataHome.assets, dataHome.runs, dataHome.logs, dataHome.curations, dataHome.schedules, dataHome.platform, dataHome.assetJobs];
  for (const directory of directories) {
    await mkdir(directory, { recursive: true, mode: DATA_HOME_DIRECTORY_MODE });
  }
}
