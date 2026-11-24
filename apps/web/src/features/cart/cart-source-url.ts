import { httpsUrlFrom } from '@/features/common/https-url';
import { type CartItem } from './cart-store';

/** Same cap as the brief's `sourceUrl`. */
export const CART_SOURCE_URL_MAX = 2048;

/** The page link of the first website reference in the cart, in cart order; null when there is none. */
export function firstCartSiteUrl(cart: readonly CartItem[]): string | null {
  for (const item of cart) {
    if (item.siteUrl === undefined) continue;
    const url = httpsUrlFrom(item.siteUrl, CART_SOURCE_URL_MAX);
    if (url !== null) return url.href;
  }
  return null;
}

/** What the checkout site field shows: the owner's own text once typed (even empty), else the cart's first site. */
export function checkoutSourceUrlText(typed: string | null, cart: readonly CartItem[]): string {
  return typed ?? firstCartSiteUrl(cart) ?? '';
}

/**
 * docs/specs/2026-11-23-site-analysis-design.md: site analysis runs only on `https:` pages, so the
 * checkout carries only a valid `https:` address (normalized, trimmed); anything else carries nothing.
 */
export function checkoutSourceUrlFrom(text: string): string | null {
  return httpsUrlFrom(text, CART_SOURCE_URL_MAX)?.href ?? null;
}
