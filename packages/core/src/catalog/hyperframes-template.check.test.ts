import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ContentStore } from '../asset-store';
import { DataHome } from '../paths/data-home';
import { InvalidAssetInputError, type InputIssue } from './catalog.errors';
import { HyperframesTemplateCheck } from './hyperframes-template.check';

/*
 * Folder checks of a HyperFrames template version (SPEC 0008 sections 4.3 and 5.4, AC 76, folder
 * part): new content and reused stored content must pass `templateFolderIssues`, or the version is
 * refused with the issue list. Remotion versions are not checked. Every data home and template
 * folder is a fresh temporary folder; the repository seed template is only read.
 */

const SEED_TEMPLATE_FOLDER = resolve(__dirname, '..', '..', '..', '..', 'seeds', 'templates', 'hyperframes', 'title-card');
const SELF_CONTAINED_INDEX = '<!doctype html><html><body><div id="root" data-no-timeline><h1>Title</h1></div></body></html>';
const MAX_FOLDER_BYTES = 10 * 1024 * 1024;

function templateDetails(engine: 'hyperframes' | 'remotion'): Record<string, unknown> {
  return {
    engine,
    compositionId: 'TitleCard',
    canvas: { width: 1080, height: 1920 },
    aspect: '9:16',
    fps: 30,
    duration: { minSec: 3, maxSec: 30 },
    inputSchema: { type: 'object', additionalProperties: false, required: [], properties: { title: { type: 'string' } } },
    sceneSchema: null,
    cameraMoves: [],
    transitions: [],
  };
}

async function rejectedIssues(action: Promise<void>): Promise<readonly InputIssue[]> {
  try {
    await action;
  } catch (error) {
    if (error instanceof InvalidAssetInputError) return error.issues;
    throw error;
  }
  assert.fail('expected the content to be refused');
}

function issueCodes(issues: readonly InputIssue[]): string[] {
  return issues.map((issue) => issue.message.split(':', 1)[0] ?? '');
}

