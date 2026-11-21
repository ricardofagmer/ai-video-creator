import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/*
 * Inspection evidence of SPEC 0007 section 12 for the api process, read from source text:
 * AC 52 (nothing under `publishing/` makes an outbound request; the api reaches platform clients
 * only through core's connect and disconnect handlers) and AC 57 with K2 (the api writes none of
 * `health.json`, `claim`, `state.json`, `cursor.json`, `publications.jsonl` or a metrics batch).
 * Core's handlers run inside the api process, so core's source is scanned for the watcher-only
 * writers too. Comments are stripped first: they name these files to say they are never written.
 */

const apiSource = resolve(__dirname, '..');
const coreSource = resolve(__dirname, '../../../../packages/core/src');

interface SourceFile {
  path: string;
  code: string;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

async function productionSources(root: string, folder = ''): Promise<SourceFile[]> {
  const base = join(root, folder);
  const names = await readdir(base, { recursive: true });
  const files = names.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'));
  return Promise.all(files.map(async (name) => ({ path: join(folder, name), code: stripComments(await readFile(join(base, name), 'utf8')) })));
}

function offenders(files: readonly SourceFile[], patterns: readonly RegExp[]): string[] {
  return files.flatMap((file) => patterns.filter((pattern) => pattern.test(file.code)).map((pattern) => `${file.path}: ${pattern.source}`));
}

const outboundPatterns: RegExp[] = [
  /\bfetch\s*\(/,
  /from\s+['"](node:)?(http|https|http2|net|tls|dgram)['"]/,
  /require\(\s*['"](node:)?(http|https|http2|net|tls|dgram)['"]\s*\)/,
  /['"](undici|axios|got|node-fetch|superagent)['"]/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
];

const platformClientPatterns: RegExp[] = [/\bPlatformClientRegistry\b/, /\bPLATFORM_CLIENTS\b/, /\bLIVE_PLATFORM_CLIENT_CONTEXT\b/, /\bPlatformClient\b/];

/** The watcher-only writers of the shared platform and run-file helpers (AC 57, K2). */
const watcherWriterPatterns: RegExp[] = [
  /\bwriteHealthFile\b/,
  /\bclaimPublishAttempt\b/,
  /\bwritePublishState\b/,
  /\bwritePollCursor\b/,
  /\bappendRunPublicationLine\b/,
  /\bcreateMetricBatch\b/,
];

const watcherFileNamePatterns: RegExp[] = [
  /['"`]health\.json['"`]/,
  /['"`]state\.json['"`]/,
  /['"`]cursor\.json['"`]/,
  /['"`]publications\.jsonl['"`]/,
  /['"`]claim['"`]/,
  /\bplatformFileNames\.(health|claim|state|pollCursor)\b/,
  /\brunFileNames\.publications\b/,
];

describe('api source boundaries of SPEC 0007 (section 12 inspection)', () => {
  it('finds the source it scans, so an empty scan cannot pass', async () => {
    const publishing = await productionSources(apiSource, 'publishing');
    assert.ok(publishing.some((file) => file.path.endsWith('publishing.controller.ts')));
    assert.ok((await productionSources(coreSource, 'platforms')).length > 10);
  });

  it('makes no outbound request from apps/api/src/publishing (AC 52)', async () => {
    assert.deepEqual(offenders(await productionSources(apiSource, 'publishing'), outboundPatterns), []);
  });

  it('makes no outbound request from the connections controllers or the inbox sync either', async () => {
    const files = [...(await productionSources(apiSource, 'connections')), ...(await productionSources(apiSource, 'metrics'))];
    assert.deepEqual(offenders(files, outboundPatterns), []);
  });

  it('never reaches a platform client from api code; only core connect and disconnect do (AC 52)', async () => {
    assert.deepEqual(offenders(await productionSources(apiSource), platformClientPatterns), []);
  });

  it('never writes health.json, claim, state.json, cursor.json, publications.jsonl or a batch from api code (AC 57)', async () => {
    const files = await productionSources(apiSource);
    assert.deepEqual(offenders(files, [...watcherWriterPatterns, ...watcherFileNamePatterns]), []);
  });

  it('keeps node:fs out of the rev 7 api folders, which write only through core handlers', async () => {
    const files = [
      ...(await productionSources(apiSource, 'connections')),
      ...(await productionSources(apiSource, 'publishing')),
      ...(await productionSources(apiSource, 'metrics')).filter((file) => file.path.includes('metric-inbox')),
    ];
    assert.deepEqual(offenders(files, [/['"](node:)?fs(\/promises)?['"]/]), []);
  });

  it('runs no watcher-only writer inside the api process through core either (AC 57, K2)', async () => {
    assert.deepEqual(offenders(await productionSources(coreSource), watcherWriterPatterns), []);
  });
});
