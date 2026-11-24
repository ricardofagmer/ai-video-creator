import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type AssetVersionView } from '@studio/shared/api';
import { type AiModelDetails, type AspectRatio, type ImageDetails, type ReferenceDetails } from '@studio/shared/catalog';
// Relative paths: the node:test runner does not resolve the `@/` alias.
import { catalogEn } from '../../messages/catalog/en';
import { catalogEs } from '../../messages/catalog/es';
import { catalogPtBR } from '../../messages/catalog/pt-BR';
import { CATALOG_PANEL_ID, catalogGroupLabel, catalogTabId, countCatalogKinds, groupCatalogVersions } from './catalog-groups';

/* design/telas/02: tabs per kind, sections per kind on "All" and per subtype inside a kind tab. */
type VersionBase = Omit<Extract<AssetVersionView, { kind: 'music' }>, 'kind' | 'details'>;

function base(id: string): VersionBase {
  return {
    id,
    name: id,
    summary: '',
    version: 1,
    status: 'active',
    tags: [],
    owner: 'owner',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    contentHash: 'a'.repeat(64),
    sizeBytes: 1,
    mimeType: 'application/json',
    layout: 'file',
    storage: { mode: 'store' },
    provenance: null,
    license: null,
    sensitivity: 'normal',
    usageCount: 0,
    qualityScore: null,
    qualitySampleSize: 0,
    qualityPlatformSampleSize: 0,
    qualityScoredAt: null,
    notes: '',
    searchIndex: 'indexed',
    learnings: [],
    activation: null,
  };
}

function template(id: string, aspect: AspectRatio): AssetVersionView {
  return {
    ...base(id),
    kind: 'template',
    details: {
      engine: 'remotion',
      compositionId: 'Main',
      canvas: { width: 1080, height: 1920 },
      aspect,
      fps: 30,
      duration: { minSec: 10, maxSec: 60 },
      inputSchema: {},
      sceneSchema: null,
      cameraMoves: [],
      transitions: [],
    },
  };
}

function aiModel(id: string, modelType: AiModelDetails['modelType']): AssetVersionView {
  return { ...base(id), kind: 'ai-model', details: { modelType, provider: 'other', modelIdRef: { type: 'literal', value: id } } };
}

function reference(id: string, subKind: ReferenceDetails['subKind']): AssetVersionView {
  return { ...base(id), kind: 'reference', details: { subKind, referenceNotes: '' } };
}

function image(id: string, purpose: ImageDetails['purpose']): AssetVersionView {
  return { ...base(id), kind: 'image', details: { width: 100, height: 100, purpose } };
}

const template916a = template('vertical-a', '9:16');
const template169 = template('horizontal', '16:9');
const template916b = template('vertical-b', '9:16');
const voice = aiModel('voz', 'voice-clone');
const provider = aiModel('claude', 'provider-model');
const song: AssetVersionView = { ...base('trilha'), kind: 'music', details: { durationMs: 1000, bpm: null, integratedLufs: null } };
const skill: AssetVersionView = { ...base('roteiro'), kind: 'skill', details: { entryFile: 'SKILL.md', description: '' } };
const fixtures = [song, template916a, voice, template169, skill, template916b, provider];