describe('HyperframesTemplateCheck (AC 76)', () => {
  let root: string;
  let store: ContentStore;
  let check: HyperframesTemplateCheck;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-hyperframes-check-')));
    store = new ContentStore(new DataHome(join(root, 'home')));
    check = new HyperframesTemplateCheck(store);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A template folder under the temp root, one file per entry of `files`. */
  async function templateFolder(name: string, files: Record<string, string>): Promise<string> {
    const folder = join(root, 'sources', name);
    for (const [relativePath, text] of Object.entries(files)) {
      const filePath = join(folder, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, text);
    }
    return folder;
  }

  describe('new folder content', () => {
    it('accepts the repository seed template', async () => {
      await check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: SEED_TEMPLATE_FOLDER });
    });

    it('accepts a self-contained folder with an inline data: image', async () => {
      const folder = await templateFolder('inline-image', {
        'index.html': '<!doctype html><html><body><div data-no-timeline><img src="data:image/png;base64,iVBORw0KGgo=" alt="" /></div></body></html>',
      });

      await check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: folder });
    });

    it('refuses a folder with a remote reference, naming the file', async () => {
      const folder = await templateFolder('remote-image', {
        'index.html': '<!doctype html><html><body><div data-no-timeline><img src="https://cdn.example.com/logo.png" alt="" /></div></body></html>',
      });

      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: folder }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-reference-scheme']);
      assert.equal(issues[0]?.path, 'content.index.html');
    });

    it('refuses a folder without index.html', async () => {
      const folder = await templateFolder('no-index', { 'main.html': '<html><body><script>window.__timelines = {};</script></body></html>' });

      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: folder }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-index-missing']);
    });

    it('refuses a folder holding a shell script', async () => {
      const folder = await templateFolder('with-script', { 'index.html': SELF_CONTAINED_INDEX, 'render.sh': 'exit 0\n' });

      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: folder }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-extension-not-allowed']);
    });

    it('refuses a folder whose stylesheet imports a remote file', async () => {
      const folder = await templateFolder('remote-import', {
        'index.html': '<!doctype html><html><head><link rel="stylesheet" href="style.css" /></head><body><div data-no-timeline></div></body></html>',
        'style.css': '@import "https://fonts.example.com/brand.css";\n',
      });

      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'import-folder', absolutePath: folder }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-reference-scheme']);
      assert.equal(issues[0]?.path, 'content.style.css');
    });

    it('checks a folder registered by reference the same way', async () => {
      const folder = await templateFolder('reference-remote', {
        'index.html': '<!doctype html><html><body><div data-no-timeline><img src="//cdn.example.com/logo.png" alt="" /></div></body></html>',
      });

      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'reference-folder', absolutePath: folder }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-reference-protocol-relative']);
    });

    it('refuses content that is not a folder', async () => {
      const issues = await rejectedIssues(
        check.assertNewContent('template', templateDetails('hyperframes'), { source: 'inline', text: SELF_CONTAINED_INDEX, mimeType: 'text/html' }),
      );

      assert.deepEqual(issues, [{ path: 'content.source', message: 'a HyperFrames template is a folder' }]);
    });

    it('does not check a Remotion template folder', async () => {
      const folder = await templateFolder('remotion-remote', {
        'index.html': '<html><body><img src="https://cdn.example.com/logo.png" alt="" /></body></html>',
        'render.sh': 'exit 0\n',
      });

      await check.assertNewContent('template', templateDetails('remotion'), { source: 'import-folder', absolutePath: folder });
    });

    it('does not check a Remotion template given as a single file', async () => {
      await check.assertNewContent('template', templateDetails('remotion'), { source: 'inline', text: '{}', mimeType: 'application/json' });
    });
  });

  describe('reused stored content', () => {
    it('accepts the stored seed template', async () => {
      const stored = await store.putFolder(SEED_TEMPLATE_FOLDER, { maxTotalBytes: MAX_FOLDER_BYTES });

      await check.assertReusedContent('template', templateDetails('hyperframes'), {
        layout: 'folder',
        storage: { mode: 'store' },
        contentHash: stored.contentHash,
      });
    });

    it('refuses a stored folder that fails section 4.3, from its manifest', async () => {
      const folder = await templateFolder('stored-remote', {
        'index.html': '<!doctype html><html><body><div id="root"><img src="https://cdn.example.com/logo.png" alt="" /></div></body></html>',
      });
      const stored = await store.putFolder(folder, { maxTotalBytes: MAX_FOLDER_BYTES });

      const issues = await rejectedIssues(
        check.assertReusedContent('template', templateDetails('hyperframes'), {
          layout: 'folder',
          storage: { mode: 'store' },
          contentHash: stored.contentHash,
        }),
      );

      assert.deepEqual([...issueCodes(issues)].sort(), ['folder-reference-scheme', 'folder-timeline-marker-missing']);
    });

    it('refuses reused bytes that are a single file', async () => {
      const issues = await rejectedIssues(
        check.assertReusedContent('template', templateDetails('hyperframes'), {
          layout: 'file',
          storage: { mode: 'store' },
          contentHash: 'a'.repeat(64),
        }),
      );

      assert.deepEqual(issues, [{ path: 'content.version', message: 'a HyperFrames template is a folder' }]);
    });

    it('refuses a referenced folder that fails section 4.3', async () => {
      const folder = await templateFolder('referenced-markdown', { 'index.html': SELF_CONTAINED_INDEX, 'notes.md': '# notes\n' });

      const issues = await rejectedIssues(
        check.assertReusedContent('template', templateDetails('hyperframes'), {
          layout: 'folder',
          storage: { mode: 'reference', absolutePath: folder },
          contentHash: 'b'.repeat(64),
        }),
      );

      assert.deepEqual(issueCodes(issues), ['folder-extension-not-allowed']);
    });

    it('does not check reused Remotion bytes', async () => {
      await check.assertReusedContent('template', templateDetails('remotion'), {
        layout: 'file',
        storage: { mode: 'store' },
        contentHash: 'a'.repeat(64),
      });
    });
  });
});
