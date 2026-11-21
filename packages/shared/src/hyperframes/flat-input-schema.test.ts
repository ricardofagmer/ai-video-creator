import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { flatInputSchemaIssues, parseFlatInputSchema } from './flat-input-schema';
import { type TemplateIssueCode } from './template-issues';

/*
 * The flat `inputSchema` of a HyperFrames template (SPEC 0008 section 4.3, AC 75). Each refusal
 * case breaks exactly one rule of the section 4.3 example and expects exactly one issue for it.
 */

const SEED_INPUT_SCHEMA_FILE = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'seeds',
  'templates',
  'hyperframes',
  'title-card.input.schema.json',
);

/** The section 4.3 example, property by property; a fresh copy per call. */
function exampleProperties(): Record<string, unknown> {
  return {
    title: { type: 'string', maxLength: 120 },
    accent: { type: 'string', format: 'color', default: '#f97316' },
    layout: { type: 'string', enum: ['center', 'lower-third'], default: 'center' },
    durationS: { type: 'number' },
    showLogo: { type: 'boolean', default: false },
  };
}

function exampleSchema(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: ['title'], properties: exampleProperties(), ...overrides };
}

/** The example with `extra` properties added or replaced. */
function exampleWithProperties(extra: Record<string, unknown>): Record<string, unknown> {
  return exampleSchema({ properties: { ...exampleProperties(), ...extra } });
}

function stringProperties(count: number): Record<string, unknown> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`variable${index}`, { type: 'string' }]));
}

function codesOf(schema: unknown): TemplateIssueCode[] {
  return flatInputSchemaIssues(schema).map((issue) => issue.code);
}

function onlyIssue(schema: unknown): { code: TemplateIssueCode; at: string | null; message: string } {
  const issues = flatInputSchemaIssues(schema);
  assert.equal(issues.length, 1, `expected exactly one issue, got ${JSON.stringify(issues)}`);
  const [issue] = issues;
  if (issue === undefined) assert.fail('expected one issue');
  return issue;
}

describe('flatInputSchemaIssues: accepted schemas (AC 75)', () => {
  it('accepts the section 4.3 example', () => {
    assert.deepEqual(flatInputSchemaIssues(exampleSchema()), []);
  });

  it('parses the section 4.3 example into its five property kinds with their defaults', () => {
    const parsed = parseFlatInputSchema(exampleSchema());

    assert.deepEqual(parsed, {
      status: 'valid',
      schema: {
        required: ['title'],
        properties: {
          title: { kind: 'string', maxLength: 120 },
          accent: { kind: 'color', defaultValue: '#f97316' },
          layout: { kind: 'enum', values: ['center', 'lower-third'], defaultValue: 'center' },
          durationS: { kind: 'number' },
          showLogo: { kind: 'boolean', defaultValue: false },
        },
      },
    });
  });

  it('accepts the repository seed template input schema', () => {
    const seedSchema: unknown = JSON.parse(readFileSync(SEED_INPUT_SCHEMA_FILE, 'utf8'));

    assert.deepEqual(flatInputSchemaIssues(seedSchema), []);
  });

  it('accepts exactly 32 properties', () => {
    assert.deepEqual(flatInputSchemaIssues(exampleSchema({ required: [], properties: stringProperties(32) })), []);
  });

  it('accepts a schema without required names', () => {
    const schema = exampleSchema();
    delete schema.required;

    assert.deepEqual(flatInputSchemaIssues(schema), []);
  });

  it('accepts a string maxLength of exactly 500', () => {
    assert.deepEqual(flatInputSchemaIssues(exampleWithProperties({ title: { type: 'string', maxLength: 500 } })), []);
  });

  it('accepts a 40-character variable name', () => {
    assert.deepEqual(flatInputSchemaIssues(exampleWithProperties({ [`a${'b'.repeat(39)}`]: { type: 'number' } })), []);
  });
});

