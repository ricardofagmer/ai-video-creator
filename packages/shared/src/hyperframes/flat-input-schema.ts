import { HYPERFRAMES_VARIABLE_NAME_PATTERN, hyperframesBounds } from './constants';
import { templateIssue, type TemplateIssue } from './template-issues';

/*
 * The flat `inputSchema` of a HyperFrames template (SPEC 0008 section 4.3, vetting 0004
 * condition 4). Allowed at the root: `type: 'object'`, `additionalProperties: false`, `required`,
 * `properties`. Each property is a string, a color, an enum, a number or a boolean, and nothing
 * else: no object, array, `$ref`, combinator or nested `properties`.
 */

export type FlatProperty =
  | { kind: 'string'; maxLength: number | null; defaultValue?: string }
  | { kind: 'color'; defaultValue?: string }
  | { kind: 'enum'; values: readonly string[]; defaultValue?: string }
  | { kind: 'number'; defaultValue?: number }
  | { kind: 'boolean'; defaultValue?: boolean };

export interface FlatInputSchema {
  required: readonly string[];
  properties: Readonly<Record<string, FlatProperty>>;
}

export type FlatInputSchemaParse =
  | { status: 'valid'; schema: FlatInputSchema }
  | { status: 'invalid'; issues: readonly TemplateIssue[] };

const ROOT_KEYS = new Set(['type', 'additionalProperties', 'required', 'properties']);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `value` satisfies `property` (the variable-type rule of section 5.3). */
export function satisfiesFlatProperty(property: FlatProperty, value: unknown): boolean {
  switch (property.kind) {
    case 'string':
      return (
        typeof value === 'string' &&
        value.length <= (property.maxLength ?? hyperframesBounds.stringChars)
      );
    case 'color':
      return typeof value === 'string' && COLOR_PATTERN.test(value);
    case 'enum':
      return typeof value === 'string' && property.values.includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
  }
}

function allowedKeysOf(kind: FlatProperty['kind']): ReadonlySet<string> {
  switch (kind) {
    case 'string':
      return new Set(['type', 'maxLength', 'default']);
    case 'color':
      return new Set(['type', 'format', 'default']);
    case 'enum':
      return new Set(['type', 'enum', 'default']);
    case 'number':
    case 'boolean':
      return new Set(['type', 'default']);
  }
}

function kindOf(name: string, raw: Record<string, unknown>, issues: TemplateIssue[]): FlatProperty['kind'] | null {
  if (raw.type === 'number') return 'number';
  if (raw.type === 'boolean') return 'boolean';
  if (raw.type !== 'string') {
    issues.push(
      templateIssue('property-type-not-allowed', name, 'type must be string, number or boolean (no object, array or other type)'),
    );
    return null;
  }
  if ('format' in raw) {
    if (raw.format !== 'color') {
      issues.push(templateIssue('property-format-invalid', name, 'the only allowed format is "color"'));
      return null;
    }
    return 'color';
  }
  return 'enum' in raw ? 'enum' : 'string';
}

function parseProperty(name: string, raw: unknown, issues: TemplateIssue[]): FlatProperty | null {
  if (!isRecord(raw)) {
    issues.push(templateIssue('property-not-object', name, 'a property must be a JSON object'));
    return null;
  }
  const kind = kindOf(name, raw, issues);
  if (kind === null) return null;
  const allowed = allowedKeysOf(kind);
  const extra = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    issues.push(templateIssue('property-key-not-allowed', name, `keys not allowed: ${extra.sort().join(', ')}`));
    return null;
  }
  let property: FlatProperty;
  switch (kind) {
    case 'string': {
      const maxLength = raw.maxLength;
      if (
        maxLength !== undefined &&
        (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > hyperframesBounds.stringChars)
      ) {
        issues.push(
          templateIssue('property-max-length-invalid', name, `maxLength must be an integer from 1 to ${hyperframesBounds.stringChars}`),
        );
        return null;
      }
      property = { kind, maxLength: typeof maxLength === 'number' ? maxLength : null };
      break;
    }
    case 'enum': {
      const values = raw.enum;
      if (
        !Array.isArray(values) ||
        values.length < 1 ||
        values.length > hyperframesBounds.enumValues ||
        !values.every((value): value is string => typeof value === 'string' && value.length <= hyperframesBounds.stringChars) ||
        new Set(values).size !== values.length
      ) {
        issues.push(
          templateIssue('property-enum-invalid', name, `enum must hold 1 to ${hyperframesBounds.enumValues} distinct strings`),
        );
        return null;
      }
      property = { kind, values: [...values] };
      break;
    }
    default:
      property = { kind };
  }
  if (!('default' in raw)) return property;
  const withDefaultValue = satisfiesFlatProperty(property, raw.default) ? withDefault(property, raw.default) : null;
  if (withDefaultValue === null) {
    issues.push(templateIssue('property-default-invalid', name, 'default does not satisfy its own property'));
  }
  return withDefaultValue;
}

