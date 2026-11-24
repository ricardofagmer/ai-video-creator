/*
 * What the menu model needs to know about the portal entries. Plain data only: no URL, no pair
 * code, no download address ever reaches the menu model; the click handler asks the portal module.
 */

export type PortalAction = 'connect' | 'disconnect';

export type PortalLinkReport =
  | { readonly action: 'connect'; readonly outcome: 'opened' }
  | { readonly action: 'connect'; readonly outcome: 'failed' }
  | { readonly action: 'disconnect'; readonly outcome: 'revoked'; readonly revoked: number }
  | { readonly action: 'disconnect'; readonly outcome: 'failed' };

/** One CLI call at a time, as the start/stop invoker does. */
export type PortalLinkStatus =
  | { readonly phase: 'idle'; readonly last: PortalLinkReport | null }
  | { readonly phase: 'running'; readonly action: PortalAction };

/** `not-configured` covers an invalid value too: the menu explains, it never guesses an address. */
export type PortalAvailability = 'configured' | 'not-configured';

export type UpdateStatus =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'not-checked' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'current' }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'failed' };

export interface PortalMenuState {
  readonly availability: PortalAvailability;
  readonly link: PortalLinkStatus;
  readonly update: UpdateStatus;
}

/** Before the first render: nothing configured, nothing checked. */
export const INITIAL_PORTAL_MENU_STATE: PortalMenuState = {
  availability: 'not-configured',
  link: { phase: 'idle', last: null },
  update: { kind: 'not-configured' },
};