describe('flatInputSchemaIssues: AC 75 refusals, one issue each', () => {
  it('rejects a nested object property', () => {
    const issue = onlyIssue(exampleWithProperties({ address: { type: 'object', properties: { city: { type: 'string' } } } }));

    assert.equal(issue.code, 'property-type-not-allowed');
    assert.equal(issue.at, 'address');
  });

  it('rejects an array property', () => {
    const issue = onlyIssue(exampleWithProperties({ tags: { type: 'array', items: { type: 'string' } } }));

    assert.equal(issue.code, 'property-type-not-allowed');
    assert.equal(issue.at, 'tags');
  });

  it('rejects a $ref property', () => {
    const issue = onlyIssue(exampleWithProperties({ title: { $ref: '#/definitions/title' } }));

    assert.equal(issue.code, 'property-type-not-allowed');
    assert.equal(issue.at, 'title');
  });

  it('rejects a $ref beside an allowed type', () => {
    const issue = onlyIssue(exampleWithProperties({ title: { type: 'string', $ref: '#/definitions/title' } }));

    assert.equal(issue.code, 'property-key-not-allowed');
    assert.equal(issue.at, 'title');
    assert.match(issue.message, /\$ref/);
  });

  it('rejects a $ref at the root', () => {
    const issue = onlyIssue(exampleSchema({ $ref: '#/definitions/root' }));

    assert.equal(issue.code, 'schema-key-not-allowed');
    assert.match(issue.message, /\$ref/);
  });

  for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
    it(`rejects ${combinator} inside a property`, () => {
      const issue = onlyIssue(exampleWithProperties({ title: { type: 'string', [combinator]: [{ maxLength: 10 }, { maxLength: 20 }] } }));

      assert.equal(issue.code, 'property-key-not-allowed');
      assert.equal(issue.at, 'title');
      assert.match(issue.message, new RegExp(combinator));
    });

    it(`rejects ${combinator} at the root`, () => {
      const issue = onlyIssue(exampleSchema({ [combinator]: [{ required: ['title'] }] }));

      assert.equal(issue.code, 'schema-key-not-allowed');
      assert.match(issue.message, new RegExp(combinator));
    });
  }

  it('rejects patternProperties at the root', () => {
    assert.deepEqual(codesOf(exampleSchema({ patternProperties: { '^x': { type: 'string' } } })), ['schema-key-not-allowed']);
  });

  it('rejects 33 properties', () => {
    const issue = onlyIssue(exampleSchema({ required: [], properties: stringProperties(33) }));

    assert.equal(issue.code, 'schema-too-many-properties');
    assert.equal(issue.at, 'properties');
  });

  it('rejects an unknown type', () => {
    const issue = onlyIssue(exampleWithProperties({ count: { type: 'integer' } }));

    assert.equal(issue.code, 'property-type-not-allowed');
    assert.equal(issue.at, 'count');
  });

  it('rejects additionalProperties set to true', () => {
    const issue = onlyIssue(exampleSchema({ additionalProperties: true }));

    assert.equal(issue.code, 'schema-additional-properties');
    assert.equal(issue.at, 'additionalProperties');
  });

  it('rejects a missing additionalProperties', () => {
    const schema = exampleSchema();
    delete schema.additionalProperties;

    assert.deepEqual(codesOf(schema), ['schema-additional-properties']);
  });

  it('rejects a string default of the wrong type', () => {
    const issue = onlyIssue(exampleWithProperties({ title: { type: 'string', default: 5 } }));

    assert.equal(issue.code, 'property-default-invalid');
    assert.equal(issue.at, 'title');
  });

  it('rejects a number default given as a string', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ durationS: { type: 'number', default: '30' } })), ['property-default-invalid']);
  });

  it('rejects a boolean default given as a string', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ showLogo: { type: 'boolean', default: 'false' } })), ['property-default-invalid']);
  });

  it('rejects a color default that is not #rrggbb', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ accent: { type: 'string', format: 'color', default: 'orange' } })), [
      'property-default-invalid',
    ]);
  });

  it('rejects an enum default outside its values', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ layout: { type: 'string', enum: ['center'], default: 'top' } })), [
      'property-default-invalid',
    ]);
  });

  it('rejects a string default longer than its own maxLength', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ title: { type: 'string', maxLength: 3, default: 'four' } })), [
      'property-default-invalid',
    ]);
  });

  it('rejects a required name that is not declared', () => {
    const issue = onlyIssue(exampleSchema({ required: ['title', 'subtitle'] }));

    assert.equal(issue.code, 'schema-required-undeclared');
    assert.equal(issue.at, 'required');
    assert.match(issue.message, /subtitle/);
  });
});

