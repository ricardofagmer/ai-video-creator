import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { runDirectory, writeRunManifest } from '@studio/shared/run-files';
import { RunManifestSchema, type RunFile, type RunManifest } from '@studio/shared/run-format';
import { ContentStore, ReferenceInspector } from '../../asset-store';
import { CreateAssetCommand, GetAssetVersionQuery } from '../../catalog';
import { AssetContentService } from '../../catalog/asset-content';
import { AssetVersionRepository } from '../../catalog/asset-version.repository';
import { BiometricSourceGuard } from '../../catalog/biometric-source.guard';
import { CreateAssetHandler } from '../../catalog/commands/create-asset.handler';
import { HyperframesTemplateCheck } from '../../catalog/hyperframes-template.check';
import { GetAssetVersionHandler } from '../../catalog/queries/get-asset-version.handler';
import { PrismaBiometricReferenceSource } from '../../redaction/biometric-reference.source';
import { createCoverageHome, fixtures, type CoverageHome, type RunFixture } from '../../test-support';
import { OutcomeAssetNotFoundError, OutcomeEvidenceMissingError, RunOutcomeRecorder, type FinalGateDecision } from '..';
import { RunOutcomeRepository } from '../run-outcome.repository';

/*
 * Ticket 07 (outcomes): the real recorder and repository over the coverage temp home. The catalog
 * version a run used is created through the real catalog handler; run folders are written with the
 * C5 run-file writers, as the watcher's `package` stage writes them.
 */

interface OutcomesUnderTest {
  recorder: RunOutcomeRecorder;
  createAsset: CreateAssetHandler;
  getAsset: GetAssetVersionHandler;
}

function outcomesOf(home: CoverageHome): OutcomesUnderTest {
  const versions = new AssetVersionRepository(home.prisma);
  const store = new ContentStore(home.dataHome);
  const content = new AssetContentService(
    store,
    new ReferenceInspector(home.dataHome),
    new BiometricSourceGuard(new PrismaBiometricReferenceSource(home.prisma)),
  );
  return {
    recorder: new RunOutcomeRecorder(new RunOutcomeRepository(home.prisma)),
    createAsset: new CreateAssetHandler(home.prisma, versions, content, new HyperframesTemplateCheck(store)),
    getAsset: new GetAssetVersionHandler(versions),
  };
}

function refOf(version: AssetVersion): string {
  return formatAssetRef({ assetId: version.id, version: version.version });
}

/** manifest.json of `run`, pinning `assets` in the `prompt:writer` slot family. */
function manifestFor(run: RunFile, assets: readonly { ref: string; contentHash: string }[]): RunManifest {
  return RunManifestSchema.parse({
    format: 1,
    runId: run.runId,
    createdAt: run.createdAt,
    recipe: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
    assets: assets.map((pinned, index) => ({ slot: `prompt:writer-${index + 1}`, ref: pinned.ref, kind: 'prompt', contentHash: pinned.contentHash, sensitivity: 'normal' })),
    references: [],
    parameters: { brief: run.brief, stages: [] },
    models: [],
    outputs: [],
    egress: [],
  });
}

interface ReviewedFolder {
  runDir: string;
  run: RunFile;
  decision: FinalGateDecision;
}

function decidedOf(fixture: RunFixture): FinalGateDecision {
  const decision = fixture.finalDecision;
  assert.ok(decision !== null, 'reviewedRun always carries a final decision');
  return decision;
}

describe('outcomes (ticket 07)', () => {
  let home: CoverageHome;
  let outcomes: OutcomesUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-outcomes', start: new Date('2026-11-21T10:00:00.000Z') });
    outcomes = outcomesOf(home);
  });

  afterEach(async () => {
    await home.close();
  });

  async function reviewedFolder(assets: readonly { ref: string; contentHash: string }[]): Promise<ReviewedFolder> {
    const fixture = fixtures.reviewedRun(5);
    const runDir = runDirectory(home.dataHome.runs, fixture.run.runId);
    await writeRunManifest(runDir, manifestFor(fixture.run, assets));
    return { runDir, run: fixture.run, decision: decidedOf(fixture) };
  }

  describe('record', () => {
    it('writes the outcome row and counts each asset version used once', async () => {
      const used = await outcomes.createAsset.execute(new CreateAssetCommand(fixtures.asset()));
      const folder = await reviewedFolder([{ ref: refOf(used), contentHash: used.contentHash }]);

      const recorded = await outcomes.recorder.record(folder);
      const after = await outcomes.getAsset.execute(new GetAssetVersionQuery(refOf(used)));
      const row = await home.prisma.runOutcome.findUnique({ where: { runId: folder.run.runId } });

      assert.deepEqual(recorded, { outcome: 'created', assetVersionsCounted: 1 });
      assert.equal(after.usageCount, used.usageCount + 1);
      assert.equal(row?.decision, 'approved');
      assert.equal(row?.rating, 5);
    });

    it('answers existing on a repeat and does not count the asset version again', async () => {
      const used = await outcomes.createAsset.execute(new CreateAssetCommand(fixtures.asset()));
      const folder = await reviewedFolder([{ ref: refOf(used), contentHash: used.contentHash }]);
      await outcomes.recorder.record(folder);

      const repeated = await outcomes.recorder.record(folder);
      const after = await outcomes.getAsset.execute(new GetAssetVersionQuery(refOf(used)));

      assert.deepEqual(repeated, { outcome: 'existing', assetVersionsCounted: 0 });
      assert.equal(after.usageCount, used.usageCount + 1);
    });

    it('counts a version pinned in two slots only once', async () => {
      const used = await outcomes.createAsset.execute(new CreateAssetCommand(fixtures.asset()));
      const pin = { ref: refOf(used), contentHash: used.contentHash };
      const folder = await reviewedFolder([pin, pin]);

      const recorded = await outcomes.recorder.record(folder);

      assert.equal(recorded.assetVersionsCounted, 1);
    });
  });

  describe('typed errors', () => {
    it('refuses a reviewed run that has no manifest.json', async () => {
      const fixture = fixtures.reviewedRun(3);

      await assert.rejects(
        outcomes.recorder.record({ runDir: runDirectory(home.dataHome.runs, fixture.run.runId), run: fixture.run, decision: decidedOf(fixture) }),
        (error: unknown) => {
          assert.ok(error instanceof OutcomeEvidenceMissingError);
          assert.equal(error.file, 'manifest.json');
          return true;
        },
      );
    });

    it('refuses a manifest.json that names another run', async () => {
      const fixture = fixtures.reviewedRun(3);
      const other = fixtures.reviewedRun(3);
      const runDir = runDirectory(home.dataHome.runs, fixture.run.runId);
      await writeRunManifest(runDir, manifestFor(other.run, []));

      await assert.rejects(outcomes.recorder.record({ runDir, run: fixture.run, decision: decidedOf(fixture) }), OutcomeEvidenceMissingError);
    });

    it('refuses an asset version the catalog does not hold and writes no outcome row', async () => {
      const folder = await reviewedFolder([{ ref: 'coverage-missing@1', contentHash: 'b'.repeat(64) }]);

      await assert.rejects(outcomes.recorder.record(folder), (error: unknown) => {
        assert.ok(error instanceof OutcomeAssetNotFoundError);
        assert.equal(error.ref, 'coverage-missing@1');
        return true;
      });
      const row = await home.prisma.runOutcome.findUnique({ where: { runId: folder.run.runId } });
      assert.equal(row, null);
    });
  });
});
