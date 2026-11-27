import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import {
  AssetRefSchema,
  LEARNING_NOTE_MAX_CHARS,
  LEARNING_NOTES_MAX_ACTIVE_PER_VERSION,
  normalizeLearningText,
  parseAssetRef,
  type AssetRef,
  type LearningNote,
} from '@studio/shared/catalog';
import { newUlid, readRunManifest } from '@studio/shared/run-files';
import { RunIdSchema } from '@studio/shared/run-format';
import { AssetVersionRepository } from '../../catalog/asset-version.repository';
import { AssetVersionNotFoundError } from '../../catalog/catalog.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { RedactorService } from '../../redaction/redactor.service';
import { ReviewRunAccess, type LoadedRun } from '../../review/review-run-access';
import { REVIEWABLE_RUN_STATUSES } from '../../review/reviewable-run-statuses';
import { RunLocks } from '../../review/run-locks';
import { parseLearningInput } from '../learning-input';
import { toLearningNote } from '../learning-note.mapper';
import { LearningNoteRepository } from '../learning-note.repository';
import {
  InvalidLearningInputError,
  LearningBiometricRefusedError,
  LearningContainsSecretError,
  LearningLimitReachedError,
  LearningRefNotUsedError,
  LearningRunNotReviewedError,
  LearningSecretScanUnavailableError,
} from '../learnings.errors';
import { SaveLearningFromRunCommand, type LearningWriteResult } from './save-learning-from-run.command';

const SaveLearningInputSchema = z
  .object({
    runId: RunIdSchema,
    ref: AssetRefSchema,
    text: z.string().min(1).max(LEARNING_NOTE_MAX_CHARS),
    createdBy: z.string().trim().min(1).max(100),
  })
  .strict();
type SaveLearningInput = z.output<typeof SaveLearningInputSchema>;

/**
 * Section 5.5 steps 1-7, in order: run status and no live watcher; the ref is in the run's
 * manifest; not biometric; normalized length; the R1 redactor finds nothing; fewer than 20 active
 * notes; insert. Every refusal happens before the insert, so a refused note leaves no row. The text
 * appears in no log line and no error message.
 */
@CommandHandler(SaveLearningFromRunCommand)
export class SaveLearningFromRunHandler implements ICommandHandler<SaveLearningFromRunCommand, LearningWriteResult> {
  private readonly logger = new Logger(SaveLearningFromRunHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: ReviewRunAccess,
    private readonly versions: AssetVersionRepository,
    private readonly notes: LearningNoteRepository,
    private readonly redactor: RedactorService,
    private readonly locks: RunLocks,
  ) {}

  async execute(command: SaveLearningFromRunCommand): Promise<LearningWriteResult> {
    const input = parseLearningInput(SaveLearningInputSchema, command.input);
    const loaded = await this.runs.load(input.runId);
    const status = loaded.run.state.status;
    if (!REVIEWABLE_RUN_STATUSES.includes(status)) throw new LearningRunNotReviewedError(input.runId, status);
    await this.runs.assertNoLiveWatcher(loaded);
    const pinnedBiometric = await this.assertRefUsed(loaded, input.ref);

    const { assetId, version } = parseAssetRef(input.ref);
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(input.ref);
    if (pinnedBiometric || row.sensitivity === 'biometric') throw new LearningBiometricRefusedError(input.ref);

    const text = normalizeLearningText(input.text);
    if (text.length < 1 || text.length > LEARNING_NOTE_MAX_CHARS) {
      throw new InvalidLearningInputError([{ path: 'text', message: `must be 1 to ${LEARNING_NOTE_MAX_CHARS} characters after normalization` }]);
    }
    await this.assertNoSecret(input, text);

    // In-process serialization per version, so two saves cannot both see 19 active notes.
    const note = await this.locks.withRun(`learning-limit:${input.ref}`, () => this.insertWithinLimit(input, row.id, text));
    this.logger.log({ event: 'learnings.saved', noteId: note.noteId, ref: note.ref, runId: input.runId });
    return { note, reindexRef: note.ref };
  }

  /**
   * Step 2: the ref must be pinned in manifest.json assets or references, the list the outcome
   * recorder uses. A missing or foreign manifest proves no use, so it is refused the same way.
   * Returns whether the manifest pinned the ref as biometric.
   */
  private async assertRefUsed(loaded: LoadedRun, ref: AssetRef): Promise<boolean> {
    const manifest = await readRunManifest(loaded.runDir);
    if (manifest.status === 'absent' || manifest.value.runId !== loaded.runId) throw new LearningRefNotUsedError(loaded.runId, ref);
    const asset = manifest.value.assets.find((pinned) => pinned.ref === ref);
    const used = asset !== undefined || manifest.value.references.some((pinned) => pinned.ref === ref);
    if (!used) throw new LearningRefNotUsedError(loaded.runId, ref);
    return asset?.sensitivity === 'biometric';
  }

  /** Step 5 (R2-AC-25): a hit is refused, never stored redacted; a failed scan refuses too. */
  private async assertNoSecret(input: SaveLearningInput, text: string): Promise<void> {
    const scanned = await this.redactor.redactText(text);
    if (scanned.status === 'failed') {
      this.logger.warn({ event: 'learnings.refused', runId: input.runId, ref: input.ref, reason: 'learning-secret-scan-unavailable' });
      throw new LearningSecretScanUnavailableError(input.ref);
    }
    if (scanned.value !== text) {
      this.logger.warn({ event: 'learnings.refused', runId: input.runId, ref: input.ref, reason: 'learning-contains-secret' });
      throw new LearningContainsSecretError(input.runId, input.ref);
    }
  }

  /** Steps 6-7 in one transaction: the count and the insert see the same rows. */
  private async insertWithinLimit(input: SaveLearningInput, assetVersionRowId: number, text: string): Promise<LearningNote> {
    return this.prisma.$transaction(async (transaction): Promise<LearningNote> => {
      const active = await this.notes.countActive(assetVersionRowId, transaction);
      if (active >= LEARNING_NOTES_MAX_ACTIVE_PER_VERSION) throw new LearningLimitReachedError(input.ref, LEARNING_NOTES_MAX_ACTIVE_PER_VERSION);
      const now = new Date();
      const row = await this.notes.insert(
        { noteId: newUlid(now.getTime()), assetVersionRowId, text, sourceRunId: input.runId, createdBy: input.createdBy, createdAt: now },
        transaction,
      );
      return toLearningNote(row);
    });
  }
}
