import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

/*
 * Inspection of the watcher's writer boundaries (SPEC 0007 section 12 "Inspection by grep", K1,
 * K2, K4): AC 57, no Prisma write and no writer of `gates.json`, `account.json`, `request.json` or
 * `cancel` anywhere in `apps/watcher/src`; AC 58, no file under `schedules/`, `curation/`, `stages/`
 * or `engine/` references a publish request. Production files only (tests excluded); comments are
 * stripped first, so prose that names a forbidden file to say it is never written does not count.
 */

const SRC = resolve(__dirname, '..');

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

async function productionFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...(await productionFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

async function sources(folder: string): Promise<{ file: string; code: string }[]> {
  const files = await productionFiles(folder);
  return Promise.all(files.map(async (file) => ({ file: relative(SRC, file), code: withoutComments(await readFile(file, 'utf8')) })));
}

function offenders(files: readonly { file: string; code: string }[], pattern: RegExp): string[] {
  return files.filter((source) => pattern.test(source.code)).map((source) => source.file);
}

describe('apps/watcher/src writes no SQLite and no api-owned platform file (AC 57)', () => {
  const forbidden: readonly { pattern: RegExp; why: string }[] = [
    { pattern: /\bprisma\s*\.\s*\w+\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/, why: 'no Prisma model write (K1)' },
    { pattern: /\$transaction|\$executeRaw/, why: 'no Prisma transaction or raw write (K1)' },
    { pattern: /\bwriteGatesFile\b/, why: 'gates.json is written by the api or CLI only' },
    { pattern: /\bwriteAccountFile\b/, why: 'account.json is written by the api or CLI only' },
    { pattern: /\bcreatePublishRequest\b/, why: 'request.json is written by RequestPublish only (K4)' },
    { pattern: /\bcreateCancelMarker\b/, why: 'cancel is written by the api or CLI only' },
    { pattern: /\bdeleteMetricBatch\b/, why: 'a batch file is deleted by its ingester only (K2)' },
    { pattern: /\bvault\s*\.\s*delete\s*\(/, why: 'the watcher replaces a Keychain item on refresh, never deletes it' },
    { pattern: /\bRequestPublish(?:Command)?\b/, why: 'no watcher code creates a publish request (K4)' },
  ];

  it('has production files to inspect, including the platform steps', async () => {
    const files = (await sources(SRC)).map((source) => source.file);
    assert.ok(files.length >= 50);
    assert.ok(files.includes(join('platforms', 'publish.step.ts')));
  });

  for (const rule of forbidden) {
    it(`never matches ${rule.pattern.source}: ${rule.why}`, async () => {
      assert.deepEqual(offenders(await sources(SRC), rule.pattern), []);
    });
  }

  it('reaches PrismaService only from the read-only readers that need it', async () => {
    const users = offenders(await sources(SRC), /\bPrismaService\b/).sort();

    // The daemon's database module names PrismaService only to bind its read-only access mode.
    assert.deepEqual(users, [
      join('daemon', 'watcher-database-access.module.ts'),
      join('platforms', 'publication-attempt.reader.ts'),
      join('platforms', 'publication-targets.reader.ts'),
      join('platforms', 'run-approval.reader.ts'),
    ]);
  });

  it('calls only findUnique and findMany on Prisma in the platform readers', async () => {
    const readers = (await sources(join(SRC, 'platforms'))).filter((source) => /\bPrismaService\b/.test(source.code));
    const calls = readers.flatMap((source) => [...source.code.matchAll(/\bprisma\s*\.\s*\w+\s*\.\s*(\w+)\s*\(/g)].map((match) => match[1]));

    assert.deepEqual([...new Set(calls)].sort(), ['findMany', 'findUnique']);
  });
});

describe('schedules, curation, stages and engine never reference a publish request (AC 58, K4)', () => {
  const folders = ['schedules', 'curation', 'stages', 'engine'];
  const forbidden: readonly RegExp[] = [
    /request\.json/,
    /\bPublishRequest\w*\b/,
    /\bRequestPublish\w*\b/,
    /\b(?:create|read)PublishRequest\b/,
    /\bplatformFileNames\b/,
    /@studio\/(?:shared|core)\/platforms/,
    /from\s+'\.\.\/(?:\.\.\/)?platforms\//,
    /\bPublishStep\b/,
  ];

  for (const folder of folders) {
    it(`finds no publish request reference under ${folder}/`, async () => {
      const files = await sources(join(SRC, folder));
      assert.ok(files.length > 0, `${folder}/ has production files`);
      for (const pattern of forbidden) assert.deepEqual(offenders(files, pattern), [], pattern.source);
    });
  }
});
