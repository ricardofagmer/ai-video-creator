import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it, mock } from 'node:test';
import { readCostFile, readRunFile, readRunManifest, resolveInsideRun } from '@studio/shared/run-files';
import { type CostFile, type RunFile, type RunManifest } from '@studio/shared/run-format';
import { captureLogs, startDaemonWorld, type DaemonRound, type DaemonWorld } from './daemon-world.harness.test';

/*
 * Ticket 03 acceptance criterion 4 (CR3): the v1 end-to-end eval of topology 0001 section 11
 * ("end-to-end" row, count 1). The input is the committed product-tour-16x9 fixture, whose recipe
 * and brief are the section 11 end-to-end input, with every provider mocked
 * (`WatcherModule.register({ ports: { kind: 'mock' } })` through `startMockEngine`). The run is
 * started the way the owner's runs are, by the daemon finding it `pending` in the runs root; it is
 * executed once, and each assertion of the row reads the run folder it left:
 * - the run reaches `review`;
 * - `manifest.json` pins every ref with its content hash;
 * - `cost.json` total equals the sum of sessions;
 * - spend is $0.
 */

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('v1 end-to-end eval, all providers mocked (topology 0001 section 11, ticket 03 criterion 4)', () => {
  let world: DaemonWorld | undefined;
  let round: DaemonRound;
  let run: RunFile;
  let manifest: RunManifest | null;
  let cost: CostFile | null;

  before(async () => {
    captureLogs();
    world = await startDaemonWorld();
    round = await world.runDaemon({ scans: 2 });
    run = await readRunFile(world.runDir);
    const manifestFile = await readRunManifest(world.runDir);
    manifest = manifestFile.status === 'present' ? manifestFile.value : null;
    const costFile = await readCostFile(world.runDir);
    cost = costFile.status === 'present' ? costFile.value : null;
  });

  after(async () => {
    try {
      await world?.close();
    } finally {
      world = undefined;
      mock.restoreAll();
    }
  });

  function runFolder(): string {
    if (world === undefined) return assert.fail('the daemon world did not start');
    return world.runDir;
  }

  function writtenManifest(): RunManifest {
    if (manifest === null) return assert.fail('the run reached its end without manifest.json');
    return manifest;
  }

  function writtenCost(): CostFile {
    if (cost === null) return assert.fail('the run reached its end without cost.json');
    return cost;
  }

  it('picks the pending run up once and the run reaches review', () => {
    const runDir = runFolder();

    assert.deepEqual(round.scans, [[{ runId: run.runId, runDir, trigger: 'pending' }], []]);
    assert.deepEqual(round.executions, [{ runDir, outcome: { status: 'returned', result: { runId: run.runId, status: 'review' } } }]);
    assert.equal(run.state.status, 'review');
  });

  it('pins every bound ref, the recipe and the run references in manifest.json with their content hashes', () => {
    const written = writtenManifest();

    assert.equal(written.runId, run.runId);
    assert.deepEqual(written.recipe, { ref: run.recipe.ref, contentHash: run.recipe.contentHash });
    assert.deepEqual(
      written.assets.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
      run.recipe.definition.bindings.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
    );
    assert.deepEqual(
      written.references.map(({ ref }) => ref),
      run.references,
    );
    for (const reference of written.references) assert.match(reference.contentHash, SHA256_PATTERN, `reference ${reference.ref} carries no content hash`);
  });

  it('lists each output in manifest.json with the hash of the bytes it names', async () => {
    const runDir = runFolder();
    const written = writtenManifest();

    assert.ok(written.outputs.length > 0, 'manifest.json lists no output');
    for (const output of written.outputs) {
      const bytes = await readFile(resolveInsideRun(runDir, output.path));
      assert.equal(sha256Hex(bytes), output.contentHash, `output ${output.name} (${output.path}) does not match its pinned hash`);
    }
  });

  it('records a cost.json whose total equals the sum of its sessions', () => {
    const ledger = writtenCost();

    assert.ok(ledger.sessions.length > 0, 'cost.json lists no session although the mocked agents ran');
    assert.equal(
      ledger.totalUsd,
      ledger.sessions.reduce((total, session) => total + session.usd, 0),
    );
  });

  it('spends $0', () => {
    const ledger = writtenCost();

    assert.equal(ledger.totalUsd, 0);
    assert.deepEqual(
      ledger.sessions.filter((session) => session.usd !== 0).map((session) => session.stepKey),
      [],
      'a mocked session was priced above $0',
    );
    assert.equal(run.totals.costUsd, 0);
    assert.deepEqual(run.totals.costByProvider, { claude: 0, tts: 0, render: 0, music: 0 });
  });
});
