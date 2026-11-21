import { open, readFile, stat } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import {
  FolderManifestSchema,
  TemplateDetailsSchema,
  type AssetKind,
  type AssetLayout,
  type AssetStorage,
  type Sha256,
  type TemplateDetails,
} from '@studio/shared/catalog';
import {
  hyperframesBounds,
  hyperframesTemplateIssues,
  templateFolderIssues,
  type TemplateFolderEntry,
  type TemplateIssue,
} from '@studio/shared/hyperframes';
import { ContentStore, MAX_FOLDER_MANIFEST_BYTES } from '../asset-store';
import { listFolderFiles } from '../asset-store/folder-walk';
import { type NewAssetContentInput } from './asset-content';
import { InvalidAssetInputError, type InputIssue } from './catalog.errors';

/*
 * Catalog rules of a HyperFrames template version (SPEC 0008 sections 4.3 and 5.4, AC 76). A
 * `template` version whose `details.engine` is `hyperframes` must satisfy the details rules and
 * its folder must be self-contained; otherwise the version is refused with the issue list before
 * any row is written. A `remotion` version, and every other kind, takes the existing path
 * unchanged. Files are only read, never executed.
 */

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.svg', '.js']);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

function toInputIssues(issues: readonly TemplateIssue[], prefix: string): InputIssue[] {
  return issues.map((issue) => ({ path: issue.at === null ? prefix : `${prefix}.${issue.at}`, message: `${issue.code}: ${issue.message}` }));
}

/** The template details when this is a HyperFrames template version, otherwise null. */
export function hyperframesDetailsOf(kind: AssetKind, details: unknown): TemplateDetails | null {
  if (kind !== 'template') return null;
  const parsed = TemplateDetailsSchema.safeParse(details);
  return parsed.success && parsed.data.engine === 'hyperframes' ? parsed.data : null;
}

/** The details rules, checked with the metadata before any byte is stored (section 4.3). */
export function assertHyperframesTemplateDetails(kind: AssetKind, details: unknown): void {
  const template = hyperframesDetailsOf(kind, details);
  if (template === null) return;
  const issues = hyperframesTemplateIssues(template);
  if (issues.length > 0) throw new InvalidAssetInputError(toInputIssues(issues, 'metadata.details'));
}

/** A small regular file's text, read without following a link; null when it cannot be read whole. */
async function readTextBounded(filePath: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(filePath, 'r');
  } catch {
    // An unreadable file is reported by `templateFolderIssues` as `folder-text-unreadable`.
    return null;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > hyperframesBounds.maxTextFileBytes) return null;
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

async function entriesFrom(files: readonly { relativePath: string; absolutePath: string }[]): Promise<TemplateFolderEntry[]> {
  // Past the file limit the texts are not read: the check refuses the folder on its count alone.
  const readTexts = files.length <= hyperframesBounds.maxFiles;
  const entries: TemplateFolderEntry[] = [];
  for (const file of files) {
    const text = readTexts && TEXT_EXTENSIONS.has(extensionOf(file.relativePath)) ? await readTextBounded(file.absolutePath) : null;
    entries.push({ path: file.relativePath, type: 'file', text });
  }
  return entries;
}

@Injectable()
export class HyperframesTemplateCheck {
  constructor(private readonly store: ContentStore) {}

  /** New content of a HyperFrames template: a folder, imported or by reference, that passes section 4.3. */
  async assertNewContent(kind: AssetKind, details: unknown, content: NewAssetContentInput): Promise<void> {
    if (hyperframesDetailsOf(kind, details) === null) return;
    if (content.source !== 'import-folder' && content.source !== 'reference-folder') {
      throw new InvalidAssetInputError([{ path: 'content.source', message: 'a HyperFrames template is a folder' }]);
    }
    this.assertFolder(await entriesFrom(await listFolderFiles(content.absolutePath)));
  }

  /** Reused bytes of an earlier version (`previous-version`): the same rules apply to them. */
  async assertReusedContent(
    kind: AssetKind,
    details: unknown,
    previous: { layout: AssetLayout; storage: AssetStorage; contentHash: Sha256 },
  ): Promise<void> {
    if (hyperframesDetailsOf(kind, details) === null) return;
    if (previous.layout !== 'folder') {
      throw new InvalidAssetInputError([{ path: 'content.version', message: 'a HyperFrames template is a folder' }]);
    }
    const files =
      previous.storage.mode === 'reference'
        ? await listFolderFiles(previous.storage.absolutePath)
        : await this.storedFolderFiles(previous.contentHash);
    this.assertFolder(await entriesFrom(files));
  }

  private assertFolder(entries: readonly TemplateFolderEntry[]): void {
    const issues = templateFolderIssues(entries);
    if (issues.length > 0) throw new InvalidAssetInputError(toInputIssues(issues, 'content'));
  }

  /** The files of a stored folder, from its canonical manifest blob (ADR 0003 decision 1). */
  private async storedFolderFiles(contentHash: Sha256): Promise<{ relativePath: string; absolutePath: string }[]> {
    const manifestPath = this.store.blobPath(contentHash);
    if ((await stat(manifestPath)).size > MAX_FOLDER_MANIFEST_BYTES) {
      throw new InvalidAssetInputError([{ path: 'content.version', message: 'the stored folder manifest is too large' }]);
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      // A blob that is not JSON is reported like any other invalid manifest below.
      manifest = null;
    }
    const parsed = FolderManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new InvalidAssetInputError([{ path: 'content.version', message: 'the stored folder manifest is not valid' }]);
    }
    return parsed.data.files.map((entry) => ({ relativePath: entry.path, absolutePath: this.store.blobPath(entry.contentHash) }));
  }
}
