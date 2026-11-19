import { join } from 'node:path';
import { canonicalJson } from '@studio/shared/recipes';
import { KEYCHAIN_ACCOUNTS, KEYCHAIN_SERVICE, SECRET_ENVIRONMENT_VARIABLES } from '../secrets';
import { SeedEntryInvalidError } from './seed.errors';
import { type SeedAssetPlan, type SeedAssetUnit, seedProvenance, truncateText } from './seed-asset-plan';
import { parseSkillFrontMatter, readSeedJson, readSeedText } from './seed-files';
import {
  type BrandKitSeedEntry,
  type MusicSeedEntry,
  type ProviderVoiceSeedEntry,
  type SeedEntry,
  type SeedManifest,
  type SkillSetSeedEntry,
  type TemplateSeedEntry,
  type VoiceReferenceSeedEntry,
} from './seed-manifest.schema';
import { resolveSeedPath } from './seed-source';

/** C1 limits the seed fits derived text into. */
const MAX_NAME_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 200;
const MAX_SKILL_DESCRIPTION_LENGTH = 1000;
const MAX_LICENSE_TERMS_LENGTH = 4000;

interface PlanContext {
  root: string;
  owner: string;
}

async function planTemplate(entry: TemplateSeedEntry, context: PlanContext): Promise<SeedAssetPlan> {
  const inputSchema = await readSeedJson(resolveSeedPath(context.root, entry.inputSchemaFile), entry.assetId);
  const sceneSchema =
    entry.sceneSchemaFile === null ? null : await readSeedJson(resolveSeedPath(context.root, entry.sceneSchemaFile), entry.assetId);
  return {
    assetId: entry.assetId,
    kind: 'template',
    metadata: {
      name: entry.name,
      summary: entry.summary,
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, context.owner),
      sensitivity: 'normal',
      notes: entry.notes,
      details: { ...entry.details, inputSchema, sceneSchema },
    },
    content: { source: 'import-folder', absolutePath: resolveSeedPath(context.root, entry.sourceFolder) },
  };
}

function planBrandKit(entry: BrandKitSeedEntry, context: PlanContext): SeedAssetPlan {
  return {
    assetId: entry.assetId,
    kind: 'brand-kit',
    metadata: {
      name: entry.name,
      summary: entry.summary,
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, context.owner),
      sensitivity: 'normal',
      notes: entry.notes,
      details: entry.details,
    },
    // Canonical JSON so an unchanged palette always hashes the same (idempotent re-seed).
    content: { source: 'inline', text: canonicalJson(entry.details), mimeType: 'application/json' },
  };
}

async function planSkill(entry: SkillSetSeedEntry, skillId: string, context: PlanContext): Promise<SeedAssetPlan> {
  const folder = resolveSeedPath(context.root, `${entry.folder}/${skillId}`);
  const frontMatter = parseSkillFrontMatter(await readSeedText(join(folder, entry.entryFile), skillId), skillId);
  const description = truncateText(frontMatter.description, MAX_SKILL_DESCRIPTION_LENGTH);
  return {
    assetId: skillId,
    kind: 'skill',
    metadata: {
      name: truncateText(frontMatter.name, MAX_NAME_LENGTH),
      summary: truncateText(frontMatter.description, MAX_SUMMARY_LENGTH),
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, context.owner),
      sensitivity: 'normal',
      details: { entryFile: entry.entryFile, description },
    },
    content: { source: 'import-folder', absolutePath: folder },
  };
}

