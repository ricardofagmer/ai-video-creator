import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { templateFolderIssues, type TemplateFolderEntry } from './template-folder';
import { type TemplateIssueCode } from './template-issues';

/*
 * Folder rules of a HyperFrames template (SPEC 0008 section 4.3, AC 77). Every refusal case
 * starts from a self-contained folder and breaks one rule; the repository seed template is read
 * from disk, read-only, and must pass as it is.
 */

const SEED_TEMPLATE_FOLDER = resolve(__dirname, '..', '..', '..', '..', 'seeds', 'templates', 'hyperframes', 'title-card');
const TEXT_EXTENSIONS = ['.html', '.css', '.svg', '.js'];

function file(path: string, text: string | null = null): TemplateFolderEntry {
  return { path, type: 'file', text };
}

/** An `index.html` whose composition root carries `data-no-timeline` and holds `body`. */
function indexWith(body: string): TemplateFolderEntry {
  return file(
    'index.html',
    `<!doctype html><html><head><meta charset="utf-8" /></head><body><div id="root" data-no-timeline>${body}</div></body></html>`,
  );
}

/** A self-contained folder: the plain index plus `extra` entries. */
function folderWith(...extra: TemplateFolderEntry[]): TemplateFolderEntry[] {
  return [indexWith(''), ...extra];
}

function codesOf(entries: readonly TemplateFolderEntry[]): TemplateIssueCode[] {
  return templateFolderIssues(entries).map((issue) => issue.code);
}

function onlyIssue(entries: readonly TemplateFolderEntry[]): { code: TemplateIssueCode; at: string | null } {
  const issues = templateFolderIssues(entries);
  assert.equal(issues.length, 1, `expected exactly one issue, got ${JSON.stringify(issues)}`);
  const [issue] = issues;
  if (issue === undefined) assert.fail('expected one issue');
  return { code: issue.code, at: issue.at };
}

/**
 * Lists a folder the way the catalog check does: no link followed, text only for scanned
 * extensions, and the Finder `.DS_Store` skipped like the catalog folder walk skips it.
 */
function entriesFromDisk(root: string, relative = ''): TemplateFolderEntry[] {
  const directory = relative === '' ? root : join(root, relative);
  return readdirSync(directory).flatMap((name): TemplateFolderEntry[] => {
    if (name === '.DS_Store') return [];
    const path = relative === '' ? name : `${relative}/${name}`;
    const absolutePath = join(root, path);
    const stats = lstatSync(absolutePath);
    if (stats.isDirectory()) return entriesFromDisk(root, path);
    if (stats.isSymbolicLink()) return [{ path, type: 'symlink', text: null }];
    if (!stats.isFile()) return [{ path, type: 'other', text: null }];
    const readsText = TEXT_EXTENSIONS.some((extension) => path.endsWith(extension));
    return [file(path, readsText ? readFileSync(absolutePath, 'utf8') : null)];
  });
}

describe('templateFolderIssues: accepted folders (AC 77)', () => {
  it('accepts the repository seed template', () => {
    const entries = entriesFromDisk(SEED_TEMPLATE_FOLDER);
    assert.ok(entries.some((entry) => entry.path === 'index.html'), 'the seed fixture must hold index.html');

    assert.deepEqual(templateFolderIssues(entries), []);
  });

  it('accepts an inline data: image in src', () => {
    assert.deepEqual(templateFolderIssues([indexWith('<img src="data:image/png;base64,iVBORw0KGgo=" alt="" />')]), []);
  });

  it('accepts an inline data: image in a CSS url()', () => {
    assert.deepEqual(templateFolderIssues(folderWith(file('style.css', 'body { background: url("data:image/png;base64,iVBORw0KGgo="); }'))), []);
  });

  it('accepts relative references that stay inside the folder', () => {
    const entries = [
      indexWith('<link rel="stylesheet" href="style.css" /><img src="assets/logo.png" srcset="assets/logo.png 1x, assets/logo-2x.png 2x" />'),
      file('style.css', '@import "fonts.css"; body { background: url(assets/bg.webp); }'),
      file('fonts.css', '@font-face { font-family: Brand; src: url("./assets/brand.woff2"); }'),
      file('assets/logo.png'),
      file('assets/logo-2x.png'),
      file('assets/bg.webp'),
      file('assets/brand.woff2'),
    ];

    assert.deepEqual(templateFolderIssues(entries), []);
  });

  it('accepts fragment-only and empty references', () => {
    assert.deepEqual(templateFolderIssues([indexWith('<a href="#top">top</a><img src="" alt="" />')]), []);
  });

  it('does not treat the SVG xmlns namespace attributes as references', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#shape" /></svg>';

    assert.deepEqual(templateFolderIssues(folderWith(file('logo.svg', svg))), []);
  });

  it('does not scan script files for URLs', () => {
    assert.deepEqual(templateFolderIssues(folderWith(file('vendor.js', '/* Homepage: https://example.com/library */'))), []);
  });

  it('accepts a timeline defined by a script instead of data-no-timeline', () => {
    const entries = [
      file('index.html', '<!doctype html><html><body><div id="root"></div><script src="timeline.js"></script></body></html>'),
      file('timeline.js', 'window.__timelines = window.__timelines || {};'),
    ];

    assert.deepEqual(templateFolderIssues(entries), []);
  });
});

