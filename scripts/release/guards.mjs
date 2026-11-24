// Release guards that run before the build (ticket 05): the tag must name the version the app
// reports, and the pinned Node tarball must be a line of the gpgv-verified SHASUMS256.txt (vetting
// 0006 section 4 and correction 11). Pure functions: every input is passed in.
import { fail, requireReleaseVersion, requireSha256 } from './manifest.mjs';

const PRINTABLE_REF = /^[A-Za-z0-9._/-]{1,100}$/;

/** Untrusted ref names are echoed only when they hold no character a log could interpret. */
function printableRef(refName) {
  return typeof refName === 'string' && PRINTABLE_REF.test(refName) ? refName : '(unprintable ref name)';
}

/**
 * The tag a run releases. A tag ref must be exactly `v<apps/shell/package.json version>`; a manual
 * run on a branch is a dry run and renders for `v<version>` without any tag existing.
 */
export function resolveReleaseTag({ eventName, refType, refName, packageVersion }) {
  const version = requireReleaseVersion(packageVersion, 'apps/shell/package.json version');
  const expected = `v${version}`;
  if (refType === 'tag') {
    if (refName !== expected) fail(`tag ${printableRef(refName)} does not match apps/shell/package.json version ${version}; expected ${expected}.`);
    return expected;
  }
  if (eventName === 'workflow_dispatch' && refType === 'branch') return expected;
  fail(`a release runs on a v* tag or as a manual run on a branch; got ${printableRef(eventName)} on a ${printableRef(refType)} ref.`);
}

/** `https://nodejs.org/dist/v<version>/SHASUMS256.txt.asc`, the signed checksum list of the pin. */
export function nodeSignedSumsUrl(nodeVersion) {
  if (typeof nodeVersion !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(nodeVersion)) fail('the pinned Node version is not X.Y.Z.');
  return `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt.asc`;
}

/**
 * The verified SHASUMS256.txt must hold exactly one line for the pinned file, and that line must
 * carry the pinned SHA-256. The staging script then refuses any download with another hash.
 */
export function assertNodePinSigned({ sumsText, fileName, sha256 }) {
  requireSha256(sha256, 'the pinned Node sha256');
  if (typeof sumsText !== 'string' || sumsText.length === 0) fail('the verified SHASUMS256.txt is empty.');
  const lines = sumsText.split('\n').map((line) => line.trim()).filter((line) => line.endsWith(`  ${fileName}`));
  if (lines.length !== 1) fail(`the verified SHASUMS256.txt holds ${lines.length} lines for ${fileName}; expected exactly one.`);
  if (lines[0] !== `${sha256}  ${fileName}`) fail(`the signed SHA-256 of ${fileName} differs from NODE_TARBALL in apps/shell/scripts/lib/pins.mjs; review the pin.`);
}
