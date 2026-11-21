import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { toAssetStoreError } from '../asset-store/fs-errors';
import { isInsideOrEqual } from '../asset-store/path-guards';
import { referenceSpellings, resolveBiometricReferencePaths } from '../redaction/biometric-reference-paths';
import { BIOMETRIC_REFERENCE_SOURCE, type BiometricReferenceSource } from '../redaction/biometric-reference.source';
import { BiometricSourceRefusedError } from './catalog.errors';

function overlaps(left: string, right: string): boolean {
  return isInsideOrEqual(left, right) || isInsideOrEqual(right, left);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/** The source as typed and, when it exists, its realpath; a missing source is left to the store's own error. */
async function sourceSpellings(absolutePath: string): Promise<string[]> {
  const spellings = [resolve(absolutePath)];
  try {
    spellings.push(await realpath(absolutePath));
  } catch (error) {
    if (!isMissing(error)) throw toAssetStoreError(error);
  }
  return spellings;
}

/**
 * Biometric containment by location, not by label (PRD 12, criterion 22): a source whose typed or
 * real path lies on, under, or above the typed or real path of any registered biometric reference
 * is refused before a byte is read. The registry is read fresh for every check; a reference that
 * exists but cannot be resolved fails closed. Only the registered paths themselves are resolved:
 * nothing under them is opened, listed or hashed.
 */
@Injectable()
export class BiometricSourceGuard {
  constructor(@Inject(BIOMETRIC_REFERENCE_SOURCE) private readonly biometric: BiometricReferenceSource) {}

  async assertNotBiometricSource(absolutePath: string): Promise<void> {
    const references = await resolveBiometricReferencePaths(await this.biometric.listBiometricReferencePaths());
    if (references.length === 0) return;
    if (references.some((reference) => reference.status === 'unreadable')) {
      throw new BiometricSourceRefusedError('biometric-registry-unresolvable');
    }
    const referenceForms = references.flatMap(referenceSpellings);
    const sourceForms = await sourceSpellings(absolutePath);
    const overlapping = sourceForms.some((source) => referenceForms.some((reference) => overlaps(source, reference)));
    if (overlapping) throw new BiometricSourceRefusedError('overlaps-biometric-reference');
  }
}
