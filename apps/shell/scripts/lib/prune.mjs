// Removes native binaries that cannot run on darwin-arm64 from a staged tree (C3 rev 3, vetting 0006
// sections 6.2 to 6.4): onnxruntime-node's linux / win32 / darwin-x64 folders (about 206 MB), Prisma
// engines for other targets, argon2 platform packages for other targets, then any ELF or Windows PE
// binary left anywhere. The duplicate libonnxruntime.1.31.1.dylib is kept (vetting 6.3).
import { open, rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { say } from './failure.mjs';
import { walkTree } from './hashing.mjs';

const TARGET = 'darwin-arm64';
const ONNX_FOREIGN_FOLDERS = ['bin/napi-v6/linux', 'bin/napi-v6/win32', 'bin/napi-v6/darwin/x64'];
const PRISMA_ENGINE_PATTERN = /^(libquery_engine|query_engine|query-engine|schema-engine|migration-engine)-/;
const ARGON2_PLATFORM_PATTERN = /^argon2-(.+)$/;
const PE_EXTENSIONS = ['.dll', '.exe', '.node'];

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

function isElf(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
}

function isPe(bytes, filePath) {
  return bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a && PE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

/** Decides from one walked entry whether it is foreign; pure apart from reading magic bytes. */
async function isForeign(entry) {
  const name = basename(entry.relative);
  const parent = dirname(entry.relative);
  if (entry.kind === 'directory') {
    if (ONNX_FOREIGN_FOLDERS.some((folder) => entry.relative.endsWith(`onnxruntime-node/${folder}`))) return true;
    const argon2 = ARGON2_PLATFORM_PATTERN.exec(name);
    return argon2 !== null && basename(parent) === '@node-rs' && argon2[1] !== TARGET;
  }
  if (entry.kind !== 'file') return false;
  if (PRISMA_ENGINE_PATTERN.test(name) && !name.includes(TARGET)) return true;
  const bytes = await leadingBytes(entry.path, 4);
  return isElf(bytes) || isPe(bytes, entry.path);
}

/** Returns { removed, folders } counts; a removed folder's contents are not visited again. */
export async function pruneForeignBinaries(root) {
  const doomed = [];
  for await (const entry of walkTree(root)) {
    if (doomed.some((path) => entry.path.startsWith(`${path}/`))) continue;
    if (await isForeign(entry)) doomed.push(entry.path);
  }
  for (const path of doomed) await rm(path, { recursive: true, force: true });
  say(`pruned ${doomed.length} non-${TARGET} native entries under ${root}`);
  return doomed.length;
}
