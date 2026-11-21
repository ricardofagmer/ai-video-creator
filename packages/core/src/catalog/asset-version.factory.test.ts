import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMetadata } from './asset-version.factory';
import { InvalidAssetInputError, type InputIssue } from './catalog.errors';

/*
 * Version metadata checks of a template (SPEC 0008 section 5.4, AC 76, details part): a
 * HyperFrames template is refused with its issue list before any byte is stored; the same
 * details with `engine: 'remotion'` take the existing path unchanged.
 */

function flatInputSchema(): Record<string, unknown> {
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

function nestedInputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { scenes: { type: 'array', items: { type: 'object', properties: { caption: { type: 'string' } } } } },
  };
}

function templateDetails(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function templateMetadata(details: Record<string, unknown>): Record<string, unknown> {
  return { name: 'Title card 9:16', owner: 'owner', sensitivity: 'normal', details };
}

/** The issues `parseMetadata` refuses with; fails the test when it does not refuse. */
function refusedIssues(metadata: unknown): readonly InputIssue[] {
  try {
    parseMetadata(metadata, 'template');
  } catch (error) {
    if (error instanceof InvalidAssetInputError) return error.issues;
    throw error;
  }
  assert.fail('expected the metadata to be refused');
}

function issueCodes(issues: readonly InputIssue[]): string[] {
  return issues.map((issue) => issue.message.split(':', 1)[0] ?? '');
}

describe('parseMetadata for a HyperFrames template (AC 76)', () => {
  it('accepts HyperFrames details that hold every section 4.3 rule', () => {
    const details = templateDetails();

    const metadata = parseMetadata(templateMetadata(details), 'template');

    assert.deepEqual(metadata.details, details);
  });

  it('refuses a non-null sceneSchema with the scene-schema issue', () => {
    const issues = refusedIssues(templateMetadata(templateDetails({ sceneSchema: { type: 'object', properties: {} } })));

    assert.deepEqual(issueCodes(issues), ['scene-schema-not-null']);
    assert.equal(issues[0]?.path, 'metadata.details.sceneSchema');
  });

  it('refuses a non-flat inputSchema with its flat-schema issues', () => {
    const issues = refusedIssues(templateMetadata(templateDetails({ inputSchema: nestedInputSchema() })));

    assert.deepEqual([...issueCodes(issues)].sort(), ['property-type-not-allowed', 'schema-additional-properties']);
    assert.ok(issues.every((issue) => issue.path.startsWith('metadata.details')));
  });

  it('refuses camera moves and transitions on a HyperFrames template', () => {
    const issues = refusedIssues(templateMetadata(templateDetails({ cameraMoves: ['slow-zoom'], transitions: ['crossfade'] })));

    assert.deepEqual([...issueCodes(issues)].sort(), ['camera-moves-not-empty', 'transitions-not-empty']);
  });

  it('lists every broken rule in one refusal', () => {
    const issues = refusedIssues(
      templateMetadata(templateDetails({ sceneSchema: { type: 'object' }, inputSchema: nestedInputSchema() })),
    );

    assert.deepEqual([...issueCodes(issues)].sort(), ['property-type-not-allowed', 'scene-schema-not-null', 'schema-additional-properties']);
  });

  it('still refuses details that fail the template schema before the HyperFrames rules', () => {
    const details = templateDetails();
    delete details.canvas;

    const issues = refusedIssues(templateMetadata(details));

    assert.ok(issues.some((issue) => issue.path === 'metadata.details.canvas'));
  });
});

describe('parseMetadata for a Remotion template (AC 76, unchanged path)', () => {
  it('accepts a non-null sceneSchema as before', () => {
    const details = templateDetails({ engine: 'remotion', sceneSchema: { type: 'object', properties: {} } });

    assert.deepEqual(parseMetadata(templateMetadata(details), 'template').details, details);
  });

  it('accepts a non-flat inputSchema as before', () => {
    const details = templateDetails({ engine: 'remotion', inputSchema: nestedInputSchema() });

    assert.deepEqual(parseMetadata(templateMetadata(details), 'template').details, details);
  });

  it('accepts the same details that a HyperFrames template is refused for', () => {
    const broken = { sceneSchema: { type: 'object' }, inputSchema: nestedInputSchema(), cameraMoves: ['slow-zoom'], transitions: ['crossfade'] };
    refusedIssues(templateMetadata(templateDetails({ engine: 'hyperframes', ...broken })));

    const details = templateDetails({ engine: 'remotion', ...broken });

    assert.deepEqual(parseMetadata(templateMetadata(details), 'template').details, details);
  });
});
