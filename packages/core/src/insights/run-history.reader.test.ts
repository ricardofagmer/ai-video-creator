import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { newUlid, runDirectory } from '@studio/shared/run-files';
import { RunManifestSchema, type RunEvent, type RunManifest, type RunStatus } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { RunHistoryReader } from './run-history.reader';

const hash = 'a'.repeat(64);
const startMs = Date.parse('2026-11-10T10:00:00.000Z');

function statusEvent(runId: string, from: RunStatus | null, to: RunStatus, atMs: number): RunEvent {
  return { type: 'run.status', from, to, atMs, runId, level: 'info', text: `${from ?? '-'} -> ${to}`, stepKey: null, correlationId: null };
}

function manifest(runId: string): RunManifest {
  return RunManifestSchema.parse({
    format: 1,
    runId,
    createdAt: '2026-11-10T10:00:00.000Z',
    recipe: { ref: 'product-tour@1', contentHash: hash },
    assets: [
      { slot: 'template', ref: 'tour-template@2', kind: 'template', contentHash: hash, sensitivity: 'normal' },
      { slot: 'music', ref: 'calm-bed@1', kind: 'music', contentHash: hash, sensitivity: 'normal' },
    ],
    references: [{ ref: 'calm-bed@1', contentHash: hash }, { ref: 'logo@3', contentHash: hash }],
    parameters: {
      brief: { topic: 'Tour do produto', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 },
      stages: [],
    },
    models: [],
    outputs: [],
    egress: [],
  });
}

describe('RunHistoryReader', () => {
  let root: string;
  let reader: RunHistoryReader;
  let runId: string;
  let runDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'insights-run-history-'));
    const dataHome = new DataHome(root);
    reader = new RunHistoryReader(dataHome);
    runId = newUlid(startMs);
    runDir = runDirectory(dataHome.runs, runId);
    await mkdir(runDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeEvents(events: RunEvent[]): Promise<void> {
    await writeFile(join(runDir, 'events.jsonl'), events.map((event) => `${JSON.stringify(event)}\n`).join(''));
  }

  it('reads the first review instant of a run that never failed', async () => {
    await writeEvents([
      statusEvent(runId, null, 'draft', startMs),
      statusEvent(runId, 'draft', 'pending', startMs + 1000),
      statusEvent(runId, 'pending', 'running', startMs + 2000),
      statusEvent(runId, 'running', 'review', startMs + 60_000),
      statusEvent(runId, 'review', 'approved', startMs + 90_000),
    ]);

    assert.deepEqual(await reader.history(runId), { status: 'read', reviewAt: new Date(startMs + 60_000), leftFailed: false });
  });

  it('marks a run that left failed before review, and not one resumed after a pause or a crash', async () => {
    await writeEvents([
      statusEvent(runId, 'running', 'paused', startMs),
      statusEvent(runId, 'paused', 'running', startMs + 1000),
      statusEvent(runId, 'running', 'interrupted', startMs + 2000),
      statusEvent(runId, 'interrupted', 'running', startMs + 3000),
      statusEvent(runId, 'running', 'failed', startMs + 4000),
      statusEvent(runId, 'failed', 'running', startMs + 5000),
      statusEvent(runId, 'running', 'review', startMs + 6000),
    ]);

    assert.deepEqual(await reader.history(runId), { status: 'read', reviewAt: new Date(startMs + 6000), leftFailed: true });

    await writeEvents([statusEvent(runId, 'running', 'interrupted', startMs), statusEvent(runId, 'interrupted', 'review', startMs + 1000)]);
    assert.deepEqual(await reader.history(runId), { status: 'read', reviewAt: new Date(startMs + 1000), leftFailed: false });
  });

  it('answers unreadable for a missing log, a log with no review and a corrupt line', async () => {
    assert.deepEqual(await reader.history(runId), { status: 'unreadable' });

    await writeEvents([statusEvent(runId, 'pending', 'running', startMs)]);
    assert.deepEqual(await reader.history(runId), { status: 'unreadable' });

    await writeFile(join(runDir, 'events.jsonl'), '{"type":"run.status"}\n');
    assert.deepEqual(await reader.history(runId), { status: 'unreadable' });
  });

  it('lists the asset versions a manifest names, bindings and references, once each', async () => {
    await writeFile(join(runDir, 'manifest.json'), JSON.stringify(manifest(runId)));

    assert.deepEqual(await reader.assetVersions(runId), {
      status: 'read',
      versions: [
        { assetId: 'tour-template', version: 2 },
        { assetId: 'calm-bed', version: 1 },
        { assetId: 'logo', version: 3 },
      ],
    });
  });

  it('answers unreadable for a missing or invalid manifest', async () => {
    assert.deepEqual(await reader.assetVersions(runId), { status: 'unreadable' });

    await writeFile(join(runDir, 'manifest.json'), '{"format":1}');
    assert.deepEqual(await reader.assetVersions(runId), { status: 'unreadable' });
  });
});