describe('templateFolderIssues: AC 77 refusals, one issue each', () => {
  it('rejects https:// in src', () => {
    const issue = onlyIssue([indexWith('<img src="https://cdn.example.com/logo.png" alt="" />')]);

    assert.deepEqual(issue, { code: 'folder-reference-scheme', at: 'index.html' });
  });

  it('rejects //host in href', () => {
    const issue = onlyIssue([indexWith('<link rel="stylesheet" href="//cdn.example.com/style.css" />')]);

    assert.deepEqual(issue, { code: 'folder-reference-protocol-relative', at: 'index.html' });
  });

  it('rejects url(http...) in a stylesheet', () => {
    const issue = onlyIssue(folderWith(file('style.css', 'body { background: url(http://cdn.example.com/bg.png); }')));

    assert.deepEqual(issue, { code: 'folder-reference-scheme', at: 'style.css' });
  });

  it('rejects a remote @import', () => {
    const issue = onlyIssue(folderWith(file('style.css', '@import "https://fonts.example.com/brand.css";')));

    assert.deepEqual(issue, { code: 'folder-reference-scheme', at: 'style.css' });
  });

  it('rejects a remote @import written with url()', () => {
    const codes = codesOf(folderWith(file('style.css', '@import url("https://fonts.example.com/brand.css");')));

    assert.ok(codes.length > 0);
    assert.ok(codes.every((code) => code === 'folder-reference-scheme'));
  });

  it('rejects an absolute reference path', () => {
    const issue = onlyIssue([indexWith('<img src="/images/logo.png" alt="" />')]);

    assert.deepEqual(issue, { code: 'folder-reference-absolute', at: 'index.html' });
  });

  it('rejects an absolute file path in the listing', () => {
    const issue = onlyIssue(folderWith(file('/etc/style.css', 'body {}')));

    assert.deepEqual(issue, { code: 'folder-path-invalid', at: '/etc/style.css' });
  });

  it('rejects a .. segment in a reference', () => {
    const issue = onlyIssue([indexWith('<img src="../shared/logo.png" alt="" />')]);

    assert.deepEqual(issue, { code: 'folder-reference-parent', at: 'index.html' });
  });

  it('rejects a percent-encoded .. segment in a reference', () => {
    const issue = onlyIssue([indexWith('<img src="assets/%2e%2e/%2e%2e/logo.png" alt="" />')]);

    assert.deepEqual(issue, { code: 'folder-reference-parent', at: 'index.html' });
  });

  it('rejects a .. segment in a listed file path', () => {
    const issue = onlyIssue(folderWith(file('assets/../logo.png')));

    assert.deepEqual(issue, { code: 'folder-path-invalid', at: 'assets/../logo.png' });
  });

  it('rejects a folder without index.html', () => {
    const issue = onlyIssue([file('main.html', '<!doctype html><html><body><script>window.__timelines = {};</script></body></html>')]);

    assert.deepEqual(issue, { code: 'folder-index-missing', at: 'index.html' });
  });

  it('rejects an index.html that is only nested in a subfolder', () => {
    const codes = codesOf([file('pages/index.html', '<html><body><div data-no-timeline></div></body></html>')]);

    assert.ok(codes.includes('folder-index-missing'));
  });

  it('rejects a missing timeline marker', () => {
    const issue = onlyIssue([file('index.html', '<!doctype html><html><body><div id="root"></div></body></html>')]);

    assert.deepEqual(issue, { code: 'folder-timeline-marker-missing', at: 'index.html' });
  });

  it('does not take a longer attribute name for the data-no-timeline marker', () => {
    const issue = onlyIssue([file('index.html', '<!doctype html><html><body><div data-no-timelines></div></body></html>')]);

    assert.equal(issue.code, 'folder-timeline-marker-missing');
  });

  it('rejects a .sh file', () => {
    const issue = onlyIssue(folderWith(file('render.sh')));

    assert.deepEqual(issue, { code: 'folder-extension-not-allowed', at: 'render.sh' });
  });

  it('rejects a dot-file', () => {
    const issue = onlyIssue(folderWith(file('.hidden.json')));

    assert.deepEqual(issue, { code: 'folder-hidden-segment', at: '.hidden.json' });
  });

  it('rejects a file inside a dot-folder', () => {
    const issue = onlyIssue(folderWith(file('assets/.cache/data.json')));

    assert.deepEqual(issue, { code: 'folder-hidden-segment', at: 'assets/.cache/data.json' });
  });

  it('rejects a symlink', () => {
    const issue = onlyIssue(folderWith({ path: 'logo.png', type: 'symlink', text: null }));

    assert.deepEqual(issue, { code: 'folder-symlink', at: 'logo.png' });
  });
});

