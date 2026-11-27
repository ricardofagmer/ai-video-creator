import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type CurationDecisionRequest, type CurationView } from '@studio/shared/api';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type CuratableRef, type CurationFile, type CurationId, type CurationProposal } from '@studio/shared/curation';
import { SaveAssetVersionCommand, type AssetContentInput, type AssetVersionMetadataInput } from '../../catalog';
import { CreateComparisonCommand } from '../../comparisons';
import { SaveRecipeVersionCommand, type RecipeDraftInput, type RecipeVersionView } from '../../recipes';
import { SerialMutex } from '../../runtime/keyed-mutex';
import { CurationCatalogReader } from '../curation-catalog.reader';
import { type CurationDecisionRecord } from '../curation-decision.mapper';
import { CurationDecisionRepository } from '../curation-decision.repository';
import { queueOf } from '../curation-queue';
import { CurationStore } from '../curation-store';
import { CurationSubjectBodyReader } from '../curation-subject-body.reader';
import { CurationSubjectSelector, type SelectedSubject } from '../curation-subject.selector';
import { CurationViewAssembler } from '../curation-view.assembler';
import {
  CurationAlreadyDecidedError,
  CurationFileCorruptError,
  CurationNotDecidableError,
  CurationNotFoundError,
  CurationNotSavedError,
  CurationSubjectRefusedError,
  InvalidCurationInputError,
} from '../curation.errors';
import { DecideCurationInputSchema, parseCurationInput } from '../curation.input';
import { curatorProvenance, parseRecipeBody } from '../recipe-body';
import { withSkillDraftFolder } from '../skill-draft-folder';
import { DecideCurationCommand } from './decide-curation.command';

type CompareRequest = Extract<CurationDecisionRequest, { action: 'compare' }>;

/** The api inputs of one decision; `decidedBy` and `correlationId` are never invented here. */
interface DecisionContext {
  file: CurationFile;
  decidedBy: string;
  correlationId: string;
  now: Date;
}

@CommandHandler(DecideCurationCommand)
export class DecideCurationHandler implements ICommandHandler<DecideCurationCommand, CurationView> {
  private readonly logger = new Logger(DecideCurationHandler.name);
  /** Decisions run one at a time in this api process, so a double click cannot save twice. */
  private readonly decisionOrder = new SerialMutex();

  constructor(
    private readonly commandBus: CommandBus,
    private readonly store: CurationStore,
    private readonly decisions: CurationDecisionRepository,
    private readonly selector: CurationSubjectSelector,
    private readonly bodies: CurationSubjectBodyReader,
    private readonly catalog: CurationCatalogReader,
    private readonly assembler: CurationViewAssembler,
  ) {}

  async execute(command: DecideCurationCommand): Promise<CurationView> {
    const input = parseCurationInput(DecideCurationInputSchema, command.input, '');
    // The mutex only orders the decisions; each caller still receives its own result or error.
    return this.decisionOrder.run(async () => {
      const file = await this.store.readState(input.curationId);
      if (file === null) throw new CurationNotFoundError(input.curationId);
      const context: DecisionContext = { file, decidedBy: input.decidedBy, correlationId: input.correlationId, now: new Date() };
      const decision = await this.decide(context, input.decision);
      this.logger.log({
        event: 'curation.decided',
        curationId: file.curationId,
        action: input.decision.action,
        savedRef: decision.savedRef,
        comparisonId: decision.comparisonId,
      });
      return this.assembler.viewOf(file, queueOf([]), decision);
    });
  }

  private async decide(context: DecisionContext, request: CurationDecisionRequest): Promise<CurationDecisionRecord> {
    const existing = await this.decisions.findByCurationId(context.file.curationId);
    switch (request.action) {
      case 'save-draft':
        return this.saveDraft(context, existing);
      case 'decline':
        assertDecidable(context.file, existing);
        return this.decisions.insert({ ...decisionBase(context), decision: 'declined', ownerReason: request.reason ?? null });
      case 'compare':
        return this.compare(context, existing, request);
    }
  }

  private async saveDraft(context: DecisionContext, existing: CurationDecisionRecord | null): Promise<CurationDecisionRecord> {
    const { file } = context;
    assertDecidable(file, existing);
    const proposal = await this.store.readProposal(file.curationId);
    if (proposal === null) throw new CurationFileCorruptError(file.curationId, 'proposal.json');
    const selection = await this.selector.select(file.subject);
    // A subject that became deprecated, biometric or unreadable, or whose body is no longer the one
    // the proposal was diffed against, cannot be saved from.
    if (selection.status === 'refused' || selection.selected.bodySha256 !== proposal.baseBodySha256) {
      throw new CurationSubjectRefusedError(file.curationId, file.subject.ref);
    }
    const savedRef = await this.saveVersion(context, selection.selected, proposal);
    return this.decisions.insert({ ...decisionBase(context), decision: 'saved', savedRef });
  }

