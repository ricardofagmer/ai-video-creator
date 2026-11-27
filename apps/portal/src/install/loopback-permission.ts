/**
 * Local Network Access permission for loopback (vetting 0006 section 2.2 items 2 and 4). Only the
 * name `loopback-network` is ever queried: `local-network-access` crashes the renderer of older
 * Chrome versions. Browsers that do not know the name throw, which reads as `unknown`.
 */
export type LoopbackPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export const LOOPBACK_PERMISSION_NAME = 'loopback-network';

/** The part of `PermissionStatus` the portal uses. */
export interface LoopbackPermissionStatus {
  readonly state: string;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * The part of `navigator.permissions` the portal uses. `PermissionName` in the DOM lib does not
 * list `loopback-network` yet, so the query takes a plain string name.
 */
export interface PermissionQuerier {
  query(descriptor: { name: string }): Promise<LoopbackPermissionStatus>;
}

export interface PermissionWatch {
  current: LoopbackPermission;
  /** Stops listening for changes. */
  stop: () => void;
}

/** Narrows the raw state string; anything else is `unknown`. */
export function toLoopbackPermission(state: string): LoopbackPermission {
  return state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown';
}

/**
 * Reads the permission and reports later changes (the user answers the prompt, or changes the
 * site setting). Never throws: an absent API or an unknown name gives `unknown` and no watch.
 */
export async function watchLoopbackPermission(
  permissions: PermissionQuerier | undefined,
  onChange: (permission: LoopbackPermission) => void,
): Promise<PermissionWatch> {
  if (permissions === undefined) return { current: 'unknown', stop: () => undefined };
  let status: LoopbackPermissionStatus;
  try {
    status = await permissions.query({ name: LOOPBACK_PERMISSION_NAME });
  } catch {
    // TypeError for an unknown permission name: this browser has no loopback permission to wait on.
    return { current: 'unknown', stop: () => undefined };
  }
  const listener = (): void => onChange(toLoopbackPermission(status.state));
  status.addEventListener('change', listener);
  return { current: toLoopbackPermission(status.state), stop: () => status.removeEventListener('change', listener) };
}

/** One reading without a listener, used again after a failed call (the user may have just answered). */
export async function readLoopbackPermission(permissions: PermissionQuerier | undefined): Promise<LoopbackPermission> {
  if (permissions === undefined) return 'unknown';
  try {
    return toLoopbackPermission((await permissions.query({ name: LOOPBACK_PERMISSION_NAME })).state);
  } catch {
    return 'unknown';
  }
}

/**
 * `navigator.permissions` seen through `PermissionQuerier`. Both `query` declarations are method
 * signatures, so TypeScript compares their parameters bivariantly and the browser object is
 * assignable as is; the browser rejects a name it does not know by throwing, handled above.
 * The object is returned whole (not a detached `query`) so the call keeps its receiver.
 */
export function browserPermissionQuerier(): PermissionQuerier | undefined {
  if (typeof navigator === 'undefined' || navigator.permissions === undefined) return undefined;
  const permissions: PermissionQuerier = navigator.permissions;
  return permissions;
}
