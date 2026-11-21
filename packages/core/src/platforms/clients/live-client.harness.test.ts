import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Platform } from '@studio/shared/platforms';
import { Secret } from '../../secrets/secret';
import { type PlatformClientSecretName } from '../../secrets/secret-names';
import { SENTINEL_CLIENT_ID, SENTINEL_CLIENT_SECRET, sentinelsIn } from '../token-fixtures.harness.test';
import { PlatformClientError, type PlatformClientErrorReason } from './platform-client.errors';
import { type MetricTarget, type PlatformClientCredentials } from './platform-client.port';

/*
 * Test-only helpers for the live platform clients (SPEC 0007 sections 5.1 to 5.7, tickets R4-07 to
 * R4-09). The clients receive `fetch` by injection (K9), so every test scripts the platform's answers
 * here and no request ever leaves the process. The `.harness.test.ts` name keeps the file out of the
 * build; it declares no test.
 */

/** One request as the client sent it; a byte body is copied because upload readers reuse buffers. */
export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: string | Uint8Array | undefined;
  redirect: RequestInit['redirect'];
  hasSignal: boolean;
}

/** One scripted answer. Throwing from a step simulates a transport failure (no answer at all). */
export type ScriptStep = (request: RecordedRequest) => Response | Promise<Response>;

function copyBody(body: RequestInit['body']): string | Uint8Array | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new Uint8Array(body);
  throw new Error('the live clients send only string or byte bodies');
}

/**
 * A `fetch` that answers from a script, in order. A request past the end of the script is recorded
 * as an overrun and fails like a dropped connection; `assertFinished` then fails the test.
 */
export class ScriptedFetch {
  readonly requests: RecordedRequest[] = [];
  private readonly steps: ScriptStep[];
  private overruns = 0;

  constructor(steps: readonly ScriptStep[]) {
    this.steps = [...steps];
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) throw new Error('the live clients pass a URL, never a Request');
    const request: RecordedRequest = {
      url: new URL(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: copyBody(init?.body),
      redirect: init?.redirect,
      hasSignal: init?.signal !== undefined && init.signal !== null,
    };
    this.requests.push(request);
    const step = this.steps.shift();
    if (step === undefined) {
      this.overruns += 1;
      throw new TypeError('fetch failed: script exhausted');
    }
    return step(request);
  };

  /** Every scripted answer was used and nothing was asked beyond them. */
  assertFinished(): void {
    assert.equal(this.overruns, 0, 'the client sent more requests than the script answers');
    assert.equal(this.steps.length, 0, 'the client sent fewer requests than the script answers');
  }

  /** K3 and K7: no token, code, verifier or app secret is ever placed in a request URL. */
  assertNoSentinelInUrls(): void {
    for (const request of this.requests) assert.deepEqual(sentinelsIn(request.url.href), [], `sentinel in ${request.url.pathname}`);
  }
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function textResponse(status: number, text: string, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers });
}

export function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

/** A step that never answers: the connection drops (refused, reset or timed out). */
export function transportFailure(): ScriptStep {
  return () => {
    throw new TypeError('fetch failed: socket hang up');
  };
}

export function answer(response: () => Response): ScriptStep {
  return () => response();
}

/** The body of a form-encoded request. */
export function formOf(request: RecordedRequest | undefined): URLSearchParams {
  assert.ok(request !== undefined, 'no such request');
  assert.equal(typeof request.body, 'string');
  return new URLSearchParams(typeof request.body === 'string' ? request.body : '');
}

/** The body of a JSON request. */
export function jsonOf(request: RecordedRequest | undefined): unknown {
  assert.ok(request !== undefined, 'no such request');
  assert.equal(typeof request.body, 'string');
  return JSON.parse(typeof request.body === 'string' ? request.body : 'null');
}

const credentialNames: Readonly<Record<Platform, { id: PlatformClientSecretName; secret: PlatformClientSecretName }>> = {
  youtube: { id: 'youtube-oauth-client-id', secret: 'youtube-oauth-client-secret' },
  instagram: { id: 'instagram-app-id', secret: 'instagram-app-secret' },
  tiktok: { id: 'tiktok-client-key', secret: 'tiktok-client-secret' },
};

/** The two app credentials of `platform`, holding the client sentinels. */
export function sentinelCredentials(platform: Platform): PlatformClientCredentials {
  const names = credentialNames[platform];
  return {
    clientId: new Secret(names.id, 'environment', SENTINEL_CLIENT_ID),
    clientSecret: new Secret(names.secret, 'environment', SENTINEL_CLIENT_SECRET),
  };
}

/**
 * Asserts that `promise` rejects with a `PlatformClientError` of `reason`, and that neither its
 * message nor its stack quotes a sentinel (K7). Returns the error for further checks.
 */
export async function rejectsWithReason(promise: Promise<unknown>, reason: PlatformClientErrorReason): Promise<PlatformClientError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof PlatformClientError, `expected a PlatformClientError (${reason}), got ${String(caught)}`);
  assert.equal(caught.reason, reason);
  assert.deepEqual(sentinelsIn(`${caught.message}\n${caught.stack ?? ''}`), []);
  return caught;
}

export function metricTarget(publicationId: string, platformVideoId: string, platformMediaId: string | null = null): MetricTarget {
  return { publicationId, platformVideoId, platformMediaId, dayIndex: 1 };
}

/** A temporary `final.mp4` opened read-only, as the watcher opens it (finding S2). */
export interface VideoFile {
  path: string;
  handle: FileHandle;
  sha256: string;
  sizeBytes: number;
  close(): Promise<void>;
}

/** Deterministic bytes: offsets are recognisable in a diff and no two chunks are equal. */
export function videoBytes(sizeBytes: number): Buffer {
  const bytes = Buffer.alloc(sizeBytes);
  for (let index = 0; index < sizeBytes; index += 1) bytes[index] = (index * 31 + (index >>> 16)) & 0xff;
  return bytes;
}

export async function createVideoFile(bytes: Buffer): Promise<VideoFile> {
  const root = await mkdtemp(join(tmpdir(), 'studio-live-client-'));
  const path = join(root, 'final.mp4');
  await writeFile(path, bytes);
  const handle = await open(path, 'r');
  return {
    path,
    handle,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    close: async () => {
      await handle.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
