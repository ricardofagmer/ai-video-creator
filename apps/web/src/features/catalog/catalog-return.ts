/**
 * The catalog address (with its filters and tab) the modals go back to. Module state on purpose: it
 * lives as long as the client bundle, which is exactly the soft-navigation span a modal can exist in.
 */
let catalogReturnHref = '/catalogo';

export function rememberCatalogHref(href: string): void {
  catalogReturnHref = href;
}

export function catalogReturnTarget(): string {
  return catalogReturnHref;
}
