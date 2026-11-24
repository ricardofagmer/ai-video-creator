import 'reflect-metadata';
import assert from 'node:assert/strict';
import { realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import { readApprovalFile, readRunFile, runDirectory, writeApprovalFile, writeRunFile } from '@studio/shared/run-files';
import { latestDecision } from '@studio/shared/run-format';
import { parseAssetId, parseAssetKind, parseMetadata } from '../catalog/asset-version.factory';
import { readAllFiles } from '../platforms/platform-harness.harness.test';
import { buildDraftRecipe, parseRecipeId } from '../recipes/recipe-version.factory';
import { KeychainReader, type KeychainLookup } from '../secrets/keychain';
import { SecretsService } from '../secrets/secrets.service';
import { COVERAGE_SENTINEL_KEY, InvalidCoveragePrefixError, createCoverageHome, fixtures, type CoverageHome } from './index';

/*
 * Ticket 01 acceptance criteria 1 and 4 (CR1, CR13): the coverage home lives under the realpath of
 * os.tmpdir(), its database lies inside it, `close()` removes it and restores the log capture, and
 * the sentinel credential never reaches a captured log line or a file. The fixture builders produce
 * input the real validators and run-file writers accept.
 */

const START = new Date('2026-11-21T12:00:00.000Z');

/** Answers every Keychain read with the sentinel; no tool is ever run. */
class SentinelKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'found', value: COVERAGE_SENTINEL_KEY });
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('createCoverageHome (ticket 01 criterion 1)', () => {
  let home: CoverageHome;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'coverage-home', start: START });
  });

  afterEach(async () => {
    await home.close();
  });

  it('returns a realpath root under the realpath of os.tmpdir()', async () => {
    const temporaryRoot = await realpath(tmpdir());

    assert.ok(home.root.startsWith(`${temporaryRoot}${sep}`), 'root is outside the temp folder');
    assert.equal(await realpath(home.root), home.root);
  });

  it('places the data home and the database file inside the root', () => {
    assert.equal(home.dataHome.root, home.root);
    assert.ok(home.dataHome.databaseFile.startsWith(`${home.root}${sep}`), 'database outside the root');
  });

  it('connects to a migrated, empty database in the root', async () => {
    const assets = await home.prisma.asset.count();

    assert.equal(assets, 0);
    assert.equal(await pathExists(home.dataHome.databaseFile), true);
  });

  it('starts the clock at the given instant and lets the test move it', () => {
    home.clock.advance(1_000);

    assert.equal(home.clock.now().toISOString(), '2026-11-21T12:00:01.000Z');
  });

  it('gives every home its own root', async () => {
    const other = await createCoverageHome({ prefix: 'coverage-home', start: START });
    try {
      assert.notEqual(other.root, home.root);
    } finally {
      await other.close();
    }
  });
});

describe('CoverageHome.close (ticket 01 criterion 1)', () => {
  it('removes the root', async () => {
    const home = await createCoverageHome({ prefix: 'coverage-close', start: START });

    await home.close();

    assert.equal(await pathExists(home.root), false);
  });

  it('restores the Nest logger it replaced', async () => {
    const original = Logger.prototype.log;
    const home = await createCoverageHome({ prefix: 'coverage-close', start: START });
    const whileOpen = Logger.prototype.log;

    await home.close();

    assert.notEqual(whileOpen, original, 'the logger was not captured while the home was open');
    assert.equal(Logger.prototype.log, original);
  });

  it('can be called twice', async () => {
    const home = await createCoverageHome({ prefix: 'coverage-close', start: START });
    await home.close();

    await assert.doesNotReject(home.close());
  });
});

describe('createCoverageHome input', () => {
  it('refuses a prefix that holds a path segment', async () => {
    await assert.rejects(createCoverageHome({ prefix: '../escape', start: START }), InvalidCoveragePrefixError);
  });

  it('refuses an empty prefix', async () => {
    await assert.rejects(createCoverageHome({ prefix: '', start: START }), InvalidCoveragePrefixError);
  });
});

