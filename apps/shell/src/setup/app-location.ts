import { type AppLocationProblem } from './setup-types';

/*
 * Step 0 (plan section 9, vetting 0006 section 9 item 10, DI-AC-24). Gatekeeper may run an unmoved
 * app from a randomized read-only path (App Translocation), and an app opened straight from the
 * `.dmg` runs from the mounted volume. Setup writes absolute paths into the watcher's launchd plist,
 * so either location would leave an agent pointing at a path that disappears.
 */

const TRANSLOCATION_SEGMENT = '/AppTranslocation/';
/** Mounted disk images, the `.dmg` included, appear under `/Volumes/`. */
const MOUNTED_VOLUMES_PREFIX = '/Volumes/';

export type AppLocationVerdict = { readonly kind: 'stable' } | { readonly kind: 'unstable'; readonly problem: AppLocationProblem };

/** Pure rule over the app bundle's own absolute path (`/Applications/<name>.app`). */
export function assessAppLocation(appBundlePath: string): AppLocationVerdict {
  if (appBundlePath.includes(TRANSLOCATION_SEGMENT)) return { kind: 'unstable', problem: 'translocated' };
  if (appBundlePath.startsWith(MOUNTED_VOLUMES_PREFIX)) return { kind: 'unstable', problem: 'disk-image' };
  return { kind: 'stable' };
}
