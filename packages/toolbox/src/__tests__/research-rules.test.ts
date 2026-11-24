import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkResearch } from '../validation/research-rules';

/* CR12 (ticket 10): research.json must parse, list at least 2 sources and at least 1 primary one. */

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: 'https://docs.example.com/guide',
    title: 'Guia oficial',
    publisher: 'Example',
    retrievedAt: '2026-11-20T10:00:00.000Z',
    excerpt: 'trecho',
    primary: true,
    ...overrides,
  };
}

function research(sources: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { schemaVersion: 1, topic: 'Automação de notas', pillar: 'TOOL_DEMO', angle: 'passo a passo', sources };
}

describe('toolbox checkResearch (CR12)', () => {
  it('accepts two distinct sources with a primary one and returns the parsed manifest', () => {
    const result = checkResearch(research([source(), source({ url: 'https://blog.example.com/post', primary: false })]));

    assert.deepEqual(result.violations, []);
    assert.equal(result.manifest?.sources.length, 2);
  });

  it('reports INSUFFICIENT_SOURCES when fewer than two sources are listed', () => {
    const result = checkResearch(research([source()]));

    assert.equal(result.manifest, null);
    assert.deepEqual(
      result.violations.map((violation) => violation.code),
      ['INSUFFICIENT_SOURCES'],
    );
  });

  it('reports INSUFFICIENT_SOURCES when no source is primary', () => {
    const result = checkResearch(research([source({ primary: false }), source({ url: 'https://blog.example.com/post', primary: false })]));

    assert.deepEqual(
      result.violations.map((violation) => violation.code),
      ['INSUFFICIENT_SOURCES'],
    );
  });

  it('reports a source listed twice as INVALID_INPUT', () => {
    const result = checkResearch(research([source(), source()]));

    assert.deepEqual(
      result.violations.map((violation) => violation.code),
      ['INVALID_INPUT'],
    );
    assert.match(result.violations[0]?.message ?? '', /twice/);
  });

  it('reports schema problems as INVALID_INPUT naming research.json, without a manifest', () => {
    const result = checkResearch({ ...research([source(), source({ url: 'not a url' })]), pillar: 'GOSSIP' });

    assert.equal(result.manifest, null);
    assert.ok(result.violations.length >= 2);
    for (const violation of result.violations) {
      assert.equal(violation.code, 'INVALID_INPUT');
      assert.match(violation.message, /^research\.json /);
    }
  });

  it('refuses input that is not an object', () => {
    for (const raw of [null, 'research', 42, []]) {
      const result = checkResearch(raw);

      assert.equal(result.manifest, null);
      assert.ok(result.violations.length > 0);
    }
  });
});
