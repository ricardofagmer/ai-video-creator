import { type z } from 'zod';
import { type SeedAssetPlan, type SeedAssetUnit } from './seed-asset-plan';
import { SeedEntryInvalidError } from './seed.errors';
import { readSeedJson } from './seed-files';
import { SeedPromptFileSchema, type SeedManifest } from './seed-manifest.schema';
import { resolveSeedPath } from './seed-source';

function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

async function planPrompt(manifest: SeedManifest, root: string, fileName: string): Promise<SeedAssetPlan> {
  const raw = await readSeedJson(resolveSeedPath(root, `${manifest.promptsFolder}/${fileName}`), fileName);
  const parsed = SeedPromptFileSchema.safeParse(raw);
  if (!parsed.success) throw new SeedEntryInvalidError(fileName, issuesOf(parsed.error));
  const prompt = parsed.data;
  return {
    assetId: prompt.assetId,
    kind: 'prompt',
    metadata: {
      name: prompt.name,
      summary: prompt.summary,
      tags: prompt.tags,
      owner: manifest.owner,
      provenance: prompt.provenance ?? { source: { type: 'created-here' }, author: manifest.owner, capturedAt: null },
      sensitivity: 'normal',
      notes: prompt.notes,
      details: { variables: prompt.variables },
    },
    content: {
      source: 'import-file',
      absolutePath: resolveSeedPath(root, `${manifest.promptsFolder}/${prompt.textFile}`),
      mimeType: prompt.mimeType,
    },
  };
}

/** One unit per `*.prompt.json` file; the entry id is the file name until the file is parsed. */
export function seedPromptUnits(manifest: SeedManifest, root: string, fileNames: readonly string[]): SeedAssetUnit[] {
  return fileNames.map((fileName) => ({ entryId: fileName, plan: () => planPrompt(manifest, root, fileName) }));
}
