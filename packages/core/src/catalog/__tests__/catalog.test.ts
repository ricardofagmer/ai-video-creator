import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { ContentStore, ContentVerifier, FolderReader, ReferenceInspector, sha256Hex } from '../../asset-store';
import { PrismaBiometricReferenceSource } from '../../redaction/biometric-reference.source';
import { createCoverageHome, fixtures, type CoverageHome } from '../../test-support';
import {
  AssetAlreadyExistsError,
  AssetNotFoundError,
  AssetVersionNotFoundError,
  BiometricDowngradeError,
  BiometricRequiresReferenceError,
  CatalogAssetResolver,
  CreateAssetCommand,
  GetAssetVersionQuery,
  InvalidAssetInputError,
  InvalidStatusTransitionError,
  ListAssetVersionsQuery,
  MimeTypeNotAllowedError,
  SaveAssetVersionCommand,
  SearchAssetsQuery,
  SetAssetStatusCommand,
  type CreateAssetInput,
  type SearchAssetsCriteria,
} from '..';
import { AssetContentService } from '../asset-content';
import { SkillEntryFileService } from '../skill-entry-file';
import { AssetVersionRepository } from '../asset-version.repository';
import { BiometricSourceGuard } from '../biometric-source.guard';
import { CreateAssetHandler } from '../commands/create-asset.handler';
import { SaveAssetVersionHandler } from '../commands/save-asset-version.handler';
import { PromotionApprovalRequiredError } from '../commands/set-asset-status.errors';
import { SetAssetStatusHandler } from '../commands/set-asset-status.handler';
import { HyperframesTemplateCheck } from '../hyperframes-template.check';
import { GetAssetVersionHandler } from '../queries/get-asset-version.handler';
import { ListAssetVersionsHandler } from '../queries/list-asset-versions.handler';
import { SearchAssetsHandler } from '../queries/search-assets.handler';

/*
 * Ticket 07 (catalog): the real catalog handlers over a migrated throwaway database and a data
 * home inside the coverage temp folder. The biometric sample is a fake WAV header written under
 * the temp home's own `media/` folder, never a real voice sample.
 */

const WAV_HEADER = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ')]);

interface CatalogUnderTest {
  create: CreateAssetHandler;
  save: SaveAssetVersionHandler;
  setStatus: SetAssetStatusHandler;
  get: GetAssetVersionHandler;
  list: ListAssetVersionsHandler;
  search: SearchAssetsHandler;
  store: ContentStore;
  resolver: CatalogAssetResolver;
}

function catalogOf(home: CoverageHome): CatalogUnderTest {
  const versions = new AssetVersionRepository(home.prisma);
  const store = new ContentStore(home.dataHome);
  const references = new ReferenceInspector(home.dataHome);
  const guard = new BiometricSourceGuard(new PrismaBiometricReferenceSource(home.prisma));
  const content = new AssetContentService(store, references, guard);
  const hyperframes = new HyperframesTemplateCheck(store);
  return {
    create: new CreateAssetHandler(home.prisma, versions, content, hyperframes),
    save: new SaveAssetVersionHandler(home.prisma, versions, content, hyperframes, new SkillEntryFileService(store, new FolderReader(store, references))),
    setStatus: new SetAssetStatusHandler(home.prisma, versions),
    get: new GetAssetVersionHandler(versions),
    list: new ListAssetVersionsHandler(versions),
    search: new SearchAssetsHandler(versions),
    store,
    resolver: new CatalogAssetResolver(versions, store, new ContentVerifier(store, references)),
  };
}

/** Where the fake biometric sample lives: the temp home's own `media/` folder, outside the store. */
function fakeVoicePath(home: CoverageHome): string {
  return join(home.root, 'media', 'fake-voice-sample', 'voice.wav');
}

/** A biometric `reference` asset pointing at a fake WAV header (`fakeVoicePath`). */
async function biometricVoiceInput(home: CoverageHome): Promise<CreateAssetInput> {
  const absolutePath = fakeVoicePath(home);
  await mkdir(join(home.root, 'media', 'fake-voice-sample'), { recursive: true });
  await writeFile(absolutePath, WAV_HEADER);
  return {
    assetId: 'coverage-voice-sample',
    kind: 'reference',
    metadata: {
      name: 'Coverage voice sample',
      summary: 'voice sample for coverage',
      tags: ['voice'],
      owner: 'owner',
      sensitivity: 'biometric',
      details: { subKind: 'audio', referenceNotes: '' },
    },
    content: { source: 'reference-file', absolutePath, mimeType: 'audio/wav' },
  };
}