  /** Idempotent: a draft already carrying this curation's provenance is reused, never saved twice. */
  private async saveVersion(context: DecisionContext, selected: SelectedSubject, proposal: CurationProposal): Promise<CuratableRef> {
    const { curationId } = context.file;
    const { target } = selected;
    if (target.kind === 'recipe') {
      const existing = await this.catalog.findCuratorRecipeDraft(target.view.recipe.id, curationId);
      if (existing !== null) return existing;
      return (await this.saveRecipeDraft(context, target.view, proposal.newBody)).ref;
    }
    const existing = await this.catalog.findCuratorAssetDraft(target.version.id, curationId);
    if (existing !== null) return existing;
    const saved = await this.saveAssetDraft(context, target.version, proposal.newBody);
    return formatAssetRef({ assetId: saved.id, version: saved.version });
  }

  private async saveRecipeDraft(context: DecisionContext, view: RecipeVersionView, newBody: string): Promise<RecipeVersionView> {
    const { curationId } = context.file;
    const parsed = parseRecipeBody(newBody, view.recipe, curationId);
    // The ground check validated this body; failing now means proposal.json no longer matches it.
    if (parsed.status === 'invalid') throw new CurationFileCorruptError(curationId, 'proposal.json');
    const { id: recipeId, ...fields } = parsed.body;
    const definition: RecipeDraftInput = { ...fields, provenance: curatorProvenance(curationId, context.decidedBy, context.now) };
    return this.commandBus.execute(new SaveRecipeVersionCommand({ recipeId, definition }));
  }

  /** Metadata is copied from the subject version; only the body bytes and the provenance change. */
  private async saveAssetDraft(context: DecisionContext, version: AssetVersion, newBody: string): Promise<AssetVersion> {
    const { curationId } = context.file;
    const metadata: AssetVersionMetadataInput = {
      name: version.name,
      summary: version.summary,
      tags: version.tags,
      owner: version.owner,
      provenance: curatorProvenance(curationId, context.decidedBy, context.now),
      license: version.license,
      sensitivity: version.sensitivity,
      notes: version.notes,
      details: version.details,
    };
    const save = (content: AssetContentInput): Promise<AssetVersion> =>
      this.commandBus.execute(new SaveAssetVersionCommand({ assetId: version.id, metadata, content }));
    if (version.kind === 'prompt') return save({ source: 'inline', text: newBody, mimeType: version.mimeType });
    if (version.kind !== 'skill') throw new CurationSubjectRefusedError(curationId, context.file.subject.ref);
    const listed = await this.bodies.skillFiles(version);
    if (listed.status === 'refused') throw new CurationSubjectRefusedError(curationId, context.file.subject.ref);
    return withSkillDraftFolder({ files: listed.files, entryFile: version.details.entryFile, newBody }, (folderPath) =>
      save({ source: 'import-folder', absolutePath: folderPath }),
    );
  }

  /** Arm B is the saved draft; the comparison is created and not started (C5-AC-18). */
  private async compare(context: DecisionContext, existing: CurationDecisionRecord | null, request: CompareRequest): Promise<CurationDecisionRecord> {
    const { file } = context;
    if (existing === null || existing.decision !== 'saved' || existing.comparisonId !== null) throw new CurationNotSavedError(file.curationId);
    const subject = comparisonSubjectOf(file, existing.savedRef, request);
    const detail = await this.commandBus.execute(
      new CreateComparisonCommand({
        request: {
          recipeRef: request.recipeRef,
          brief: request.brief,
          ...(request.references === undefined ? {} : { references: request.references }),
          ...(request.title === undefined ? {} : { title: request.title }),
          subject,
        },
        createdBy: context.decidedBy,
        correlationId: context.correlationId,
      }),
    );
    if (!(await this.decisions.linkComparison(file.curationId, detail.comparisonId))) throw new CurationNotSavedError(file.curationId);
    return { ...existing, comparisonId: detail.comparisonId };
  }
}

function assertDecidable(file: CurationFile, existing: CurationDecisionRecord | null): void {
  if (file.status !== 'proposed') throw new CurationNotDecidableError(file.curationId, file.status);
  if (existing !== null) throw new CurationAlreadyDecidedError(file.curationId);
}

function decisionBase(context: DecisionContext): {
  curationId: CurationId;
  subjectKind: CurationFile['subject']['kind'];
  subjectRef: CuratableRef;
  decidedBy: string;
  correlationId: string;
  decidedAt: Date;
} {
  return {
    curationId: context.file.curationId,
    subjectKind: context.file.subject.kind,
    subjectRef: context.file.subject.ref,
    decidedBy: context.decidedBy,
    correlationId: context.correlationId,
    decidedAt: context.now,
  };
}

/** Recipe subject: arm A must be the subject itself. Prompt or skill subject: the slot is required. */
function comparisonSubjectOf(
  file: CurationFile,
  savedRef: CuratableRef,
  request: CompareRequest,
): { kind: 'recipe-version'; b: string } | { kind: 'asset-binding'; slot: string; b: string } {
  if (file.subject.kind === 'recipe') {
    if (request.recipeRef !== file.subject.ref) {
      throw new InvalidCurationInputError([{ path: 'decision.recipeRef', message: 'must be the curated recipe version' }]);
    }
    return { kind: 'recipe-version', b: savedRef };
  }
  if (request.slot === undefined) throw new InvalidCurationInputError([{ path: 'decision.slot', message: 'required for a prompt or skill subject' }]);
  return { kind: 'asset-binding', slot: request.slot, b: savedRef };
}
