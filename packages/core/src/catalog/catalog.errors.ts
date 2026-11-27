import { type AssetKind, type AssetRef, type AssetStatus } from '@studio/shared/catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type CatalogErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * Base of every catalog domain error. Messages carry ids and refs only, never file paths or
 * content, so they are safe to log and to show (PRD 12).
 */
export abstract class CatalogError extends Error {
  abstract readonly category: CatalogErrorCategory;
}

export interface InputIssue {
  path: string;
  message: string;
}

export class InvalidAssetInputError extends CatalogError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid asset input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidAssetInputError';
  }
}

export class AssetNotFoundError extends CatalogError {
  override readonly category = 'not_found';

  constructor(readonly assetId: string) {
    super(`Asset not found: ${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

export class AssetVersionNotFoundError extends CatalogError {
  override readonly category = 'not_found';

  constructor(readonly ref: AssetRef) {
    super(`Asset version not found: ${ref}`);
    this.name = 'AssetVersionNotFoundError';
  }
}

export class AssetAlreadyExistsError extends CatalogError {
  override readonly category = 'conflict';

  constructor(readonly assetId: string) {
    super(`Asset already exists: ${assetId}; save a new version instead`);
    this.name = 'AssetAlreadyExistsError';
  }
}

/** Two writers raced for the same N+1 or the same activation; the caller may retry. */
export class AssetVersionConflictError extends CatalogError {
  override readonly category = 'conflict';

  constructor(readonly assetId: string) {
    super(`Concurrent change to asset ${assetId}; retry`);
    this.name = 'AssetVersionConflictError';
  }
}

/** Criterion 7: license and provenance are required before activation. */
export class LicenseRequiredError extends CatalogError {
  override readonly category = 'validation';

  constructor(
    readonly ref: AssetRef,
    readonly missing: readonly ('license' | 'provenance')[],
  ) {
    super(`${ref} cannot become active without ${missing.join(' and ')}`);
    this.name = 'LicenseRequiredError';
  }
}

export class InvalidStatusTransitionError extends CatalogError {
  override readonly category = 'conflict';

  constructor(
    readonly ref: AssetRef,
    readonly from: AssetStatus,
    readonly to: AssetStatus,
  ) {
    super(`${ref} cannot move from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class MimeTypeNotAllowedError extends CatalogError {
  override readonly category = 'validation';

  constructor(
    readonly kind: AssetKind,
    readonly mimeType: string,
  ) {
    super(`MIME type ${mimeType} is not allowed for kind ${kind}`);
    this.name = 'MimeTypeNotAllowedError';
  }
}

export class LayoutNotAllowedError extends CatalogError {
  override readonly category = 'validation';

  constructor(
    readonly kind: AssetKind,
    readonly layout: 'file' | 'folder',
  ) {
    super(`A ${kind} asset cannot be a ${layout}`);
    this.name = 'LayoutNotAllowedError';
  }
}

/** Criterion 22: biometric material is registered by path and hash only. */
export class BiometricRequiresReferenceError extends CatalogError {
  override readonly category = 'validation';

  constructor() {
    super('Biometric material must be registered by reference; no bytes enter the store');
    this.name = 'BiometricRequiresReferenceError';
  }
}

export type BiometricSourceRefusal = 'overlaps-biometric-reference' | 'biometric-registry-unresolvable';

/**
 * PRD 12: an import, or a non-biometric reference, whose real path lies on, under or above a
 * registered biometric reference is refused whatever sensitivity the caller declared. Carries no
 * path: neither the source nor the reference it matched.
 */
export class BiometricSourceRefusedError extends CatalogError {
  override readonly category = 'validation';

  constructor(readonly refusal: BiometricSourceRefusal) {
    super(
      refusal === 'overlaps-biometric-reference'
        ? 'The source overlaps a registered biometric reference; biometric material is registered by reference with sensitivity biometric'
        : 'A registered biometric reference could not be resolved, so the source cannot be cleared',
    );
    this.name = 'BiometricSourceRefusedError';
  }
}

/**
 * The leading bytes do not match the declared (or, inside a folder, the extension's) MIME type.
 * `relativePath` is the C1 path inside an imported folder, kept as a field; the message stays
 * path-free.
 */
export class ContentTypeMismatchError extends CatalogError {
  override readonly category = 'validation';

  constructor(
    readonly kind: AssetKind,
    readonly mimeType: string,
    readonly relativePath: string | null,
  ) {
    super(`Content does not match MIME type ${mimeType} for kind ${kind}`);
    this.name = 'ContentTypeMismatchError';
  }
}

/**
 * Once an asset holds biometric material, its later versions stay biometric; otherwise a
 * relabelled version would become agent-readable and exportable (PRD 12).
 */
export class BiometricDowngradeError extends CatalogError {
  override readonly category = 'validation';

  constructor(readonly assetId: string) {
    super(`Asset ${assetId} holds biometric material; its versions cannot drop that sensitivity`);
    this.name = 'BiometricDowngradeError';
  }
}

export type EntryFileUnavailableReason =
  | 'not-a-skill'
  | 'not-a-folder'
  | 'referenced-folder'
  | 'missing'
  | 'too-large'
  | 'folder-too-large'
  | 'not-text';

/**
 * A skill's entry file cannot be read or replaced as text (skills spec addendum T5). The message
 * names the reason only, never the path or the content.
 */
export class EntryFileUnavailableError extends CatalogError {
  override readonly category = 'validation';

  constructor(
    readonly ref: AssetRef,
    readonly reason: EntryFileUnavailableReason,
  ) {
    super(`The entry file of ${ref} is unavailable as text: ${reason}`);
    this.name = 'EntryFileUnavailableError';
  }
}

/** A stored row no longer satisfies C1; a data-integrity problem, never a user error. */
export class CatalogRowCorruptError extends CatalogError {
  override readonly category = 'internal';

  /** `subject` is an `assetId@version` ref, or a bare asset id for an `assets` row. */
  constructor(readonly subject: string, options?: ErrorOptions) {
    super(`Catalog row ${subject} does not match the catalog contract`, options);
    this.name = 'CatalogRowCorruptError';
  }
}

export type ImageContentUnavailableReason = 'not-an-image' | 'not-a-file' | 'not-stored' | 'biometric' | 'not-previewable' | 'missing';

/**
 * A version has no stored image the web may show as a thumbnail: only stored single-file PNG,
 * JPEG or WebP images qualify. The message names the reason only, never the path.
 */
export class ImageContentUnavailableError extends CatalogError {
  override readonly category = 'not_found';

  constructor(
    readonly ref: AssetRef,
    readonly reason: ImageContentUnavailableReason,
  ) {
    super(`The image of ${ref} is unavailable: ${reason}`);
    this.name = 'ImageContentUnavailableError';
  }
}

export type AudioContentUnavailableReason = 'not-music' | 'not-a-file' | 'not-stored' | 'biometric' | 'not-playable' | 'missing';

/**
 * A version has no stored audio the web may play: only stored single-file music qualifies. The
 * message names the reason only, never the path.
 */
export class AudioContentUnavailableError extends CatalogError {
  override readonly category = 'not_found';

  constructor(
    readonly ref: AssetRef,
    readonly reason: AudioContentUnavailableReason,
  ) {
    super(`The audio of ${ref} is unavailable: ${reason}`);
    this.name = 'AudioContentUnavailableError';
  }
}
