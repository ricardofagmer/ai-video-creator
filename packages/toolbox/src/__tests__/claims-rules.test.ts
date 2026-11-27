import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Claim, ResearchManifest } from '@studio/shared/ace';
import { checkClaims, isClaimSupported, researchSourceUrls } from '../validation/claims-rules';

/*
 * CR12 (ticket 10): claims.json must parse, use unique ids, cite only research.json sources, and
 * every material claim must be supported by evidence from one of them.
 */

const PRIMARY_URL = 'https://docs.example.com/guide';
const SECOND_URL = 'https://blog.example.com/post';

function researchManifest(): ResearchManifest {
  const retrievedAt = '2026-11-20T10:00:00.000Z';
  return {
    schemaVersion: 1,
    topic: 'Automação de notas',
    pillar: 'TOOL_DEMO',
    angle: 'passo a passo',
    sources: [
      { url: PRIMARY_URL, title: 'Guia', publisher: 'Example', retrievedAt, excerpt: '', primary: true },
      { url: SECOND_URL, title: 'Post', publisher: 'Example', retrievedAt, excerpt: '', primary: false },
    ],
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return { id: 'c1', text: 'O app exporta notas.', material: true, status: 'supported', evidence: [{ sourceUrl: PRIMARY_URL, quote: 'exporta' }], ...overrides };
}

function codesOf(raw: unknown): string[] {
  return checkClaims(raw, researchManifest()).violations.map((violation) => violation.code);
}

describe('toolbox claims rules (CR12)', () => {
  it('accepts supported material claims citing research sources', () => {
    const result = checkClaims({ schemaVersion: 1, claims: [claim(), claim({ id: 'c2', evidence: [{ sourceUrl: SECOND_URL, quote: 'post' }] })] }, researchManifest());

    assert.deepEqual(result.violations, []);
    assert.equal(result.manifest?.claims.length, 2);
  });

  it('matches cited URLs after normalization', () => {
    const sourceUrls = researchSourceUrls(researchManifest());

    assert.equal(isClaimSupported(claim({ evidence: [{ sourceUrl: 'HTTPS://DOCS.example.com:443/guide', quote: 'exporta' }] }), sourceUrls), true);
  });

  it('reports UNSUPPORTED_CLAIM for a material claim marked unsupported', () => {
    assert.deepEqual(codesOf({ schemaVersion: 1, claims: [claim({ status: 'unsupported' })] }), ['UNSUPPORTED_CLAIM']);
  });

  it('reports UNSUPPORTED_CLAIM for a material claim without evidence', () => {
    assert.deepEqual(codesOf({ schemaVersion: 1, claims: [claim({ evidence: [] })] }), ['UNSUPPORTED_CLAIM']);
  });

  it('allows an unsupported claim that is not material', () => {
    assert.deepEqual(codesOf({ schemaVersion: 1, claims: [claim({ material: false, status: 'unsupported', evidence: [] })] }), []);
  });

  it('reports evidence from outside research.json, and the material claim it leaves unsupported', () => {
    const codes = codesOf({ schemaVersion: 1, claims: [claim({ evidence: [{ sourceUrl: 'https://elsewhere.example.org/', quote: 'x' }] })] });

    assert.deepEqual(codes, ['INVALID_INPUT', 'UNSUPPORTED_CLAIM']);
  });

  it('reports a claim id used twice', () => {
    const result = checkClaims({ schemaVersion: 1, claims: [claim(), claim()] }, researchManifest());

    assert.deepEqual(
      result.violations.map((violation) => violation.code),
      ['INVALID_INPUT'],
    );
    assert.match(result.violations[0]?.message ?? '', /used twice/);
  });

  it('reports schema problems naming claims.json, without a manifest', () => {
    const result = checkClaims({ schemaVersion: 1, claims: [] }, researchManifest());

    assert.equal(result.manifest, null);
    assert.ok(result.violations.length > 0);
    assert.match(result.violations[0]?.message ?? '', /^claims\.json /);
  });

  it('refuses a claim id that is not file-name safe', () => {
    const result = checkClaims({ schemaVersion: 1, claims: [claim({ id: '../c1' })] }, researchManifest());

    assert.equal(result.manifest, null);
  });
});
