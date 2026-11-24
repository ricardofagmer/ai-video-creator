import { parsePayloadManifest, verifyPayloadFiles, type PayloadManifest } from '../payload-manifest';
import { type SetupContext } from '../setup-context';
import { type SetupStep, type StepFailureReason } from '../setup-types';

/** A manifest listing every staged file of a 1 GB payload stays well under this. */
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;

type ManifestRead = { readonly kind: 'read'; readonly manifest: PayloadManifest } | { readonly kind: 'problem'; readonly reason: StepFailureReason };

async function readManifest(context: SetupContext): Promise<ManifestRead> {
  const read = await context.files.readText(context.paths.runtime.manifestFile, MAX_MANIFEST_BYTES);
  if (read.status === 'absent') return { kind: 'problem', reason: 'manifest-missing' };
  if (read.status === 'too-large') return { kind: 'problem', reason: 'manifest-invalid' };
  const parsed = parsePayloadManifest(read.text);
  if (parsed.status === 'invalid') return { kind: 'problem', reason: 'manifest-invalid' };
  // The payload must be the one this app was built with, or an upgrade left a mixed bundle.
  if (parsed.manifest.version !== context.appVersion) return { kind: 'problem', reason: 'payload-version-mismatch' };
  return { kind: 'read', manifest: parsed.manifest };
}

/**
 * Step 1: every payload file against `manifest.json`. A full re-hash runs once per manifest
 * (`version` + `builtAt`); later launches reuse that answer, since the bundle is read-only and its
 * signature covers it, so a launch does not re-read a gigabyte.
 */
export function verifyPayloadStep(context: SetupContext): SetupStep {
  return {
    id: 'verify-payload',
    required: true,
    async check() {
      const manifest = await readManifest(context);
      if (manifest.kind === 'problem') return { kind: 'needed' };
      const { verifiedPayload } = await context.record.read();
      const same = verifiedPayload?.version === manifest.manifest.version && verifiedPayload.builtAt === manifest.manifest.builtAt;
      return same ? { kind: 'done' } : { kind: 'needed' };
    },
    async run() {
      const manifest = await readManifest(context);
      if (manifest.kind === 'problem') return { kind: 'failed', reason: manifest.reason };
      const verification = await verifyPayloadFiles(manifest.manifest, context.paths.runtime.payloadRoot, (path) => context.files.sha256(path));
      if (verification.status === 'damaged') return { kind: 'failed', reason: 'payload-damaged' };
      const { version, builtAt } = manifest.manifest;
      await context.record.update((current) => ({ ...current, verifiedPayload: { version, builtAt } }));
      return { kind: 'done' };
    },
  };
}
