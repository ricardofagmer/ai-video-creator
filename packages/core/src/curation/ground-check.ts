import { Injectable } from '@nestjs/common';
import { type AssetRef } from '@studio/shared/catalog';
import {
  CurationCheckIdSchema,
  curationBounds,
  type CurationCheckId,
  type CurationDiffStats,
  type CurationId,
  type CuratorOutput,
} from '@studio/shared/curation';
import { type Recipe } from '@studio/shared/recipes';
import { computeBodyDiff, normalizeBody } from './body-diff';
import { CurationCatalogReader, type BindingState } from './curation-catalog.reader';
import { CurationEvidenceRepository, type EvidenceRunFacts, type EvidenceSubjectKey } from './curation-evidence.repository';
import { parseRecipeBody } from './recipe-body';

export type CuratorProposalOutput = Extract<CuratorOutput, { decision: 'propose' }>;

/** The two SQLite re-reads of the check, injected so the check itself stays pure. */
export interface GroundCheckLookups {
  evidenceFacts(key: EvidenceSubjectKey, runIds: readonly string[]): Promise<Map<string, EvidenceRunFacts>>;
  bindingStates(refs: readonly AssetRef[]): Promise<Map<AssetRef, BindingState>>;
}

/**
 * The output scanner over the model's texts (SPEC 0005 section 5.4 `redactor-clean`). It lives in
 * the agents module, so the watcher injects it; `found` and `failed` both fail the check.
 */
export type CuratorOutputScan = (texts: readonly string[]) => Promise<'clean' | 'found' | 'failed'>;

export interface GroundCheckInput {
  curationId: CurationId;
  /** The undelimited subject body the proposal replaces. */
  subjectBody: string;
  /** The subject recipe for a recipe subject; null for a prompt or skill. */
  subjectRecipe: Recipe | null;
  evidenceKey: EvidenceSubjectKey;
  /** `inputs.outcomes.runs[].runId` of the packet the model saw. */
  packetRunIds: readonly string[];
  output: CuratorProposalOutput;
}

export interface GroundCheckDeps {
  lookups: GroundCheckLookups;
  scanOutput: CuratorOutputScan;
}

export type GroundCheckResult =
  | { passed: true; diff: string; diffStats: CurationDiffStats; checks: { id: CurationCheckId; passed: true }[] }
  /** `skippedChecks`: ids that never ran (`bindings-resolvable` after an invalid recipe JSON). */
  | { passed: false; failedChecks: CurationCheckId[]; skippedChecks: CurationCheckId[] };

async function scanIsClean(scanOutput: CuratorOutputScan, output: CuratorProposalOutput): Promise<boolean> {
  try {
    return (await scanOutput([output.newBody, output.reason, output.changeSummary, output.expectedEffect])) === 'clean';
  } catch {
    // A scanner failure fails the check (fail closed); the texts are never logged.
    return false;
  }
}

/**
 * The ground check (SPEC 0005 section 5.4): every check runs and the result lists every failed id
 * in enum order. `bindings-resolvable` is evaluated only once the recipe JSON is valid, so an
 * invalid body fails as the fixable `recipe-json-valid` alone and the skipped id is reported as
 * skipped. The two evidence fact checks run over the cited ids that are in the packet only: a cited
 * id outside the packet fails the fixable `evidence-in-packet` alone, so the one corrective call of
 * topology 0004 section 7 can still happen. A lookup failure propagates: the watcher ends the
 * curation `failed` / `internal-error` rather than guessing.
 */
export async function runGroundCheck(input: GroundCheckInput, deps: GroundCheckDeps): Promise<GroundCheckResult> {
  const { output } = input;
  const failed = new Set<CurationCheckId>();
  const skipped = new Set<CurationCheckId>();
  const packetRunIds = new Set(input.packetRunIds);
  const citedInPacket = output.evidenceRunIds.filter((runId) => packetRunIds.has(runId));
  if (citedInPacket.length !== output.evidenceRunIds.length) failed.add('evidence-in-packet');

  const facts =
    citedInPacket.length === 0 ? new Map<string, EvidenceRunFacts>() : await deps.lookups.evidenceFacts(input.evidenceKey, citedInPacket);
  if (!citedInPacket.every((runId) => facts.get(runId)?.usedSubject === true)) failed.add('evidence-used-subject');
  const isReviewed = (runId: string): boolean => {
    const decision = facts.get(runId)?.decision;
    return decision === 'approved' || decision === 'rejected';
  };
  if (!citedInPacket.every(isReviewed)) failed.add('evidence-owner-reviewed');

  if (normalizeBody(output.newBody) === normalizeBody(input.subjectBody)) failed.add('body-changed');
  if (output.newBody.length > curationBounds.maxBodyChars) failed.add('body-within-cap');

  if (input.subjectRecipe !== null) {
    const parsed = parseRecipeBody(output.newBody, input.subjectRecipe, input.curationId);
    if (parsed.status === 'invalid') {
      failed.add('recipe-json-valid');
      skipped.add('bindings-resolvable');
    } else {
      const states = await deps.lookups.bindingStates(parsed.body.bindings.map((binding) => binding.ref));
      if (![...states.values()].every((state) => state === 'resolvable')) failed.add('bindings-resolvable');
    }
  }

  if (!(await scanIsClean(deps.scanOutput, output))) failed.add('redactor-clean');

  if (failed.size > 0) {
    return {
      passed: false,
      failedChecks: CurationCheckIdSchema.options.filter((id) => failed.has(id)),
      skippedChecks: CurationCheckIdSchema.options.filter((id) => skipped.has(id)),
    };
  }
  const { diff, stats } = computeBodyDiff(input.subjectBody, output.newBody);
  return { passed: true, diff, diffStats: stats, checks: CurationCheckIdSchema.options.map((id) => ({ id, passed: true as const })) };
}

/** The SQLite-backed lookups the watcher injects into `runGroundCheck` (read-only). */
@Injectable()
export class CurationGroundCheckLookups implements GroundCheckLookups {
  constructor(
    private readonly evidence: CurationEvidenceRepository,
    private readonly catalog: CurationCatalogReader,
  ) {}

  evidenceFacts(key: EvidenceSubjectKey, runIds: readonly string[]): Promise<Map<string, EvidenceRunFacts>> {
    return this.evidence.evidenceFacts(key, runIds);
  }

  bindingStates(refs: readonly AssetRef[]): Promise<Map<AssetRef, BindingState>> {
    return this.catalog.bindingStates(refs);
  }
}