function ids(versions: readonly AssetVersionView[]): string[] {
  return versions.map((entry) => entry.id);
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

describe('groupCatalogVersions', () => {
  it('groups the All tab by kind in schema order and drops empty kinds', () => {
    const groups = groupCatalogVersions(fixtures, null);
    assert.deepEqual(
      groups.map((group) => group.kind),
      ['template', 'ai-model', 'skill', 'music'],
    );
    assert.deepEqual(ids(groups[0]?.versions ?? []), ['vertical-a', 'horizontal', 'vertical-b']);
    assert.ok(groups.every((group) => group.category === null));
  });

  it('groups the template tab by aspect, 9:16 before 16:9, keeping the input order', () => {
    const groups = groupCatalogVersions(fixtures, 'template');
    assert.deepEqual(
      groups.map((group) => group.category?.value),
      ['9:16', '16:9'],
    );
    const vertical = groups.find((group) => group.category?.value === '9:16');
    assert.deepEqual(ids(vertical?.versions ?? []), ['vertical-a', 'vertical-b']);
  });

  it('groups the ai-model, reference and image tabs by their subtype field', () => {
    assert.deepEqual(
      groupCatalogVersions(fixtures, 'ai-model').map((group) => group.category?.value),
      ['voice-clone', 'provider-model'],
    );
    const references = [reference('r1', 'text'), reference('r2', 'video')];
    assert.deepEqual(
      groupCatalogVersions(references, 'reference').map((group) => group.category?.value),
      ['video', 'text'],
    );
    const images = [image('i1', 'other'), image('i2', 'logo')];
    assert.deepEqual(
      groupCatalogVersions(images, 'image').map((group) => group.category?.value),
      ['logo', 'other'],
    );
  });

  it('returns one group without a category or label for a kind without a subtype', () => {
    const groups = groupCatalogVersions(fixtures, 'music');
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.category, null);
    assert.equal(catalogGroupLabel(at(groups, 0), 'music', catalogEn), null);
  });

  it('returns no groups for an empty tab', () => {
    assert.deepEqual(groupCatalogVersions(fixtures, 'sfx'), []);
    assert.deepEqual(groupCatalogVersions(fixtures, 'image'), []);
  });

  it('gives DOM-safe, unique group ids', () => {
    const all = [...groupCatalogVersions(fixtures, null), ...groupCatalogVersions(fixtures, 'template')];
    for (const group of all) assert.match(group.id, /^[a-z0-9-]+$/);
    assert.equal(new Set(all.map((group) => group.id)).size, all.length);
    assert.ok(all.some((group) => group.id === 'catalogo-grupo-template-9-16'));
  });
});

describe('catalogGroupLabel', () => {
  it('names kinds on the All tab and subtypes on a kind tab, in each locale', () => {
    const all = groupCatalogVersions(fixtures, null);
    assert.equal(catalogGroupLabel(at(all, 0), null, catalogEn), 'Templates');
    assert.equal(catalogGroupLabel(at(all, 0), null, catalogEs), 'Plantillas');
    assert.equal(catalogGroupLabel(at(all, 3), null, catalogPtBR), 'Músicas');
    const templates = groupCatalogVersions(fixtures, 'template');
    assert.equal(catalogGroupLabel(at(templates, 0), 'template', catalogEn), 'Vertical (9:16)');
    assert.equal(catalogGroupLabel(at(templates, 1), 'template', catalogPtBR), 'Horizontal (16:9)');
    const models = groupCatalogVersions(fixtures, 'ai-model');
    assert.equal(catalogGroupLabel(at(models, 0), 'ai-model', catalogPtBR), 'Clones de voz');
    assert.equal(catalogGroupLabel(at(models, 1), 'ai-model', catalogEn), 'Provider models');
    assert.equal(catalogGroupLabel(at(models, 1), 'ai-model', catalogEs), 'Modelos de proveedor');
  });
});

describe('countCatalogKinds', () => {
  it('counts per kind and the counts sum to the total', () => {
    const counts = countCatalogKinds(fixtures);
    assert.equal(counts.total, 7);
    assert.equal(counts.byKind.template, 3);
    assert.equal(counts.byKind['ai-model'], 2);
    assert.equal(counts.byKind.sfx, 0);
    assert.equal(
      Object.values(counts.byKind).reduce((sum, count) => sum + count, 0),
      counts.total,
    );
  });
});

describe('tab ids', () => {
  it('are stable and DOM-safe', () => {
    assert.equal(catalogTabId(null), 'catalogo-aba-todos');
    assert.equal(catalogTabId('brand-kit'), 'catalogo-aba-brand-kit');
    assert.equal(CATALOG_PANEL_ID, 'catalogo-painel');
  });
});
