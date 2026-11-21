import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFlatInputSchema, type FlatInputSchema } from './flat-input-schema';
import { resolveTemplateVariables, type TemplateVariableSources } from './template-variables';

/*
 * Variable resolution of a HyperFrames render (SPEC 0008 section 5.3, AC 78, pure part): the
 * recipe value wins over the studio vocabulary, which wins over the template default (the
 * property is left out). Refusals name the variables, never their values.
 */

/** A template schema like the seed template's, with an enum and a boolean added. */
function templateSchema(raw: Record<string, unknown> = {}): FlatInputSchema {
  const parsed = parseFlatInputSchema({
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', maxLength: 20 },
      hook: { type: 'string' },
      accent: { type: 'string', format: 'color', default: '#f97316' },
      durationS: { type: 'number' },
      layout: { type: 'string', enum: ['center', 'lower-third'], default: 'center' },
      showLogo: { type: 'boolean', default: false },
    },
    ...raw,
  });
  if (parsed.status !== 'valid') assert.fail(`fixture schema must be flat: ${JSON.stringify(parsed.issues)}`);
  return parsed.schema;
}

function sources(overrides: Partial<TemplateVariableSources> = {}): TemplateVariableSources {
  return { schema: templateSchema(), recipeValues: undefined, vocabulary: { title: 'Studio title' }, ...overrides };
}

function resolvedVariables(input: TemplateVariableSources): Readonly<Record<string, string | number | boolean>> {
  const resolution = resolveTemplateVariables(input);
  if (resolution.status !== 'resolved') assert.fail(`expected resolved, got ${JSON.stringify(resolution)}`);
  return resolution.variables;
}

describe('resolveTemplateVariables: precedence (AC 78)', () => {
  it('takes the recipe value over the vocabulary value', () => {
    const variables = resolvedVariables(sources({ recipeValues: { title: 'Recipe title' }, vocabulary: { title: 'Studio title' } }));

    assert.equal(variables.title, 'Recipe title');
  });

  it('takes the vocabulary value when the recipe gives none', () => {
    const variables = resolvedVariables(sources({ recipeValues: {}, vocabulary: { title: 'Studio title', hook: 'Studio hook', durationS: 42 } }));

    assert.equal(variables.hook, 'Studio hook');
    assert.equal(variables.durationS, 42);
  });

  it('takes the recipe value over the vocabulary for every type', () => {
    const variables = resolvedVariables(
      sources({
        recipeValues: { accent: '#112233', durationS: 12 },
        vocabulary: { title: 'Studio title', accent: '#445566', durationS: 30 },
      }),
    );

    assert.equal(variables.accent, '#112233');
    assert.equal(variables.durationS, 12);
  });

  it('leaves a property out when neither source has it, so the template default applies', () => {
    const variables = resolvedVariables(sources());

    assert.equal(Object.hasOwn(variables, 'accent'), false);
    assert.equal(Object.hasOwn(variables, 'layout'), false);
    assert.equal(Object.hasOwn(variables, 'showLogo'), false);
    assert.equal(Object.hasOwn(variables, 'hook'), false);
  });

  it('puts only declared names in the resolved set', () => {
    const variables = resolvedVariables(
      sources({ recipeValues: { layout: 'lower-third', showLogo: true }, vocabulary: { title: 'Studio title', disclosure: 'Voz gerada por IA' } }),
    );

    assert.deepEqual(variables, { title: 'Studio title', layout: 'lower-third', showLogo: true });
  });

  it('treats a missing or null recipe parameter as an empty recipe', () => {
    assert.deepEqual(resolvedVariables(sources({ recipeValues: undefined })), { title: 'Studio title' });
    assert.deepEqual(resolvedVariables(sources({ recipeValues: null })), { title: 'Studio title' });
  });

  it('does not count a required property with its own default as missing', () => {
    const schema = templateSchema({ required: ['title', 'accent'] });

    assert.deepEqual(resolvedVariables(sources({ schema })), { title: 'Studio title' });
  });
});

describe('resolveTemplateVariables: refusals (AC 78)', () => {
  it('refuses with variable-missing when a required property has no value', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ vocabulary: {} })), {
      status: 'refused',
      reason: 'variable-missing',
      names: ['title'],
    });
  });

  it('refuses with variable-undeclared when the recipe names a property the schema does not declare', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ recipeValues: { title: 'Recipe title', subtitle: 'x' } })), {
      status: 'refused',
      reason: 'variable-undeclared',
      names: ['subtitle'],
    });
  });

  it('refuses with variable-type when a recipe value has the wrong type', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ recipeValues: { durationS: '30' } })), {
      status: 'refused',
      reason: 'variable-type',
      names: ['durationS'],
    });
  });

  it('refuses with variable-type when a string is longer than maxLength, without cutting it', () => {
    const tooLong = 'x'.repeat(21);

    const resolution = resolveTemplateVariables(sources({ recipeValues: { title: tooLong } }));

    assert.deepEqual(resolution, { status: 'refused', reason: 'variable-type', names: ['title'] });
  });

  it('accepts a string of exactly maxLength, whole', () => {
    const exact = 'x'.repeat(20);

    assert.equal(resolvedVariables(sources({ recipeValues: { title: exact } })).title, exact);
  });

  it('refuses a string longer than 500 characters when the property sets no maxLength', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ recipeValues: { hook: 'h'.repeat(501) } })), {
      status: 'refused',
      reason: 'variable-type',
      names: ['hook'],
    });
    assert.equal(resolvedVariables(sources({ recipeValues: { hook: 'h'.repeat(500) } })).hook, 'h'.repeat(500));
  });

  it('refuses with variable-type when a vocabulary value does not satisfy its property', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ vocabulary: { title: 'Studio title', accent: 'orange' } })), {
      status: 'refused',
      reason: 'variable-type',
      names: ['accent'],
    });
  });

  it('refuses an enum value outside its list, a non-boolean flag and a non-finite number', () => {
    const resolution = resolveTemplateVariables(
      sources({ recipeValues: { layout: 'top', showLogo: 'yes', durationS: Number.POSITIVE_INFINITY } }),
    );

    assert.deepEqual(resolution, { status: 'refused', reason: 'variable-type', names: ['durationS', 'layout', 'showLogo'] });
  });

  it('refuses a recipe value that is an object or an array', () => {
    assert.deepEqual(resolveTemplateVariables(sources({ recipeValues: { hook: { text: 'nested' }, title: ['a'] } })), {
      status: 'refused',
      reason: 'variable-type',
      names: ['hook', 'title'],
    });
  });

  it('refuses recipe parameters that are not a flat object', () => {
    for (const recipeValues of [['title'], 'title', 7]) {
      const resolution = resolveTemplateVariables(sources({ recipeValues }));

      assert.equal(resolution.status, 'refused');
      assert.equal(resolution.status === 'refused' ? resolution.reason : null, 'variable-type');
    }
  });

  it('never carries a variable value in a refusal', () => {
    const sentinel = 'sentinel-variable-value-0815';

    const resolution = resolveTemplateVariables(sources({ recipeValues: { title: `${sentinel}${'x'.repeat(40)}`, durationS: sentinel } }));

    assert.equal(resolution.status, 'refused');
    assert.ok(!JSON.stringify(resolution).includes(sentinel));
  });
});
