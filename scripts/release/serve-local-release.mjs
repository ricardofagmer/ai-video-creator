// Development only: serves the locally built installer (apps/shell/out/dmg/release) on this
// computer's loopback so the portal under `next dev` can show and download it before any release
// is published. It answers three things and nothing else: latest.json (contract C2 rev 2, built
// from the release records packaging wrote), the .dmg and the ffmpeg source archive.
//
//   node scripts/release/serve-local-release.mjs [--port 3101]
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3101;
const RELEASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'shell', 'out', 'dmg', 'release');

function readPort() {
  const { values } = parseArgs({ options: { port: { type: 'string' } } });
  if (values.port === undefined) return DEFAULT_PORT;
  const port = Number.parseInt(values.port, 10);
  if (!/^[0-9]{1,5}$/.test(values.port) || port < 1 || port > 65535) throw new Error('--port must be a number from 1 to 65535.');
  return port;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Builds latest.json and the closed list of files this server hands out. */
async function readRelease(origin) {
  const names = await readdir(RELEASE_DIR);
  const recordName = names.find((name) => name.endsWith('.dmg.json'));
  if (recordName === undefined) throw new Error(`no installer record in ${RELEASE_DIR}; run the package:dmg script first.`);
  const record = await readJson(join(RELEASE_DIR, recordName));
  const { sources } = await readJson(join(RELEASE_DIR, 'sources.json'));
  const published = await stat(join(RELEASE_DIR, record.file));
  const manifest = {
    version: record.version,
    publishedAt: published.mtime.toISOString(),
    assets: [{ platform: record.platform, file: record.file, url: `${origin}/${record.file}`, sha256: record.sha256, bytes: record.bytes }],
    sources: sources.map((source) => ({ name: source.name, licence: source.licence, url: `${origin}/${source.file}`, sha256: source.sha256 })),
  };
  return { manifest, files: new Set([record.file, ...sources.map((source) => source.file)]) };
}

const port = readPort();
const origin = `http://${HOST}:${port}`;

const server = createServer((request, response) => {
  respond(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

async function respond(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const name = decodeURIComponent(new URL(request.url ?? '/', origin).pathname.slice(1));
  const { manifest, files } = await readRelease(origin);
  if (name === 'latest.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(manifest));
    return;
  }
  // Only names from the release records are served, so no path from the request reaches the disk.
  if (!files.has(name)) {
    response.writeHead(404).end();
    return;
  }
  const path = join(RELEASE_DIR, name);
  const { size } = await stat(path);
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': size,
    'Content-Disposition': `attachment; filename="${name}"`,
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}

server.listen(port, HOST, () => {
  process.stdout.write(`local release at ${origin}/latest.json\n`);
});
