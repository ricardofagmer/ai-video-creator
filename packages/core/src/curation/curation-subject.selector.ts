import { Injectable } from '@nestjs/common';
import { AssetRefSchema, type AssetVersion, type Sha256 } from '@studio/shared/catalog';
import { curationBounds, type CurationSubject } from '@studio/shared/curation';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { sha256Hex } from '../asset-store/hashing';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';
import { CurationCatalogReader } from './curation-catalog.reader';
import { CurationEvidenceRepository, type EvidenceSubjectKey } from './curation-evidence.repository';
import { CurationSubjectBodyReader } from './curation-subject-body.reader';
import {
  CurationNoReviewedRunsError,
  CurationSubjectBiometricError,
  CurationSubjectBodyTooLargeError,
  CurationSubjectDeprecatedError,
  CurationSubjectNotCuratableError,
  CurationSubjectNotFoundError,
  type CurationError,
} from './curation.errors';
import { recipeBodyOf } from './recipe-body';

/** Why a subject cannot be curated (SPEC 0005 section 5.1 step 2), in the order checked. */
export type SubjectRefusal =
  | 'not-found'
  | 'not-curatable'
  | 'deprecated'
  | 'biometric'
  | 'body-too-large'
  | 'body-unavailable'
  | 'no-reviewed-runs';

/** The version a curation proposes for, with the facts the collector and the decision need. */
export type SubjectTarget = { kind: 'asset'; version: AssetVersion } | { kind: 'recipe'; view: RecipeVersionView };

export interface SelectedSubject {
  subject: CurationSubject;
  title: string;
  status: 'draft' | 'active';
  /** The undelimited text body: the file text, or the recipe body JSON (B14). */
  body: string;
  bodySha256: Sha256;
  target: SubjectTarget;
  evidenceKey: EvidenceSubjectKey;
  reviewedRunCount: number;
}

export type SubjectSelection = { status: 'selected'; selected: SelectedSubject } | { status: 'refused'; refusal: SubjectRefusal };

const TITLE_MAX_CHARS = 200;

function selectableStatus(status: string): 'draft' | 'active' | 'deprecated' {
  return status === 'draft' || status === 'active' ? status : 'deprecated';
}

/** The C10 refusal of a request (SPEC 0005 section 4.4). An unreadable body is not curatable. */
export function subjectRefusalError(subject: CurationSubject, refusal: SubjectRefusal): CurationError {
  switch (refusal) {
    case 'not-found':
      return new CurationSubjectNotFoundError(subject.ref);
    case 'deprecated':
      return new CurationSubjectDeprecatedError(subject.ref);
    case 'biometric':
      return new CurationSubjectBiometricError(subject.ref);
    case 'body-too-large':
      return new CurationSubjectBodyTooLargeError(subject.ref);
    case 'no-reviewed-runs':
      return new CurationNoReviewedRunsError(subject.ref);
    case 'not-curatable':
    case 'body-unavailable':
      return new CurationSubjectNotCuratableError(subject.ref);
  }
}

/**
 * The subject selector shared by the api request, the watcher claim and the decision (SPEC 0005
 * sections 5.1, 5.2, 5.7), read-only. Checked in order, the first failure refuses: the version
 * exists; its kind is the declared prompt, skill or recipe; its status is `draft` or `active`; it
 * is not biometric (checked before any byte is read); the body is UTF-8 text of at most 16,000
 * characters; at least one run that used it has a recorded owner decision (B4).
 */
@Injectable()
export class CurationSubjectSelector {
  constructor(
    private readonly catalog: CurationCatalogReader,
    private readonly bodies: CurationSubjectBodyReader,
    private readonly evidence: CurationEvidenceRepository,
  ) {}

  async select(subject: CurationSubject): Promise<SubjectSelection> {
    const selection = subject.kind === 'recipe' ? await this.selectRecipe(subject) : await this.selectAsset(subject);
    if (selection.status === 'refused') return selection;
    const reviewedRunCount = await this.evidence.countReviewedRuns(selection.selected.evidenceKey);
    if (reviewedRunCount === 0) return { status: 'refused', refusal: 'no-reviewed-runs' };
    return { status: 'selected', selected: { ...selection.selected, reviewedRunCount } };
  }

  private async selectAsset(subject: CurationSubject): Promise<SubjectSelection> {
    const ref = AssetRefSchema.safeParse(subject.ref);
    if (!ref.success) return { status: 'refused', refusal: 'not-found' };
    const found = await this.catalog.findAssetVersion(ref.data);
    if (found === null) return { status: 'refused', refusal: 'not-found' };
    const { version } = found;
    if (version.kind !== subject.kind) return { status: 'refused', refusal: 'not-curatable' };
    const status = selectableStatus(version.status);
    if (status === 'deprecated') return { status: 'refused', refusal: 'deprecated' };
    if (version.sensitivity === 'biometric') return { status: 'refused', refusal: 'biometric' };
    const read = await this.bodies.readBody(version);
    if (read.status === 'refused') return read;
    return {
      status: 'selected',
      selected: {
        subject,
        title: version.name.slice(0, TITLE_MAX_CHARS),
        status,
        body: read.body,
        bodySha256: sha256Hex(read.body),
        target: { kind: 'asset', version },
        evidenceKey: { kind: 'asset', assetVersionRowId: found.rowId, contentHash: version.contentHash },
        reviewedRunCount: 0,
      },
    };
  }

  private async selectRecipe(subject: CurationSubject): Promise<SubjectSelection> {
    const ref = RecipeRefSchema.safeParse(subject.ref);
    if (!ref.success) return { status: 'refused', refusal: 'not-found' };
    const view = await this.catalog.findRecipeVersion(ref.data);
    if (view === null) return { status: 'refused', refusal: 'not-found' };
    const status = selectableStatus(view.recipe.status);
    if (status === 'deprecated') return { status: 'refused', refusal: 'deprecated' };
    const body = recipeBodyOf(view.recipe);
    if (body.length > curationBounds.maxBodyChars) return { status: 'refused', refusal: 'body-too-large' };
    return {
      status: 'selected',
      selected: {
        subject,
        title: view.recipe.name.slice(0, TITLE_MAX_CHARS),
        status,
        body,
        bodySha256: sha256Hex(body),
        target: { kind: 'recipe', view },
        evidenceKey: { kind: 'recipe', recipeId: view.recipe.id, version: view.recipe.version, contentHash: view.contentHash },
        reviewedRunCount: 0,
      },
    };
  }
}
