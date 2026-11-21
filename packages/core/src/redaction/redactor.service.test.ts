import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readEnvironmentSecrets } from '../secrets/environment-secrets';
import { KeychainReader, type KeychainLookup } from '../secrets/keychain';
import { SecretsService } from '../secrets/secrets.service';
import { BIOMETRIC_REPLACEMENT } from './redaction.patterns';
import { RedactorService } from './redactor.service';

/*
 * Baseline review M1(b): biometric redaction must not depend on the spelling a path was typed
 * with. The registered folder is a fake one under a fresh temporary folder; no Keychain is read.
 */

class AbsentKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'not-found' });
  }
}

function redactorFor(paths: readonly string[]): RedactorService {
  return new RedactorService(new SecretsService(readEnvironmentSecrets({}), new AbsentKeychain()), {
    listBiometricReferencePaths: async () => paths,
  });
}

async function redacted(redactor: RedactorService, text: string): Promise<string> {
  const result = await redactor.redactText(text);
  assert.equal(result.status, 'redacted');
  return result.status === 'redacted' ? result.value : '';
}

describe('RedactorService biometric spellings', () => {
  let root: string;
  let cloneFolder: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-redactor-')));
    cloneFolder = join(root, 'media', 'Fake-Clone-For-Test');
    await mkdir(cloneFolder, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('redacts the real path when the reference was registered through a symlink', async () => {
    const link = join(root, 'link-to-clone');
    await symlink(cloneFolder, link);
    const text = await redacted(redactorFor([link]), `reading ${cloneFolder}/voice.wav now`);
    assert.equal(text, `reading ${BIOMETRIC_REPLACEMENT} now`);
  });

  it('still redacts the typed spelling of a symlinked registration', async () => {
    const link = join(root, 'link-to-clone');
    await symlink(cloneFolder, link);
    assert.equal(await redacted(redactorFor([link]), `${link}/a.wav`), BIOMETRIC_REPLACEMENT);
  });

  it('redacts a path that differs only in letter case', async () => {
    const text = await redacted(redactorFor([cloneFolder]), cloneFolder.toLowerCase());
    assert.equal(text, BIOMETRIC_REPLACEMENT);
  });

  it('redacts the decomposed (NFD) spelling of a composed registration', async () => {
    const accented = join(root, 'média-fake-clone'.normalize('NFC'));
    await mkdir(accented);
    const text = await redacted(redactorFor([accented]), `${accented.normalize('NFD')}/a.wav`);
    assert.equal(text, BIOMETRIC_REPLACEMENT);
  });

  it('keeps the typed spelling of a reference that no longer exists', async () => {
    const gone = join(root, 'fake-unplugged-drive', 'clone');
    assert.equal(await redacted(redactorFor([gone]), `${gone}/b.wav`), BIOMETRIC_REPLACEMENT);
  });

  it('leaves a sibling path with a longer name alone', async () => {
    const sibling = `${cloneFolder}-2/c.wav`;
    assert.equal(await redacted(redactorFor([cloneFolder]), sibling), sibling);
  });
});
