import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { probeFileHolder, probePortListener } from './database-holders';
import { type ProcessRequest, type ProcessResult, type ProcessRunner } from './process-runner';

/*
 * docs/specs/2026-11-24-installer-upgrade-guards-design.md, gap 1: what the two read-only lsof
 * questions answer. A printed pid means held whatever the exit code; an answer lsof did not give
 * is `unknown`, which the migrations step treats as in use.
 */

const DATABASE_FILE = '/Users/owner/Library/Application Support/VideoStudio/db/studio.sqlite';

interface FakeRun {
  readonly run: ProcessRunner;
  readonly requests: ProcessRequest[];
}

function answering(result: ProcessResult): FakeRun {
  const requests: ProcessRequest[] = [];
  return {
    requests,
    run: (request) => {
      requests.push(request);
      return Promise.resolve(result);
    },
  };
}

function exited(code: number | null, stdout = ''): ProcessResult {
  return { kind: 'exited', code, stdout };
}

describe('database holders: listener on the API port', () => {
  it('asks lsof for listeners on the port with a fixed argv, no shell variables and captured output', async () => {
    const fake = answering(exited(1));
    await probePortListener(fake.run, 4311);
    assert.equal(fake.requests.length, 1);
    const [request] = fake.requests;
    assert.ok(request);
    assert.equal(request.command, '/usr/sbin/lsof');
    assert.deepEqual(request.args, ['-nP', '-iTCP:4311', '-sTCP:LISTEN', '-t']);
    assert.equal(request.cwd, '/');
    assert.deepEqual(request.env, { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
    assert.equal(request.captureStdout, true);
  });

  it('is held when lsof prints a pid', async () => {
    assert.equal(await probePortListener(answering(exited(0, '41067\n')).run, 4311), 'held');
  });

  it('is held when a pid is printed beside a warning exit code', async () => {
    assert.equal(await probePortListener(answering(exited(1, '41067\n')).run, 4311), 'held');
  });

  it('is free when lsof finds nothing', async () => {
    assert.equal(await probePortListener(answering(exited(1)).run, 4311), 'free');
    assert.equal(await probePortListener(answering(exited(0, '\n')).run, 4311), 'free');
  });

  it('is unknown when lsof could not start or ended abnormally', async () => {
    assert.equal(await probePortListener(answering({ kind: 'spawn-error' }).run, 4311), 'unknown');
    assert.equal(await probePortListener(answering(exited(null)).run, 4311), 'unknown');
    assert.equal(await probePortListener(answering(exited(2)).run, 4311), 'unknown');
  });

  it('is unknown, and runs nothing, for a port that is not one', async () => {
    const fake = answering(exited(1));
    assert.equal(await probePortListener(fake.run, 0), 'unknown');
    assert.equal(await probePortListener(fake.run, 70_000), 'unknown');
    assert.equal(await probePortListener(fake.run, 4311.5), 'unknown');
    assert.equal(fake.requests.length, 0);
  });
});

describe('database holders: processes with the database file open', () => {
  it('passes the absolute file as one argument, spaces included', async () => {
    const fake = answering(exited(1));
    await probeFileHolder(fake.run, DATABASE_FILE);
    assert.deepEqual(fake.requests[0]?.args, ['-nP', '-t', DATABASE_FILE]);
  });

  it('is held when lsof prints the holders, one pid per line', async () => {
    assert.equal(await probeFileHolder(answering(exited(0, '22498\n22505\n')).run, DATABASE_FILE), 'held');
  });

  it('is free when nothing has the file open or the file does not exist yet', async () => {
    assert.equal(await probeFileHolder(answering(exited(1)).run, DATABASE_FILE), 'free');
  });

  it('is unknown, and runs nothing, for a path setup would never build', async () => {
    const fake = answering(exited(1));
    assert.equal(await probeFileHolder(fake.run, 'db/studio.sqlite'), 'unknown');
    assert.equal(await probeFileHolder(fake.run, '-nP'), 'unknown');
    assert.equal(await probeFileHolder(fake.run, '/data/studio\0.sqlite'), 'unknown');
    assert.equal(fake.requests.length, 0);
  });
});
