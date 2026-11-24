/**
 * Categories the user creates from the Save as reference form. A saved item keeps its category as a tag
 * (`cat.<slug>`, valid under the catalog's tag rule), so the category travels with the item. The display
 * name, accents and capitals included, lives in a cookie on this browser, so both the form and the
 * server-rendered category tabs can show it; without the cookie the tab falls back to the slug.
 */
export const CUSTOM_CATEGORY_PREFIX = 'cat.';
export const CUSTOM_CATEGORY_LABEL_MAX = 40;
export const CUSTOM_CATEGORIES_COOKIE = 'studio_reference_categories';

const CUSTOM_CATEGORY_ID_MAX = 40;
const CUSTOM_CATEGORIES_MAX = 50;
const CUSTOM_CATEGORY_ID_PATTERN = /^cat\.[a-z0-9]+(-[a-z0-9]+)*$/;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 5;

export type CustomCategoryId = `cat.${string}`;

export interface CustomCategory {
  id: CustomCategoryId;
  label: string;
}

/** URL values and tags are untrusted input: only the `cat.<slug>` shape passes. */
export function customCategoryIdFrom(value: string): CustomCategoryId | null {
  if (value.length > CUSTOM_CATEGORY_ID_MAX || !CUSTOM_CATEGORY_ID_PATTERN.test(value)) return null;
  return `cat.${value.slice(CUSTOM_CATEGORY_PREFIX.length)}`;
}

/** The id for a typed name: accents dropped, lowercase words joined by `-`; null when nothing is left. */
export function customCategoryIdOf(label: string): CustomCategoryId | null {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CUSTOM_CATEGORY_ID_MAX - CUSTOM_CATEGORY_PREFIX.length)
    .replace(/-+$/, '');
  return slug === '' ? null : customCategoryIdFrom(`${CUSTOM_CATEGORY_PREFIX}${slug}`);
}

/** The name shown when this browser does not know the category: its slug with spaces, first letter up. */
export function customCategoryFallbackLabel(id: CustomCategoryId): string {
  const words = id.slice(CUSTOM_CATEGORY_PREFIX.length).replace(/-/g, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function customCategoryOf(entry: unknown): CustomCategory | null {
  if (typeof entry !== 'object' || entry === null || !('id' in entry) || !('label' in entry)) return null;
  const { id, label } = entry;
  if (typeof id !== 'string' || typeof label !== 'string') return null;
  const parsedId = customCategoryIdFrom(id);
  const trimmedLabel = label.trim().slice(0, CUSTOM_CATEGORY_LABEL_MAX);
  return parsedId === null || trimmedLabel === '' ? null : { id: parsedId, label: trimmedLabel };
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function decodedCookieValue(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

/** The cookie is untrusted input: anything that is not a valid, unique entry is dropped. */
export function customCategoriesFromCookie(raw: string | undefined): CustomCategory[] {
  if (raw === undefined || raw === '') return [];
  const decoded = raw.trimStart().startsWith('[') ? raw : decodedCookieValue(raw);
  const entries = decoded === null ? null : parsedJson(decoded);
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const categories: CustomCategory[] = [];
  for (const entry of entries.slice(0, CUSTOM_CATEGORIES_MAX)) {
    const category = customCategoryOf(entry);
    if (category === null || seen.has(category.id)) continue;
    seen.add(category.id);
    categories.push(category);
  }
  return categories;
}

/** The `document.cookie` assignment that keeps the list for five years on every studio page. */
export function customCategoriesCookie(categories: readonly CustomCategory[]): string {
  const value = encodeURIComponent(JSON.stringify(categories.slice(-CUSTOM_CATEGORIES_MAX)));
  return `${CUSTOM_CATEGORIES_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Labels by id, for the category tabs. */
export function customCategoryLabels(categories: readonly CustomCategory[]): ReadonlyMap<string, string> {
  return new Map(categories.map((category) => [category.id, category.label]));
}