describe('templateFolderIssues: other section 4.3 rules', () => {
  it('rejects a special file that is not a regular file', () => {
    assert.deepEqual(codesOf(folderWith({ path: 'pipe.txt', type: 'other', text: null })), ['folder-not-a-file']);
  });

  it('rejects an index.html that is a symlink as a missing index', () => {
    const codes = codesOf([{ path: 'index.html', type: 'symlink', text: '<div data-no-timeline></div>' }]);

    assert.ok(codes.includes('folder-index-missing'));
    assert.ok(codes.includes('folder-symlink'));
  });

  it('rejects more than 500 files', () => {
    const entries = folderWith(...Array.from({ length: 500 }, (_, index) => file(`assets/file${index}.png`)));

    assert.deepEqual(codesOf(entries), ['folder-too-many-files']);
  });

  it('accepts exactly 500 files', () => {
    const entries = folderWith(...Array.from({ length: 499 }, (_, index) => file(`assets/file${index}.png`)));

    assert.deepEqual(codesOf(entries), []);
  });

  it('rejects a stylesheet whose text was not read', () => {
    assert.deepEqual(codesOf(folderWith(file('style.css', null))), ['folder-text-unreadable']);
  });

  it('rejects a scheme other than data:', () => {
    assert.deepEqual(codesOf([indexWith('<a href="javascript:alert(1)">x</a>')]), ['folder-reference-scheme']);
    assert.deepEqual(codesOf([indexWith('<img src="file:///etc/hosts" alt="" />')]), ['folder-reference-scheme']);
  });

  it('rejects a remote candidate inside srcset', () => {
    assert.deepEqual(codesOf([indexWith('<img srcset="small.png 1x, https://cdn.example.com/big.png 2x" alt="" />')]), [
      'folder-reference-scheme',
    ]);
  });

  it('rejects a remote poster and a remote data attribute', () => {
    assert.deepEqual(codesOf([indexWith('<video poster="https://cdn.example.com/poster.jpg"></video>')]), ['folder-reference-scheme']);
    assert.deepEqual(codesOf([indexWith('<object data="https://cdn.example.com/movie.svg"></object>')]), ['folder-reference-scheme']);
  });

  it('rejects a remote reference in an SVG file', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.example.com/a.png" /></svg>';

    assert.deepEqual(onlyIssue(folderWith(file('logo.svg', svg))), { code: 'folder-reference-scheme', at: 'logo.svg' });
  });

  it('rejects a backslash protocol-relative reference', () => {
    assert.deepEqual(codesOf([indexWith('<img src="\\\\cdn.example.com\\logo.png" alt="" />')]), ['folder-reference-protocol-relative']);
  });
});