function withDefault(property: FlatProperty, value: unknown): FlatProperty | null {
  switch (property.kind) {
    case 'string':
    case 'color':
    case 'enum':
      return typeof value === 'string' ? { ...property, defaultValue: value } : null;
    case 'number':
      return typeof value === 'number' ? { ...property, defaultValue: value } : null;
    case 'boolean':
      return typeof value === 'boolean' ? { ...property, defaultValue: value } : null;
  }
}

function parseRequired(raw: unknown, issues: TemplateIssue[]): readonly string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((name): name is string => typeof name === 'string') || new Set(raw).size !== raw.length) {
    issues.push(templateIssue('schema-required-invalid', 'required', 'required must be a list of distinct property names'));
    return null;
  }
  return raw;
}

export function parseFlatInputSchema(schema: unknown): FlatInputSchemaParse {
  const issues: TemplateIssue[] = [];
  if (!isRecord(schema)) {
    return { status: 'invalid', issues: [templateIssue('schema-not-object', null, 'inputSchema must be a JSON object')] };
  }
  const extraRoot = Object.keys(schema).filter((key) => !ROOT_KEYS.has(key));
  if (extraRoot.length > 0) {
    issues.push(templateIssue('schema-key-not-allowed', null, `root keys not allowed: ${extraRoot.sort().join(', ')}`));
  }
  if (schema.type !== 'object') issues.push(templateIssue('schema-type-not-object', 'type', 'type must be "object"'));
  if (schema.additionalProperties !== false) {
    issues.push(templateIssue('schema-additional-properties', 'additionalProperties', 'additionalProperties must be false'));
  }
  const required = parseRequired(schema.required, issues);
  const rawProperties = schema.properties;
  const properties: Record<string, FlatProperty> = {};
  if (!isRecord(rawProperties)) {
    issues.push(templateIssue('schema-properties-missing', 'properties', 'properties must be a JSON object'));
  } else {
    const names = Object.keys(rawProperties);
    if (names.length > hyperframesBounds.maxVariables) {
      issues.push(
        templateIssue('schema-too-many-properties', 'properties', `at most ${hyperframesBounds.maxVariables} properties`),
      );
    }
    for (const name of names) {
      if (!HYPERFRAMES_VARIABLE_NAME_PATTERN.test(name)) {
        issues.push(templateIssue('property-name-invalid', name, 'a name is a lower-case letter, then up to 39 letters or digits'));
        continue;
      }
      const property = parseProperty(name, rawProperties[name], issues);
      if (property !== null) properties[name] = property;
    }
    if (required !== null) {
      const undeclared = required.filter((name) => !(name in rawProperties));
      if (undeclared.length > 0) {
        issues.push(templateIssue('schema-required-undeclared', 'required', `required names undeclared properties: ${undeclared.join(', ')}`));
      }
    }
  }
  if (issues.length > 0 || required === null) return { status: 'invalid', issues };
  return { status: 'valid', schema: { required, properties } };
}

/** One issue per broken rule of section 4.3; empty for a flat schema (AC 75). */
export function flatInputSchemaIssues(schema: unknown): readonly TemplateIssue[] {
  const parsed = parseFlatInputSchema(schema);
  return parsed.status === 'valid' ? [] : parsed.issues;
}
