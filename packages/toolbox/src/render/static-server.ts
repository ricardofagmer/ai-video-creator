import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

// Media only: manifests and run.json hold unpublished scripts and reviewer data and are
// never served, even though they sit in the same folder.
const contentTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

interface ServeScope {
  root: string;
  host: string;
  pathPrefix: string;
}

export interface StaticServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Resolves a URL path to a real file inside root, or null (traversal, symlink escape, missing). */
async function resolveInsideRoot(root: string, urlPath: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const candidate = resolve(root, `.${decoded}`);
  if (!candidate.startsWith(root + sep)) return null;
  try {
    const real = await realpath(candidate);
    return real.startsWith(root + sep) ? real : null;
  } catch {
    return null;
  }
}

/** Parses a single "bytes=a-b" range; multi-range requests are served whole. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return 'unsatisfiable';
  let start: number;
  let end: number;
  if (startText === '') {
    start = Math.max(0, size - Number.parseInt(endText, 10));
    end = size - 1;
  } else {
    start = Number.parseInt(startText, 10);
    end = endText === '' ? size - 1 : Math.min(size - 1, Number.parseInt(endText, 10));
  }
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

async function handle(scope: ServeScope, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  // A Host other than our own address means DNS rebinding; an unknown prefix means a
  // page that is guessing ports. Both get the same 404 as a missing file.
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (request.headers.host !== scope.host || !pathname.startsWith(`${scope.pathPrefix}/`)) {
    response.writeHead(404).end();
    return;
  }
  const urlPath = pathname.slice(scope.pathPrefix.length);
  const filePath = await resolveInsideRoot(scope.root, urlPath);
  const contentType = filePath ? contentTypes[extname(filePath).toLowerCase()] : undefined;
  const info = filePath && contentType ? await stat(filePath) : null;
  if (!filePath || !contentType || !info || !info.isFile()) {
    response.writeHead(404).end();
    return;
  }
  const headers = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
  };
  const range = parseRange(request.headers.range, info.size);
  if (range === 'unsatisfiable') {
    response.writeHead(416, { ...headers, 'content-range': `bytes */${info.size}` }).end();
    return;
  }
  const { start, end } = range ?? { start: 0, end: info.size - 1 };
  const length = info.size === 0 ? 0 : end - start + 1;
  response.writeHead(range ? 206 : 200, {
    ...headers,
    'content-length': String(length),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}),
  });
  if (request.method === 'HEAD' || length === 0) {
    response.end();
    return;
  }
  createReadStream(filePath, { start, end }).on('error', () => response.destroy()).pipe(response);
}

/**
 * Serves one run folder's media to the local Remotion renderer: bound to 127.0.0.1 on a
 * random port under a random path token, read-only, media files only, nothing outside
 * the folder (traversal and symlinks rejected).
 */
export async function startStaticServer(rootDir: string): Promise<StaticServer> {
  const root = await realpath(rootDir);
  const scope: ServeScope = { root, host: '', pathPrefix: `/${randomBytes(16).toString('hex')}` };
  const server = createServer((request, response) => {
    handle(scope, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  const port = address !== null && typeof address === 'object' ? address.port : 0;
  scope.host = `127.0.0.1:${port}`;
  return {
    baseUrl: `http://${scope.host}${scope.pathPrefix}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.closeAllConnections();
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}
