import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidMetricsInputError } from '../metrics.errors';
import { type RunPublicationRepository } from '../run-publication.repository';
import { CountRunPublicationsHandler } from './count-run-publications.handler';
import { CountRunPublicationsQuery } from './count-run-publications.query';

/*
 * `CountRunPublicationsHandler` (SPEC 0006 section 4.4 `publicationCount`, critic CR-7): one grouped
 * count per page, never one per run; every requested run answers, 0 when it has no publication.
 * The repository is a recording fake standing in for the `GROUP BY run_id` query. No Prisma.
 */

const RUN_A = '01JDA00000000000000000RN01';
const RUN_B = '01JDA00000000000000000RN02';
const RUN_C = '01JDA00000000000000000RN03';

class RecordingCounts implements Pick<RunPublicationRepository, 'countByRuns'> {
  readonly calls: string[][] = [];

  constructor(private readonly counts: Map<string, number>) {}

  async countByRuns(runIds: readonly string[]): Promise<Map<string, number>> {
    this.calls.push([...runIds]);
    return new Map([...this.counts].filter(([runId]) => runIds.includes(runId)));
  }
}

function runIdAt(index: number): string {
  return `01JDA00000000000000000${String(index).padStart(4, '0')}`;
}

describe('CountRunPublicationsHandler', () => {
  it('answers every requested run in one grouped call, 0 for a run without publications', async () => {
    const repository = new RecordingCounts(new Map([[RUN_A, 2], [RUN_C, 5]]));
    const counts = await new CountRunPublicationsHandler(repository).execute(new CountRunPublicationsQuery([RUN_A, RUN_B, RUN_C]));
    assert.deepEqual(counts, { [RUN_A]: 2, [RUN_B]: 0, [RUN_C]: 5 });
    assert.deepEqual(repository.calls, [[RUN_A, RUN_B, RUN_C]]);
  });

  it('asks once per distinct run when a page repeats an id', async () => {
    const repository = new RecordingCounts(new Map([[RUN_A, 1]]));
    const counts = await new CountRunPublicationsHandler(repository).execute(new CountRunPublicationsQuery([RUN_A, RUN_A]));
    assert.deepEqual(counts, { [RUN_A]: 1 });
    assert.deepEqual(repository.calls, [[RUN_A]]);
  });

  it('answers an empty page without a query', async () => {
    const repository = new RecordingCounts(new Map());
    assert.deepEqual(await new CountRunPublicationsHandler(repository).execute(new CountRunPublicationsQuery([])), {});
    assert.deepEqual(repository.calls, []);
  });

  it('refuses an id that is not a run id before any query', async () => {
    const repository = new RecordingCounts(new Map());
    await assert.rejects(
      new CountRunPublicationsHandler(repository).execute(new CountRunPublicationsQuery([RUN_A, 'not-a-run-id'])),
      InvalidMetricsInputError,
    );
    assert.deepEqual(repository.calls, []);
  });

  it('refuses more ids than one page holds', async () => {
    const repository = new RecordingCounts(new Map());
    const tooMany = Array.from({ length: 101 }, (_, index) => runIdAt(index));
    await assert.rejects(new CountRunPublicationsHandler(repository).execute(new CountRunPublicationsQuery(tooMany)), InvalidMetricsInputError);
    assert.deepEqual(repository.calls, []);
  });
});
