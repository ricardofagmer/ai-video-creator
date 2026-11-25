import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AssetVersion, type Sensitivity } from '@studio/shared/catalog';
import { RedactorService } from '../../redaction/redactor.service';
import { readEnvironmentSecrets } from '../../secrets/environment-secrets';
import { KeychainReader, type KeychainLookup } from '../../secrets/keychain';
import { SecretsService } from '../../secrets/secrets.service';
import { type AgentToolScope } from '../tooling/agent-tool-set';

/*
 * Test-only helpers for the agent tool tests (baseline review M2, M3, L2, L4). Everything lives in
 * a fresh temp folder: no data home, no real reference path, no Keychain (every key reads as
 * absent), no network, no model call. The `.harness.test.ts` name keeps the file out of the build;
 * it declares no test.
 */

/** Never runs `/usr/bin/security`: every provider key reads as absent. */
class AbsentKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'not-found' });
  }
}

/** The real redactor over absent keys and the given (temp) biometric reference paths. */
export function testRedactor(biometricPaths: readonly string[] = []): RedactorService {
  const secrets = new SecretsService(readEnvironmentSecrets({}), new AbsentKeychain());
  return new RedactorService(secrets, { listBiometricReferencePaths: async () => biometricPaths });
}

/** A redactor whose biometric registry cannot be read: every check must fail closed. */
export function failingRedactor(): RedactorService {
  const secrets = new SecretsService(readEnvironmentSecrets({}), new AbsentKeychain());
  return new RedactorService(secrets, {
    listBiometricReferencePaths: async () => {
      throw new Error('registry unavailable');
    },
  });
}

export interface TempRoot {
  readonly path: string;
  remove(): Promise<void>;
}

export async function tempRoot(prefix: string): Promise<TempRoot> {
  const path = await mkdtemp(join(tmpdir(), `${prefix}-`));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

export const TEST_RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const TEST_SESSION_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';

/** A director-call scope bound to `runDir`; the gate and trace are inert. */
export function testScope(runDir: string, overrides: Partial<Pick<AgentToolScope, 'runId' | 'signal'>> = {}): AgentToolScope {
  return {
    role: 'director',
    allowlist: ['FrameSampleTool'],
    runId: overrides.runId ?? TEST_RUN_ID,
    runDir,
    stageId: 'scenes',
    stepKey: 'scenes:execute:1',
    sessionId: TEST_SESSION_ID,
    packetRefs: [],
    recipeBindingRefs: [],
    signal: overrides.signal ?? new AbortController().signal,
    gate: { reserveToolCall: () => 1 },
    trace: { toolCall: async () => undefined, toolResult: async () => undefined },
  };
}

const FIXED_TIME = '2026-11-21T10:00:00.000Z';

function assetIdAndVersion(ref: string): { id: string; version: number } {
  const [id = '', version = '1'] = ref.split('@');
  return { id, version: Number.parseInt(version, 10) };
}

/** The fields every catalog version shares, filled with inert test values. */
function versionBase(options: { ref: string; contentHash: string; sizeBytes: number; sensitivity: Sensitivity }) {
  const { id, version } = assetIdAndVersion(options.ref);
  return {
    id,
    name: `Fixture ${id}`,
    summary: '',
    version,
    status: 'active' as const,
    tags: [],
    owner: 'owner',
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    contentHash: options.contentHash,
    sizeBytes: options.sizeBytes,
    provenance: null,
    license: null,
    sensitivity: options.sensitivity,
    usageCount: 0,
    qualityScore: null,
    qualitySampleSize: 0,
    qualityPlatformSampleSize: 0,
    qualityScoredAt: null,
    notes: '',
    purpose: '',
    purposeSource: 'none' as const,
  };
}

/** A stored music version; its bytes are never read by the tools under test. */
export function musicVersion(ref: string, sensitivity: Sensitivity): AssetVersion {
  return {
    ...versionBase({ ref, contentHash: 'a'.repeat(64), sizeBytes: 1, sensitivity }),
    mimeType: 'audio/mpeg',
    layout: 'file',
    storage: { mode: 'store' },
    kind: 'music',
    details: { durationMs: 1000, bpm: null, integratedLufs: null, categories: [] },
  };
}

/** A prompt version pinned to `contentHash`/`sizeBytes`, stored or kept by reference at `absolutePath`. */
export function promptVersion(options: { ref: string; contentHash: string; sizeBytes: number; absolutePath?: string }): AssetVersion {
  return {
    ...versionBase({ ...options, sensitivity: 'normal' }),
    mimeType: 'text/markdown',
    layout: 'file',
    storage: options.absolutePath === undefined ? { mode: 'store' } : { mode: 'reference', absolutePath: options.absolutePath },
    kind: 'prompt',
    details: { variables: [] },
  };
}

/** A skill folder version whose `contentHash` is its canonical manifest hash. */
export function skillVersion(options: { ref: string; contentHash: string; sizeBytes: number; entryFile: string; absolutePath?: string }): AssetVersion {
  return {
    ...versionBase({ ...options, sensitivity: 'normal' }),
    mimeType: 'application/vnd.studio.folder+json',
    layout: 'folder',
    storage: options.absolutePath === undefined ? { mode: 'store' } : { mode: 'reference', absolutePath: options.absolutePath },
    kind: 'skill',
    details: { entryFile: options.entryFile, description: '' },
  };
}
