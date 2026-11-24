import { type AssetVersionView } from '@studio/shared/api';
import {
  AiModelDetailsSchema,
  AspectRatioSchema,
  ImageDetailsSchema,
  ReferenceDetailsSchema,
  assetKinds,
  type AiModelDetails,
  type AspectRatio,
  type AssetKind,
  type ImageDetails,
  type ReferenceDetails,
} from '@studio/shared/catalog';
import { type WebMessages } from '@/messages';

/**
 * The category of a catalog card inside its kind tab (design/telas/02). There is no `category` field
 * in C1, so it comes from the kind's own subtype in `details`; the other five kinds have none.
 */
export type CatalogCategory =
  | { kind: 'template'; value: AspectRatio }
  | { kind: 'ai-model'; value: AiModelDetails['modelType'] }
  | { kind: 'reference'; value: ReferenceDetails['subKind'] }
  | { kind: 'image'; value: ImageDetails['purpose'] };

export function categoryOf(version: AssetVersionView): CatalogCategory | null {
  switch (version.kind) {
    case 'template':
      return { kind: 'template', value: version.details.aspect };
    case 'ai-model':
      return { kind: 'ai-model', value: version.details.modelType };
    case 'reference':
      return { kind: 'reference', value: version.details.subKind };
    case 'image':
      return { kind: 'image', value: version.details.purpose };
    default:
      return null;
  }
}

/** Vertical first: it is the format of most templates and of TikTok, Shorts and Reels. */
const templateAspectOrder: readonly AspectRatio[] = ['9:16', ...AspectRatioSchema.options.filter((aspect) => aspect !== '9:16')];

/** Each subtype's values in schema order (vertical first for templates), which is the order of the sections. */
const categoryOrder: Partial<Record<AssetKind, readonly string[]>> = {
  template: templateAspectOrder,
  'ai-model': AiModelDetailsSchema.shape.modelType.options,
  reference: ReferenceDetailsSchema.shape.subKind.options,
  image: ImageDetailsSchema.shape.purpose.options,
};

export interface CatalogGroup {
  /** DOM-safe id of the section heading. */
  id: string;
  kind: AssetKind;
  category: CatalogCategory | null;
  versions: AssetVersionView[];
}

function domSafe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function groupId(kind: AssetKind, value: string | null): string {
  return value === null ? `catalogo-grupo-${domSafe(kind)}` : `catalogo-grupo-${domSafe(kind)}-${domSafe(value)}`;
}

/**
 * Sections of the active tab: the "All" tab (`null`) groups by kind in `assetKinds` order; a kind with a
 * subtype groups by its values in schema order; any other kind is one group without a category. Empty
 * groups are dropped and the api's order is kept inside each group.
 */
export function groupCatalogVersions(versions: readonly AssetVersionView[], tab: AssetKind | null): CatalogGroup[] {
  if (tab === null) {
    return assetKinds
      .map((kind) => ({ id: groupId(kind, null), kind, category: null, versions: versions.filter((version) => version.kind === kind) }))
      .filter((group) => group.versions.length > 0);
  }
  const ofTab = versions.filter((version) => version.kind === tab);
  const order = categoryOrder[tab];
  if (order === undefined) {
    return ofTab.length === 0 ? [] : [{ id: groupId(tab, null), kind: tab, category: null, versions: ofTab }];
  }
  const groups: CatalogGroup[] = [];
  for (const value of order) {
    const inGroup = ofTab.filter((version) => categoryOf(version)?.value === value);
    const category = inGroup[0] === undefined ? null : categoryOf(inGroup[0]);
    if (category !== null) groups.push({ id: groupId(tab, value), kind: tab, category, versions: inGroup });
  }
  return groups;
}

/** The section heading: the plural kind on the "All" tab, the subtype on a kind tab, none for a flat grid. */
export function catalogGroupLabel(group: CatalogGroup, tab: AssetKind | null, t: WebMessages['catalog']): string | null {
  if (tab === null) return t.tabs.kinds[group.kind];
  const category = group.category;
  if (category === null) return null;
  switch (category.kind) {
    case 'template':
      return t.categories.templateAspects[category.value];
    case 'ai-model':
      return t.categories.modelTypes[category.value];
    case 'reference':
      return t.categories.referenceSubKinds[category.value];
    case 'image':
      return t.categories.imagePurposes[category.value];
  }
}

export interface CatalogKindCounts {
  total: number;
  byKind: Record<AssetKind, number>;
  /** References with `subKind: 'website'`, counted in `byKind.reference` too; the Sites section shows them. */
  websites: number;
}

export function countCatalogKinds(versions: readonly AssetVersionView[]): CatalogKindCounts {
  const byKind: Record<AssetKind, number> = {
    template: 0,
    'ai-model': 0,
    reference: 0,
    prompt: 0,
    skill: 0,
    image: 0,
    music: 0,
    sfx: 0,
    'brand-kit': 0,
  };
  let websites = 0;
  for (const version of versions) {
    byKind[version.kind] += 1;
    if (version.kind === 'reference' && version.details.subKind === 'website') websites += 1;
  }
  return { total: versions.length, byKind, websites };
}

export const CATALOG_PANEL_ID = 'catalogo-painel';

export function catalogTabId(kind: AssetKind | null): string {
  return kind === null ? 'catalogo-aba-todos' : `catalogo-aba-${kind}`;
}
