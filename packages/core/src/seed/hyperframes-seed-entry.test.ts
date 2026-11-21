import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ContentStore } from '../asset-store';
import { parseMetadata } from '../catalog/asset-version.factory';
import { HyperframesTemplateCheck, hyperframesDetailsOf } from '../catalog/hyperframes-template.check';
import { DataHome } from '../paths/data-home';
import { type SeedAssetPlan } from './seed-asset-plan';
import { seedAssetUnits } from './seed-entry-plans';
import { SeedManifestSchema } from './seed-manifest.schema';
import { SEED_MANIFEST_RELATIVE_PATH } from './seed-source';

/*
 * The HyperFrames seed entry goes through the same catalog checks as any new version (SPEC 0008
 * section 5.4, AC 76/77). Only the `title-card-hf-template` unit is planned, so only its own seed
 * files are read; the store used by the folder check is a fresh temporary folder.
 */

const WORKSPACE_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const HYPERFRAMES_SEED_ASSET_ID = 'title-card-hf-template';

describe('HyperFrames seed entry (AC 76)', () => {
  let dataHomeRoot: string;
  let check: HyperframesTemplateCheck;

  beforeEach(async () => {
    dataHomeRoot = await realpath(await mkdtemp(join(tmpdir(), 'studio-hyperframes-seed-')));
    check = new HyperframesTemplateCheck(new ContentStore(new DataHome(dataHomeRoot)));
  });

  afterEach(async () => {
    await rm(dataHomeRoot, { recursive: true, force: true });
  });

  async function planHyperframesEntry(): Promise<SeedAssetPlan> {
    const manifest = SeedManifestSchema.parse(JSON.parse(await readFile(join(WORKSPACE_ROOT, SEED_MANIFEST_RELATIVE_PATH), 'utf8')));
    const unit = seedAssetUnits(manifest, WORKSPACE_ROOT).find((candidate) => candidate.entryId === HYPERFRAMES_SEED_ASSET_ID);
    if (unit === undefined) assert.fail(`the seed manifest must hold ${HYPERFRAMES_SEED_ASSET_ID}`);
    return unit.plan();
  }

  it('plans the seed template as a HyperFrames template folder', async () => {
    const plan = await planHyperframesEntry();

    assert.equal(plan.kind, 'template');
    assert.equal(plan.content.source, 'import-folder');
  });

  it('passes the version metadata checks', async () => {
    const plan = await planHyperframesEntry();

    const metadata = parseMetadata(plan.metadata, plan.kind);

    assert.equal(hyperframesDetailsOf(plan.kind, metadata.details)?.engine, 'hyperframes');
  });

  it('passes the section 4.3 folder check', async () => {
    const plan = await planHyperframesEntry();
    const metadata = parseMetadata(plan.metadata, plan.kind);

    await check.assertNewContent(plan.kind, metadata.details, plan.content);
  });
});
