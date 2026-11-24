// Publishes `latest.json` to the `release-manifest` branch (plan rev 3 section 9.1): a release
// download URL redirects without CORS headers, so the portal reads the manifest from that branch's
// raw address. The branch is orphan and holds only `latest.json`; every publish is one commit whose
// tree is that single file. Uses the GitHub Git Data API with the workflow token, so no git
// credentials are persisted on disk. The HTTP client is injected; the token never appears in output.
import { MANIFEST_FILE, compareReleaseVersions, fail, isRecord, serializeManifest, validateManifest } from './manifest.mjs';

export const MANIFEST_BRANCH = 'release-manifest';
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const OBJECT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const API_VERSION = '2022-11-28';

/** Thin GitHub REST client over an injected `fetch`. Answers `{ status, body }`. */
export function createGitHubClient({ apiUrl, token, repository, fetchImpl }) {
  const api = new URL(apiUrl);
  if (api.protocol !== 'https:' || api.username !== '' || api.password !== '' || api.search !== '') fail('the GitHub API URL must be a plain https URL.');
  if (typeof token !== 'string' || token.length === 0) fail('GITHUB_TOKEN is not set for the manifest branch publish.');
  if (typeof repository !== 'string' || !REPOSITORY_PATTERN.test(repository) || repository.includes('..')) fail('the repository is not <owner>/<name>.');
  const root = `${api.href.replace(/\/$/, '')}/repos/${repository}`;
  return async function request(method, path, payload) {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': API_VERSION,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    let body;
    try {
      body = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    return { status: response.status, body };
  };
}

function apiFailure(step, response) {
  const message = isRecord(response.body) && typeof response.body.message === 'string' ? response.body.message.slice(0, 200) : 'no message';
  return fail(`GitHub API ${step} answered ${response.status} (${message}).`);
}

function requireObjectId(response, step, pick) {
  const value = isRecord(response.body) ? pick(response.body) : undefined;
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) fail(`GitHub API ${step} returned no object id.`);
  return value;
}

/** Head commit of the branch, or undefined when the branch does not exist yet. */
async function readBranchHead(request) {
  const response = await request('GET', `/git/ref/heads/${MANIFEST_BRANCH}`);
  if (response.status === 404) return undefined;
  if (response.status !== 200) return apiFailure('read branch ref', response);
  return requireObjectId(response, 'read branch ref', (body) => (isRecord(body.object) ? body.object.sha : undefined));
}

/** Version currently on the branch, or undefined when the branch carries no readable manifest. */
async function readPublishedVersion(request) {
  const response = await request('GET', `/contents/${MANIFEST_FILE}?ref=${MANIFEST_BRANCH}`);
  if (response.status === 404) return undefined;
  if (response.status !== 200) return apiFailure('read published manifest', response);
  const content = isRecord(response.body) ? response.body.content : undefined;
  if (typeof content !== 'string') fail(`the ${MANIFEST_BRANCH} branch ${MANIFEST_FILE} could not be read; fix the branch by hand before publishing.`);
  try {
    return validateManifest(JSON.parse(Buffer.from(content, 'base64').toString('utf8'))).version;
  } catch {
    fail(`the ${MANIFEST_BRANCH} branch holds an invalid ${MANIFEST_FILE}; fix the branch by hand before publishing.`);
  }
}

async function expectCreated(request, step, path, payload) {
  const response = await request('POST', path, payload);
  if (response.status !== 201) apiFailure(step, response);
  return response;
}

/**
 * Writes the manifest as the only file of the branch. Refuses to replace a newer version, so an
 * older tag pushed later cannot roll the portal back; the same version is rewritten (a re-run).
 */
export async function publishManifestBranch({ request, manifest }) {
  const checked = validateManifest(manifest);
  const head = await readBranchHead(request);
  if (head !== undefined) {
    const published = await readPublishedVersion(request);
    if (published !== undefined && compareReleaseVersions(published, checked.version) > 0) {
      fail(`the ${MANIFEST_BRANCH} branch already names ${published}, newer than ${checked.version}; nothing was published to the branch.`);
    }
  }
  const blob = await expectCreated(request, 'create blob', '/git/blobs', { content: serializeManifest(checked), encoding: 'utf-8' });
  const blobId = requireObjectId(blob, 'create blob', (body) => body.sha);
  const tree = await expectCreated(request, 'create tree', '/git/trees', { tree: [{ path: MANIFEST_FILE, mode: '100644', type: 'blob', sha: blobId }] });
  const treeId = requireObjectId(tree, 'create tree', (body) => body.sha);
  const commit = await expectCreated(request, 'create commit', '/git/commits', {
    message: `release: latest.json for ${checked.version}`,
    tree: treeId,
    parents: head === undefined ? [] : [head],
  });
  const commitId = requireObjectId(commit, 'create commit', (body) => body.sha);
  if (head === undefined) {
    await expectCreated(request, 'create branch', '/git/refs', { ref: `refs/heads/${MANIFEST_BRANCH}`, sha: commitId });
  } else {
    const updated = await request('PATCH', `/git/refs/heads/${MANIFEST_BRANCH}`, { sha: commitId, force: false });
    if (updated.status !== 200) apiFailure('update branch', updated);
  }
  return { branch: MANIFEST_BRANCH, commit: commitId, version: checked.version, created: head === undefined };
}
