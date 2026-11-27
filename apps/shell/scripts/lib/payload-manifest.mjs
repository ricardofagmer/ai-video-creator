// `payload/manifest.json` of C3 rev 3: `{ version, builtAt, files: { <relative path>: <sha-256> } }`
// over every regular file under payload/ (symlinks are recorded by the tree, not hashed; the manifest
// itself is left out). Written after nested Mach-O signing, because signing rewrites those files, and
// verified again on the copy inside the .app so the shipped bytes are the recorded ones.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fail, isRecord, say } from './failure.mjs';
import { sha256File, walkTree } from './hashing.mjs';

const MANIFEST_NAME = 'manifest.json';

async function hashPayload(payloadRoot, manifestFile) {
  const files = {};
  for await (const entry of walkTree(payloadRoot)) {
    if (entry.kind !== 'file' || entry.path === manifestFile) continue;
    files[entry.relative] = await sha256File(entry.path);
  }
  return files;
}

/** `clock` is injected so the module stays deterministic under test; it returns a Date. */
export async function writePayloadManifest({ payloadRoot, manifestFile, version, clock = () => new Date() }) {
  if (manifestFile !== join(payloadRoot, MANIFEST_NAME)) fail('the locator moved payload/manifest.json; staging must follow it.');
  const files = await hashPayload(payloadRoot, manifestFile);
  const manifest = { version, builtAt: clock().toISOString(), files };
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  say(`payload manifest: ${Object.keys(files).length} files, version ${version}`);
  return manifest;
}

/** Re-hashes `payloadRoot` and fails on any added, missing or changed file. */
export async function verifyPayloadManifest({ payloadRoot, manifestFile }) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  } catch {
    fail(`cannot read ${manifestFile}.`);
  }
  if (!isRecord(manifest) || !isRecord(manifest.files)) fail(`${manifestFile} has no files map.`);
  const actual = await hashPayload(payloadRoot, manifestFile);
  const recorded = manifest.files;
  const differences = [];
  for (const [path, hash] of Object.entries(actual)) {
    if (recorded[path] === undefined) differences.push(`added ${path}`);
    else if (recorded[path] !== hash) differences.push(`changed ${path}`);
  }
  for (const path of Object.keys(recorded)) if (actual[path] === undefined) differences.push(`missing ${path}`);
  if (differences.length > 0) {
    fail(`payload differs from manifest.json (${differences.length}): ${differences.slice(0, 10).join(', ')}${differences.length > 10 ? ', ...' : ''}`);
  }
  say(`payload manifest verified: ${Object.keys(actual).length} files match`);
}
