// Ad hoc signing of every Mach-O inside `runtime/` (ticket 03, C3 rev 3, DI-AC-20): node, ffmpeg,
// ffprobe and every native addon or dylib of the payload, deepest path first, and any nested code
// bundle after its contents. The runtime sits in Contents/Resources, where `codesign --deep` on the
// app does not sign code, so it is signed here, before the app bundle is signed over it.
// No Developer ID is used (ticket 03); `-` is the ad hoc identity.
import { open } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import { fail, say } from './failure.mjs';
import { walkTree } from './hashing.mjs';

const CODESIGN = '/usr/bin/codesign';
const TOOL_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C' });
const BUNDLE_SUFFIXES = ['.app', '.framework', '.bundle', '.plugin', '.xpc'];
const SIGN_BATCH = 64;
/** A fat Mach-O holds a handful of slices; a Java class shares the magic but holds its version here. */
const MAX_FAT_SLICES = 20;

async function leadingBytes(filePath, count) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(count);
    const { bytesRead } = await handle.read(buffer, 0, count, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Thin 32/64-bit Mach-O (little endian on Apple Silicon) or a universal (fat) binary. */
export function isMachO(bytes) {
  if (bytes.length < 8) return false;
  const little = bytes.readUInt32LE(0);
  if (little === 0xfeedfacf || little === 0xfeedface) return true;
  const big = bytes.readUInt32BE(0);
  if (big !== 0xcafebabe && big !== 0xcafebabf) return false;
  const slices = bytes.readUInt32BE(4);
  return slices > 0 && slices < MAX_FAT_SLICES;
}

function depth(path) {
  return path.split('/').length;
}

/** Signing order: deepest first; at equal depth files before bundles, then by path for stability. */
export function signingOrder(targets) {
  return [...targets].sort(
    (left, right) =>
      depth(right.path) - depth(left.path) ||
      (left.kind === right.kind ? 0 : left.kind === 'file' ? -1 : 1) ||
      left.path.localeCompare(right.path),
  );
}

/** Mach-O files and nested code bundles under `root`; symlinks are never followed or signed. */
export async function findSignTargets(root) {
  const targets = [];
  for await (const entry of walkTree(root)) {
    if (entry.kind === 'directory' && BUNDLE_SUFFIXES.some((suffix) => entry.path.endsWith(suffix))) {
      targets.push({ path: entry.path, kind: 'bundle' });
    } else if (entry.kind === 'file' && isMachO(await leadingBytes(entry.path, 8))) {
      targets.push({ path: entry.path, kind: 'file' });
    }
  }
  return signingOrder(targets);
}

/**
 * Signs every target under `root` ad hoc, inside-out. Consecutive targets of the same depth and kind
 * share one codesign call (it takes many paths); a bundle is always signed after everything deeper.
 */
export async function signNestedCode({ run, root }) {
  const targets = await findSignTargets(root);
  let index = 0;
  while (index < targets.length) {
    const first = targets[index];
    const batch = [];
    while (index < targets.length && batch.length < SIGN_BATCH && targets[index].kind === first.kind && depth(targets[index].path) === depth(first.path)) {
      batch.push(targets[index].path);
      index += 1;
    }
    run(CODESIGN, ['--sign', '-', '--force', ...batch], { env: TOOL_ENV, what: `codesign of ${batch.length} nested item(s) at depth ${depth(first.path)}` });
  }
  say(`signed ${targets.length} nested Mach-O file(s) and bundle(s) ad hoc under ${root}`);
  return targets.length;
}

/** Strict verification of named programs, one call each so a failure names the program. */
export function verifyPrograms({ run, programs, root }) {
  for (const program of programs) {
    run(CODESIGN, ['--verify', '--strict', '--verbose=2', program], { env: TOOL_ENV, what: `codesign --verify ${relative(root, program) || basename(program)}` });
  }
}

/** After the bundle signature: every nested target still verifies inside the .app. */
export async function verifyNestedCode({ run, root }) {
  const targets = await findSignTargets(root);
  if (targets.length === 0) fail(`no Mach-O found under ${root}; the runtime was not copied into the app.`);
  verifyPrograms({ run, programs: targets.map((target) => target.path), root });
  say(`verified ${targets.length} nested signature(s) inside the app`);
}