describe('flatInputSchemaIssues: other section 4.3 rules', () => {
  it('rejects a schema that is not a JSON object', () => {
    assert.deepEqual(codesOf(null), ['schema-not-object']);
    assert.deepEqual(codesOf([]), ['schema-not-object']);
    assert.deepEqual(codesOf('object'), ['schema-not-object']);
  });

  it('rejects a root type other than object', () => {
    assert.deepEqual(codesOf(exampleSchema({ type: 'array' })), ['schema-type-not-object']);
  });

  it('rejects missing properties', () => {
    const schema = exampleSchema({ required: [] });
    delete schema.properties;

    assert.deepEqual(codesOf(schema), ['schema-properties-missing']);
  });

  it('rejects required that is not a list of distinct names', () => {
    assert.deepEqual(codesOf(exampleSchema({ required: 'title' })), ['schema-required-invalid']);
    assert.deepEqual(codesOf(exampleSchema({ required: ['title', 'title'] })), ['schema-required-invalid']);
  });

  it('rejects a property name that breaks the name pattern', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ Title: { type: 'string' } })), ['property-name-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ 'lower-third': { type: 'string' } })), ['property-name-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ [`a${'b'.repeat(40)}`]: { type: 'string' } })), ['property-name-invalid']);
  });

  it('rejects a property that is not a JSON object', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ title: 'string' })), ['property-not-object']);
  });

  it('rejects nested properties under a string property', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ title: { type: 'string', properties: { inner: { type: 'string' } } } })), [
      'property-key-not-allowed',
    ]);
  });

  it('rejects a string maxLength above 500 or below 1', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ title: { type: 'string', maxLength: 501 } })), ['property-max-length-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ title: { type: 'string', maxLength: 0 } })), ['property-max-length-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ title: { type: 'string', maxLength: 1.5 } })), ['property-max-length-invalid']);
  });

  it('rejects a format other than color', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ accent: { type: 'string', format: 'date-time' } })), ['property-format-invalid']);
  });

  it('rejects an enum that is empty, repeats a value or holds a non-string', () => {
    assert.deepEqual(codesOf(exampleWithProperties({ layout: { type: 'string', enum: [] } })), ['property-enum-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ layout: { type: 'string', enum: ['a', 'a'] } })), ['property-enum-invalid']);
    assert.deepEqual(codesOf(exampleWithProperties({ layout: { type: 'string', enum: ['a', 1] } })), ['property-enum-invalid']);
  });

  it('rejects an enum of 33 values', () => {
    const values = Array.from({ length: 33 }, (_, index) => `value${index}`);

    assert.deepEqual(codesOf(exampleWithProperties({ layout: { type: 'string', enum: values } })), ['property-enum-invalid']);
  });

  it('reports one issue per broken rule when several rules break together', () => {
    const codes = codesOf(
      exampleSchema({
        additionalProperties: true,
        required: ['title', 'missing'],
        properties: { ...exampleProperties(), tags: { type: 'array' } },
      }),
    );

    assert.deepEqual([...codes].sort(), ['property-type-not-allowed', 'schema-additional-properties', 'schema-required-undeclared']);
  });
});
