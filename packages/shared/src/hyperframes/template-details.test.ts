import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type TemplateDetails } from '../catalog/kind-details';
import { type JsonObject } from '../common/json';
import { hyperframesTemplateIssues } from './template-details';
import { type TemplateIssueCode } from './template-issues';

/*
 * The details rules of a HyperFrames template (SPEC 0008 section 4.3): engine `hyperframes`,
 * `sceneSchema` null, no camera moves or transitions, and a flat `inputSchema`.
 */

function flatInputSchema(): JsonObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', maxLength: 120 },
      accent: { type: 'string', format: 'color', default: '#f97316' },
      durationS: { type: 'number', default: 30 },
    },
  };
}

function hyperframesDetails(overrides: Partial<TemplateDetails> = {}): TemplateDetails {
  return {
    engine: 'hyperframes',
    compositionId: 'TitleCard',
    canvas: { width: 1080, height: 1920 },
    aspect: '9:16',
    fps: 30,
    duration: { minSec: 3, maxSec: 30 },
    inputSchema: flatInputSchema(),
    sceneSchema: null,
    cameraMoves: [],
    transitions: [],
    ...overrides,
  };
}

function codesOf(details: TemplateDetails): TemplateIssueCode[] {
  return hyperframesTemplateIssues(details).map((issue) => issue.code);
}

describe('hyperframesTemplateIssues', () => {
  it('accepts HyperFrames details that hold every section 4.3 rule', () => {
    assert.deepEqual(hyperframesTemplateIssues(hyperframesDetails()), []);
  });

  it('rejects a non-null sceneSchema', () => {
    const issues = hyperframesTemplateIssues(hyperframesDetails({ sceneSchema: { type: 'object', properties: {} } }));

    assert.deepEqual(
      issues.map((issue) => ({ code: issue.code, at: issue.at })),
      [{ code: 'scene-schema-not-null', at: 'sceneSchema' }],
    );
  });

  it('rejects a non-flat inputSchema with the flat-schema issue', () => {
    const inputSchema: JsonObject = {
      type: 'object',
      additionalProperties: false,
      properties: { address: { type: 'object', properties: { city: { type: 'string' } } } },
    };

    assert.deepEqual(codesOf(hyperframesDetails({ inputSchema })), ['property-type-not-allowed']);
  });

  it('rejects an inputSchema whose additionalProperties is not false', () => {
    assert.deepEqual(codesOf(hyperframesDetails({ inputSchema: { ...flatInputSchema(), additionalProperties: true } })), [
      'schema-additional-properties',
    ]);
  });

  it('rejects an engine other than hyperframes', () => {
    assert.deepEqual(codesOf(hyperframesDetails({ engine: 'remotion' })), ['engine-not-hyperframes']);
  });

  it('rejects declared camera moves', () => {
    assert.deepEqual(codesOf(hyperframesDetails({ cameraMoves: ['slow-zoom'] })), ['camera-moves-not-empty']);
  });

  it('rejects declared transitions', () => {
    assert.deepEqual(codesOf(hyperframesDetails({ transitions: ['crossfade'] })), ['transitions-not-empty']);
  });

  it('reports every broken rule at once, one issue each', () => {
    const codes = codesOf(
      hyperframesDetails({
        sceneSchema: { type: 'object' },
        cameraMoves: ['slow-zoom'],
        transitions: ['crossfade'],
        inputSchema: { ...flatInputSchema(), $ref: '#/definitions/props' },
      }),
    );

    assert.deepEqual([...codes].sort(), ['camera-moves-not-empty', 'scene-schema-not-null', 'schema-key-not-allowed', 'transitions-not-empty']);
  });

  it('never carries a property value in an issue message', () => {
    const plantedDefault = 'sentinel-default-value-planted';
    const inputSchema: JsonObject = {
      type: 'object',
      additionalProperties: false,
      properties: { title: { type: 'string', maxLength: 3, default: plantedDefault } },
    };

    const issues = hyperframesTemplateIssues(hyperframesDetails({ inputSchema }));

    assert.equal(issues.length, 1);
    assert.ok(issues.every((issue) => !issue.message.includes(plantedDefault)));
  });
});
