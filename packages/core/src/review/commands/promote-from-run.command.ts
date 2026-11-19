import { Command } from '@nestjs/cqrs';
import { type RunId } from '@studio/shared/run-format';

export interface PromoteFromRunInput {
  runId: RunId;
  /** Run-relative path of a hashed output recorded in run.json or manifest.json. */
  artifactPath: string;
  /** C1 `AssetId` of an existing, non-biometric catalog asset that receives the new version. */
  assetId: string;
  /** The owner promoting it, from the caller's session; becomes the provenance author. */
  decidedBy: string;
}

export interface PromoteFromRunResult {
  assetId: string;
  version: number;
}

/**
 * PRD 5.3 "promote from a run" (SPEC 0002 A14, minimal): saves a run output as a new `draft`
 * version of an existing asset through the catalog commands, with the run as provenance.
 */
export class PromoteFromRunCommand extends Command<PromoteFromRunResult> {
  constructor(readonly input: PromoteFromRunInput) {
    super();
  }
}
