import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { hashManifest } from '../run/hashing';

/*
 * CR12 (ticket 10, AC 2): `hashManifest` is the toolbox's own `sha256:`-prefixed hash over a
 * canonical JSON form (object keys sorted recursively, undefined members dropped). Equal data
 * must hash equally whatever its key order, and any value change must change the hash.
 */

function sha256Of(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function scenes(): Record<string, unknown>[] {
  return [
    { id: 'hook', durationHintS: 3.5, claimIds: ['c1', 'c2'] },
    { id: 'cta', durationHintS: 2, claimIds: [] },
  ];
}

function manifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: 'Tour do app',
    wordCount: 42,
    approved: true,
    reviewer: null,
    scenes: scenes(),
    voice: { provider: 'mock', settings: { stability: 0.4, style: 0 } },
  };
}

function reorderedManifest(): Record<string, unknown> {
  return {
    voice: { settings: { style: 0, stability: 0.4 }, provider: 'mock' },
    scenes: [
      { claimIds: ['c1', 'c2'], durationHintS: 3.5, id: 'hook' },
      { claimIds: [], id: 'cta', durationHintS: 2 },
    ],
    reviewer: null,
    approved: true,
    wordCount: 42,
    title: 'Tour do app',
    schemaVersion: 1,
  };
}

describe('toolbox hashManifest (CR12, ticket 10 AC 2)', () => {
  it('returns sha256: followed by 64 lowercase hex characters', () => {
    assert.match(hashManifest(manifest()), /^sha256:[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same data on every call', () => {
    assert.equal(hashManifest(manifest()), hashManifest(manifest()));
  });

  it('returns the same hash when keys are reordered at every depth', () => {
    assert.equal(hashManifest(reorderedManifest()), hashManifest(manifest()));
  });

  it('hashes the compact JSON with keys sorted by code unit', () => {
    const value = { b: [2, { z: 1, a: 'x' }], a: 1, B: true };

    assert.equal(hashManifest(value), sha256Of('{"B":true,"a":1,"b":[2,{"a":"x","z":1}]}'));
  });

  it('drops undefined members, so a missing key and an undefined key hash equally', () => {
    assert.equal(hashManifest({ a: 1, b: undefined }), hashManifest({ a: 1 }));
  });

  it('hashes scalars as their JSON text', () => {
    assert.equal(hashManifest('texto'), sha256Of('"texto"'));
    assert.equal(hashManifest(7), sha256Of('7'));
    assert.equal(hashManifest(null), sha256Of('null'));
  });

  it('hashes an empty object and an empty array differently', () => {
    assert.equal(hashManifest({}), sha256Of('{}'));
    assert.equal(hashManifest([]), sha256Of('[]'));
    assert.notEqual(hashManifest({}), hashManifest([]));
  });

  const changes: readonly { name: string; change: (value: Record<string, unknown>) => void }[] = [
    { name: 'a top-level string', change: (value) => (value['title'] = 'Tour do app!') },
    { name: 'a number', change: (value) => (value['wordCount'] = 43) },
    { name: 'a number to its string form', change: (value) => (value['wordCount'] = '42') },
    { name: 'a boolean', change: (value) => (value['approved'] = false) },
    { name: 'null to a value', change: (value) => (value['reviewer'] = 'ana') },
    { name: 'a nested value', change: (value) => (value['voice'] = { provider: 'mock', settings: { stability: 0.41, style: 0 } }) },
    { name: 'the order of array items', change: (value) => (value['scenes'] = scenes().reverse()) },
    { name: 'an added key', change: (value) => (value['extra'] = 0) },
    { name: 'a removed key', change: (value) => delete value['schemaVersion'] },
    {
      name: 'a renamed key',
      change: (value) => {
        value['Title'] = value['title'];
        delete value['title'];
      },
    },
  ];

  for (const { name, change } of changes) {
    it(`changes the hash when ${name} changes`, () => {
      const changed = manifest();
      change(changed);

      assert.notEqual(hashManifest(changed), hashManifest(manifest()));
    });
  }
});
