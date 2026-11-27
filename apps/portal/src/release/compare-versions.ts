/**
 * Semantic Versioning 2.0.0 precedence (section 11) for `MAJOR.MINOR.PATCH[-pre]`, the shape
 * `InstallVersionSchema` accepts. Build metadata is not part of that shape. Returns a negative
 * number when `left` is older, zero when equal, positive when newer.
 */
export function compareVersions(left: string, right: string): number {
  const a = splitVersion(left);
  const b = splitVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return comparePreRelease(a.preRelease, b.preRelease);
}

/** True when the release manifest names a version above the installed one (DI-AC-17). */
export function isUpdateAvailable(installed: string, latest: string): boolean {
  return compareVersions(latest, installed) > 0;
}

interface SplitVersion {
  core: readonly number[];
  preRelease: readonly string[];
}

function splitVersion(version: string): SplitVersion {
  const dash = version.indexOf('-');
  const corePart = dash === -1 ? version : version.slice(0, dash);
  const prePart = dash === -1 ? '' : version.slice(dash + 1);
  return {
    core: corePart.split('.').map((part) => Number.parseInt(part, 10)),
    preRelease: prePart === '' ? [] : prePart.split('.'),
  };
}

const NUMERIC = /^[0-9]+$/;

function comparePreRelease(a: readonly string[], b: readonly string[]): number {
  // A release outranks any pre-release of the same core version.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const difference = compareIdentifier(left, right);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = NUMERIC.test(left);
  const rightNumeric = NUMERIC.test(right);
  if (leftNumeric && rightNumeric) return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  // Numeric identifiers have lower precedence than alphanumeric ones.
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}