describe('sentinel credential (ticket 01 criterion 4)', () => {
  let home: CoverageHome;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'coverage-sentinel', start: START });
  });

  afterEach(async () => {
    await home.close();
  });

  it('exposes the fixed sentinel key', () => {
    assert.equal(home.sentinelKey, COVERAGE_SENTINEL_KEY);
  });

  it('keeps the sentinel key out of every captured log line and every file after a key lookup', async () => {
    const secrets = new SecretsService(new Map(), new SentinelKeychain());

    const lookup = await secrets.resolve('anthropic-api-key');
    new Logger('coverage-sentinel').log({ event: 'coverage.lookup', lookup });

    assert.equal(lookup.status, 'present');
    if (lookup.status !== 'present') return;
    assert.equal(lookup.secret.revealForProviderCall(), home.sentinelKey, 'the sentinel did not flow through the lookup');
    assert.match(home.logs.text(), /secrets\.loaded/, 'the log capture saw nothing');
    assert.equal(home.logs.text().includes(home.sentinelKey), false, 'the sentinel reached a log line');
    const leaking = (await readAllFiles(home.root)).filter((file) => file.text.includes(home.sentinelKey));
    assert.deepEqual(
      leaking.map((file) => file.path),
      [],
    );
  });
});

describe('fixtures', () => {
  let home: CoverageHome;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'coverage-fixtures', start: START });
  });

  afterEach(async () => {
    await home.close();
  });

  it('builds an asset the catalog validators accept', () => {
    const asset = fixtures.asset();

    const kind = parseAssetKind(asset.kind);
    assert.equal(parseAssetId(asset.assetId), asset.assetId);
    assert.equal(parseMetadata(asset.metadata, kind).sensitivity, 'normal');
  });

  it('applies asset overrides', () => {
    const asset = fixtures.asset({ assetId: 'chosen-prompt' });

    assert.equal(asset.assetId, 'chosen-prompt');
  });

  it('never repeats an asset id', () => {
    assert.notEqual(fixtures.asset().assetId, fixtures.asset().assetId);
  });

  it('builds a recipe draft the recipe factory accepts', () => {
    const recipe = fixtures.recipe();

    const draft = buildDraftRecipe({ recipeId: parseRecipeId(recipe.recipeId), version: 1, definition: recipe.definition, now: START });

    assert.equal(draft.id, recipe.recipeId);
    assert.equal(draft.status, 'draft');
  });

  it('builds a pending run the run-file writers accept', async () => {
    const fixture = fixtures.run();
    const runDir = runDirectory(home.dataHome.runs, fixture.run.runId);

    await writeRunFile(runDir, fixture.run);
    await writeApprovalFile(runDir, fixture.approval);

    const written = await readRunFile(runDir);
    assert.equal(written.runId, fixture.run.runId);
    assert.equal(written.state.status, 'pending');
    assert.equal(fixture.finalDecision, null);
  });

  it('gives every run its own id', () => {
    const first = fixtures.run();
    const second = fixtures.run();

    assert.notEqual(first.run.runId, second.run.runId);
    assert.equal(first.approval.runId, first.run.runId);
  });

  it('builds an approved run whose final decision carries the rating', async () => {
    const fixture = fixtures.reviewedRun(2);
    const runDir = runDirectory(home.dataHome.runs, fixture.run.runId);

    await writeRunFile(runDir, fixture.run);
    await writeApprovalFile(runDir, fixture.approval);

    const approval = await readApprovalFile(runDir);
    assert.equal(approval.status, 'present');
    if (approval.status !== 'present') return;
    const inForce = latestDecision(approval.value, 'final');
    assert.equal((await readRunFile(runDir)).state.status, 'approved');
    assert.equal(inForce?.kind === 'final' ? inForce.rating : null, 2);
    assert.deepEqual(fixture.finalDecision, inForce);
  });

  it('builds a learning note on a ref the fixture run binds', () => {
    const run = fixtures.run();

    const note = fixtures.learningNote('Narration paced well.');

    assert.equal(note.text, 'Narration paced well.');
    assert.ok(run.run.recipe.definition.bindings.some((binding) => binding.ref === note.ref), 'the note ref is not bound by the run');
  });
});
