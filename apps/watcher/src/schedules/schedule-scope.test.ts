import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/*
 * Inspection of the watcher's schedule scope (R3-AC-13, R3-AC-19, K1-K4, ticket 04 acceptance): the
 * production files under `src/schedules/` (tests excluded) call no writer of `schedule.json`,
 * `approval.json`, `control.json` or `now.json`, reach no Prisma client or MetricsModule, and spell
 * no run status other than `pending`. Comments are stripped first, so prose that names a forbidden
 * file to say it is never written does not count.
 */

const SCOPE = __dirname;

const forbidden: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bcreateSchedule\b/, why: 'schedule.json is written by the api or CLI only (R3-AC-19)' },
  { pattern: /\brewriteScheduleFile\b/, why: 'schedule.json is written by the api or CLI only (R3-AC-19)' },
  { pattern: /\bScheduleWriter\b/, why: 'schedule.json is written by the api or CLI only (R3-AC-19)' },
  { pattern: /\bwriteApprovalFile\b/, why: 'no approval.json write (K3)' },
  { pattern: /\bwriteControlRequest\b/, why: 'no control.json write (K3)' },
  { pattern: /\bwriteNowFile\b/, why: 'the only run-folder write is run.json' },
  { pattern: /\bPrismaService\b|\bPrismaClient\b|\bprisma\b/, why: 'the watcher never writes SQLite (K1)' },
  { pattern: /\bMetricsModule\b/, why: 'the watcher never imports MetricsModule' },
  { pattern: /\bCommandBus\b/, why: 'no command handler is reachable from the watcher' },
  { pattern: /'(?:draft|running|waiting|paused|interrupted|review|approved|rejected|failed)'/, why: 'no run status other than pending (K3)' },
];

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

async function productionSources(): Promise<{ file: string; code: string }[]> {
  const files = (await readdir(SCOPE)).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  return Promise.all(files.map(async (file) => ({ file, code: withoutComments(await readFile(join(SCOPE, file), 'utf8')) })));
}

describe('apps/watcher/src/schedules scope (R3-AC-13, R3-AC-19)', () => {
  it('has production files to inspect', async () => {
    assert.ok((await productionSources()).length >= 5);
  });

  for (const rule of forbidden) {
    it(`never matches ${rule.pattern.source}: ${rule.why}`, async () => {
      const offenders = (await productionSources()).filter((source) => rule.pattern.test(source.code)).map((source) => source.file);
      assert.deepEqual(offenders, []);
    });
  }
});