function refOf(version: AssetVersion): string {
  return formatAssetRef({ assetId: version.id, version: version.version });
}

async function searchIds(catalog: CatalogUnderTest, criteria: SearchAssetsCriteria): Promise<string[]> {
  const page = await catalog.search.execute(new SearchAssetsQuery(criteria));
  return page.items.map(refOf);
}

describe('catalog (ticket 07)', () => {
  let home: CoverageHome;
  let catalog: CatalogUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-catalog', start: new Date('2026-11-21T10:00:00.000Z') });
    catalog = catalogOf(home);
  });

  afterEach(async () => {
    await home.close();
  });

  describe('content-addressed store', () => {
    it('creates version 1 as a draft whose content hash matches the stored file', async () => {
      const created = await catalog.create.execute(new CreateAssetCommand(fixtures.asset()));

      const stored = await readFile(catalog.store.blobPath(created.contentHash));
      assert.equal(created.version, 1);
      assert.equal(created.status, 'draft');
      assert.equal(created.storage.mode, 'store');
      assert.equal(sha256Hex(stored), created.contentHash);
    });

    it('resolves a stored version to its blob after re-hashing it', async () => {
      const created = await catalog.create.execute(new CreateAssetCommand(fixtures.asset()));

      const resolution = await catalog.resolver.resolve({
        ref: refOf(created),
        expectedContentHash: null,
        signal: new AbortController().signal,
      });

      assert.equal(resolution.status, 'resolved');
      if (resolution.status !== 'resolved') return;
      assert.equal(resolution.asset.contentHash, created.contentHash);
      assert.equal(resolution.asset.absolutePath, catalog.store.blobPath(created.contentHash));
    });

    it('reports hash-mismatch when the pinned hash differs from the stored file', async () => {
      const created = await catalog.create.execute(new CreateAssetCommand(fixtures.asset()));

      const resolution = await catalog.resolver.resolve({
        ref: refOf(created),
        expectedContentHash: 'f'.repeat(64),
        signal: new AbortController().signal,
      });

      assert.equal(resolution.status, 'hash-mismatch');
    });

    it('saves version 2 from the previous version with the same content hash', async () => {
      const input = fixtures.asset();
      const created = await catalog.create.execute(new CreateAssetCommand(input));

      const saved = await catalog.save.execute(
        new SaveAssetVersionCommand({ assetId: input.assetId, metadata: input.metadata, content: { source: 'previous-version', version: 1 } }),
      );

      assert.equal(saved.version, 2);
      assert.equal(saved.contentHash, created.contentHash);
    });
  });

  describe('biometric containment', () => {
    it('registers a biometric asset by reference, never as a stored copy', async () => {
      const input = await biometricVoiceInput(home);

      const created = await catalog.create.execute(new CreateAssetCommand(input));

      assert.equal(created.sensitivity, 'biometric');
      assert.deepEqual(created.storage, { mode: 'reference', absolutePath: fakeVoicePath(home) });
    });

    it('never returns a biometric asset from a default search, even when the text matches it', async () => {
      const biometric = await catalog.create.execute(new CreateAssetCommand(await biometricVoiceInput(home)));
      const normal = await catalog.create.execute(
        new CreateAssetCommand(fixtures.asset({ metadata: { name: 'voice prompt for coverage', owner: 'owner', sensitivity: 'normal', details: { variables: [] } } })),
      );

      const byText = await searchIds(catalog, { text: 'voice' });
      const unfiltered = await searchIds(catalog, {});
      const withAny = await searchIds(catalog, { text: 'voice', sensitivity: 'any' });

      assert.deepEqual(byText, [refOf(normal)]);
      assert.equal(unfiltered.includes(refOf(biometric)), false);
      assert.equal(withAny.includes(refOf(biometric)), true, 'the asset exists; only the default filter hides it');
    });

    it('refuses biometric content that is not a reference', async () => {
      const input = fixtures.asset({
        kind: 'reference',
        metadata: { name: 'Inline voice', owner: 'owner', sensitivity: 'biometric', details: { subKind: 'text', referenceNotes: '' } },
        content: { source: 'inline', text: 'not a reference', mimeType: 'text/plain' },
      });

      await assert.rejects(catalog.create.execute(new CreateAssetCommand(input)), BiometricRequiresReferenceError);
    });

    it('refuses a normal version saved over a biometric asset', async () => {
      const input = await biometricVoiceInput(home);
      await catalog.create.execute(new CreateAssetCommand(input));

      const downgrade = new SaveAssetVersionCommand({
        assetId: input.assetId,
        metadata: { ...input.metadata, sensitivity: 'normal' },
        content: { source: 'inline', text: 'plain notes', mimeType: 'text/plain' },
      });

      await assert.rejects(catalog.save.execute(downgrade), BiometricDowngradeError);
    });
  });

  describe('status lifecycle', () => {
    it('excludes a deprecated version from a search for usable statuses', async () => {
      const input = fixtures.asset();
      const first = await catalog.create.execute(new CreateAssetCommand(input));
      const second = await catalog.save.execute(
        new SaveAssetVersionCommand({
          assetId: input.assetId,
          metadata: input.metadata,
          content: { source: 'inline', text: '# Coverage prompt v2\n', mimeType: 'text/markdown' },
        }),
      );

      const changed = await catalog.setStatus.execute(new SetAssetStatusCommand({ ref: refOf(first), status: 'deprecated' }));
      const usable = await searchIds(catalog, { statuses: ['draft', 'active'] });
      const history = await catalog.list.execute(new ListAssetVersionsQuery(input.assetId));

      assert.equal(changed.version.status, 'deprecated');
      assert.equal(usable.includes(refOf(first)), false);
      assert.equal(usable.includes(refOf(second)), true);
      assert.equal(history.items.length, 2, 'the deprecated version is kept, only filtered');
    });

    it('refuses activation through the status command and leaves the version a draft', async () => {
      const created = await catalog.create.execute(new CreateAssetCommand(fixtures.asset()));

      await assert.rejects(
        catalog.setStatus.execute(new SetAssetStatusCommand({ ref: refOf(created), status: 'active' })),
        PromotionApprovalRequiredError,
      );
      const after = await catalog.get.execute(new GetAssetVersionQuery(refOf(created)));
      assert.equal(after.status, 'draft');
    });

    it('refuses moving a deprecated version back to draft', async () => {
      const created = await catalog.create.execute(new CreateAssetCommand(fixtures.asset()));
      await catalog.setStatus.execute(new SetAssetStatusCommand({ ref: refOf(created), status: 'deprecated' }));

      await assert.rejects(
        catalog.setStatus.execute(new SetAssetStatusCommand({ ref: refOf(created), status: 'draft' })),
        InvalidStatusTransitionError,
      );
    });
  });

  describe('typed errors', () => {
    it('refuses a second asset with the same id', async () => {
      const input = fixtures.asset();
      await catalog.create.execute(new CreateAssetCommand(input));

      await assert.rejects(catalog.create.execute(new CreateAssetCommand(input)), AssetAlreadyExistsError);
    });

    it('answers AssetVersionNotFoundError for an unknown ref', async () => {
      await assert.rejects(catalog.get.execute(new GetAssetVersionQuery('coverage-missing@1')), AssetVersionNotFoundError);
    });

    it('answers AssetNotFoundError when saving a version of an unknown asset', async () => {
      const input = fixtures.asset();

      await assert.rejects(
        catalog.save.execute(new SaveAssetVersionCommand({ assetId: input.assetId, metadata: input.metadata, content: input.content })),
        AssetNotFoundError,
      );
    });

    it('refuses an asset id outside the kebab-case pattern', async () => {
      await assert.rejects(catalog.create.execute(new CreateAssetCommand(fixtures.asset({ assetId: 'Not A Kebab Id' }))), InvalidAssetInputError);
    });

    it('refuses a MIME type the kind does not allow', async () => {
      const input = fixtures.asset({ content: { source: 'inline', text: '{}', mimeType: 'application/json' } });

      await assert.rejects(catalog.create.execute(new CreateAssetCommand(input)), MimeTypeNotAllowedError);
    });
  });
});
