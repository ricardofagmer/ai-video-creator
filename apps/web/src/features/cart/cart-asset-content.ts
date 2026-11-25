import { type AssetVersionView } from '@studio/shared/api';
import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { browserStudioClient } from '@/lib/api';
import { type CartItem } from './cart-store';

/** What checkout reads of one cart item to write the video prompt: the version, and the text of a prompt or skill. */
export interface CartAssetContent {
  version: AssetVersionView;
  /** Entry file of a prompt or skill as text; null for the other kinds. */
  text: string | null;
}

export interface CartAssetContents {
  byRef: ReadonlyMap<string, CartAssetContent>;
  /** Names of the items whose content could not be read; the prompt lists them by name and ref only. */
  failed: readonly string[];
}

export const EMPTY_CART_ASSET_CONTENTS: CartAssetContents = { byRef: new Map(), failed: [] };

const TEXT_KINDS: ReadonlySet<CartItem['kind']> = new Set(['prompt', 'skill']);

async function loadOne(item: CartItem): Promise<CartAssetContent> {
  const { assetId, version } = parseAssetRef(AssetRefSchema.parse(item.ref));
  const [view, entry] = await Promise.all([
    browserStudioClient.getAssetVersion(assetId, version),
    TEXT_KINDS.has(item.kind) ? browserStudioClient.readEntryFile(assetId, version) : null,
  ]);
  return { version: view, text: entry === null ? null : entry.text.trim() };
}

/** Reads every cart item's version, and prompt and skill texts, in the browser. Biometric items are never read. */
export async function loadCartAssetContents(cart: readonly CartItem[]): Promise<CartAssetContents> {
  const byRef = new Map<string, CartAssetContent>();
  const failed: string[] = [];
  await Promise.all(
    cart
      .filter((item) => item.sensitivity !== 'biometric')
      .map(async (item) => {
        try {
          byRef.set(item.ref, await loadOne(item));
        } catch {
          failed.push(item.name);
        }
      }),
  );
  return { byRef, failed };
}
