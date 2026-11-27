import { type SetupFileSystem } from './setup-file-system';
import { type OptionalComponentId } from './setup-types';

/*
 * Setup's own small record in the data home. It is never read as "setup is done": every step still
 * asks the machine. It only keeps what the machine cannot tell: the user's refusal of an optional
 * download (DI-AC-04, so a refusal is not asked again at every launch), and which app version last
 * seeded the catalog, started the services and verified the payload (so an upgrade redoes them).
 * It holds no path, no passphrase and no key.
 */

export interface VerifiedPayload {
  readonly version: string;
  readonly builtAt: string;
}

export interface SetupRecord {
  readonly format: 1;
  readonly declined: readonly OptionalComponentId[];
  readonly seededVersion: string | null;
  readonly servicesVersion: string | null;
  readonly verifiedPayload: VerifiedPayload | null;
}

export const EMPTY_SETUP_RECORD: SetupRecord = { format: 1, declined: [], seededVersion: null, servicesVersion: null, verifiedPayload: null };

const MAX_RECORD_BYTES = 4096;
const RECORD_FILE_MODE = 0o600;
const MAX_VERSION_CHARS = 64;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isComponentId(value: unknown): value is OptionalComponentId {
  return value === 'search-model' || value === 'capture-browser';
}

function versionOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_VERSION_CHARS ? value : null;
}

function verifiedPayloadOf(value: unknown): VerifiedPayload | null {
  if (!isRecordObject(value)) return null;
  const version = versionOrNull(value['version']);
  const builtAt = versionOrNull(value['builtAt']);
  return version === null || builtAt === null ? null : { version, builtAt };
}

/** Lenient on purpose: a damaged record only means the steps it informs run again. */
export function parseSetupRecord(text: string): SetupRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY_SETUP_RECORD;
  }
  if (!isRecordObject(parsed) || parsed['format'] !== 1) return EMPTY_SETUP_RECORD;
  const declinedRaw = parsed['declined'];
  const declinedList: readonly unknown[] = Array.isArray(declinedRaw) ? declinedRaw : [];
  const declined = declinedList.filter(isComponentId);
  return {
    format: 1,
    declined: [...new Set(declined)],
    seededVersion: versionOrNull(parsed['seededVersion']),
    servicesVersion: versionOrNull(parsed['servicesVersion']),
    verifiedPayload: verifiedPayloadOf(parsed['verifiedPayload']),
  };
}

export type RecordChange = (current: SetupRecord) => SetupRecord;

export interface SetupRecordLocation {
  readonly dataHomeRoot: string;
  readonly file: string;
}

/**
 * Read, change, write. Step 1 runs before the data home exists (step 2 creates it, and setup never
 * creates it anywhere else), so a change made then is held in memory and written by `flush`, which
 * the data-folders step calls once the folder exists. Without that, a first run would verify the
 * payload but a second run could not report it as already done (DI-AC-02).
 */
export class SetupRecordStore {
  private pending: RecordChange[] = [];

  constructor(
    private readonly files: SetupFileSystem,
    private readonly location: SetupRecordLocation,
  ) {}

  async read(): Promise<SetupRecord> {
    const read = await this.files.readText(this.location.file, MAX_RECORD_BYTES);
    const stored = read.status === 'read' ? parseSetupRecord(read.text) : EMPTY_SETUP_RECORD;
    return this.pending.reduce((record, change) => change(record), stored);
  }

  async update(change: RecordChange): Promise<void> {
    this.pending.push(change);
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const root = await this.files.inspect(this.location.dataHomeRoot);
    if (root.kind !== 'folder') return;
    const next = await this.read();
    await this.files.writeTextAtomic(this.location.file, `${JSON.stringify(next, null, 2)}\n`, RECORD_FILE_MODE);
    this.pending = [];
  }
}