/** Names only: the credential's environment variable and Keychain item, never a value (PRD 12). */
function planProviderVoice(entry: ProviderVoiceSeedEntry, context: PlanContext): SeedAssetPlan {
  const config = {
    provider: entry.provider,
    credential: {
      secretName: entry.credential,
      environmentVariable: SECRET_ENVIRONMENT_VARIABLES[entry.credential],
      keychain: { service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNTS[entry.credential] },
    },
    voiceId: { type: 'env', name: entry.voiceIdVariable },
    modelId: { type: 'env', name: entry.modelIdVariable, defaultValue: entry.defaultModelId },
  };
  return {
    assetId: entry.assetId,
    kind: 'ai-model',
    metadata: {
      name: entry.name,
      summary: entry.summary,
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, context.owner),
      sensitivity: 'normal',
      notes: entry.notes,
      details: { modelType: 'provider-model', provider: entry.provider, modelIdRef: { type: 'env', name: entry.voiceIdVariable } },
    },
    content: { source: 'inline', text: canonicalJson(config), mimeType: 'application/json' },
  };
}

/**
 * Criterion 22: the voice sample is registered by reference. The plan holds the path string only;
 * the catalog's reference registration hashes the target when the seed runs, and no byte is
 * copied into the store.
 */
function planVoiceReference(entry: VoiceReferenceSeedEntry, context: PlanContext): SeedAssetPlan {
  return {
    assetId: entry.assetId,
    kind: 'ai-model',
    metadata: {
      name: entry.name,
      summary: entry.summary,
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, context.owner),
      sensitivity: 'biometric',
      notes: entry.notes,
      details: { modelType: 'voice-clone', provider: 'local-voice', modelIdRef: { type: 'literal', value: entry.assetId } },
    },
    content: { source: 'reference-file', absolutePath: resolveSeedPath(context.root, entry.referenceFile), mimeType: entry.mimeType },
  };
}

/** The license terms start with the credit line exactly as `CREDITS.txt` states it. */
async function planMusic(entry: MusicSeedEntry, context: PlanContext): Promise<SeedAssetPlan> {
  const credits = await readSeedText(resolveSeedPath(context.root, entry.credits.file), entry.assetId);
  const creditLine = credits.split(/\r?\n/).find((line) => line.includes(entry.credits.lineIncludes));
  if (creditLine === undefined) {
    throw new SeedEntryInvalidError(entry.assetId, [{ path: 'credits', message: 'no credit line matches lineIncludes' }]);
  }
  const terms = [creditLine.trim(), entry.termsNote.trim()].filter((part) => part !== '').join('\n');
  if (terms.length > MAX_LICENSE_TERMS_LENGTH) {
    throw new SeedEntryInvalidError(entry.assetId, [{ path: 'license.terms', message: 'credit line and note exceed 4000 characters' }]);
  }
  return {
    assetId: entry.assetId,
    kind: 'music',
    metadata: {
      name: entry.name,
      summary: entry.summary,
      tags: entry.tags,
      owner: context.owner,
      provenance: seedProvenance(entry.origin, entry.author),
      license: { ...entry.license, terms },
      sensitivity: 'third-party',
      notes: entry.notes,
      details: entry.details,
    },
    content: { source: 'import-file', absolutePath: resolveSeedPath(context.root, entry.sourceFile), mimeType: entry.mimeType },
  };
}

function unitsOf(entry: SeedEntry, context: PlanContext): SeedAssetUnit[] {
  switch (entry.type) {
    case 'template':
      return [{ entryId: entry.assetId, plan: () => planTemplate(entry, context) }];
    case 'brand-kit':
      return [{ entryId: entry.assetId, plan: async () => planBrandKit(entry, context) }];
    case 'skill-set':
      return entry.skillIds.map((skillId) => ({ entryId: skillId, plan: () => planSkill(entry, skillId, context) }));
    case 'provider-voice':
      return [{ entryId: entry.assetId, plan: async () => planProviderVoice(entry, context) }];
    case 'voice-reference':
      return [{ entryId: entry.assetId, plan: async () => planVoiceReference(entry, context) }];
    case 'music':
      return [{ entryId: entry.assetId, plan: () => planMusic(entry, context) }];
  }
}

/** One unit per seeded asset, in manifest order; a skill set expands to one unit per skill. */
export function seedAssetUnits(manifest: SeedManifest, root: string): SeedAssetUnit[] {
  const context: PlanContext = { root, owner: manifest.owner };
  return manifest.entries.flatMap((entry) => unitsOf(entry, context));
}
