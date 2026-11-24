import { SiteAnalysisArtifactSchema, type SiteAnalysis } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { RunFileInvalidJsonError, RunFileSchemaError, UnsupportedRunFormatError } from '@studio/shared/run-files';
import { readOptionalStageInput } from './stage-io';
import { stageTexts } from './stage-texts';

/** Research output name of `site-analysis.json` (site analysis spec). */
const SITE_ANALYSIS_INPUT = 'site-analysis';

export type SiteAnalysisInput = { status: 'absent' } | { status: 'invalid' } | { status: 'present'; analysis: SiteAnalysis };

/**
 * The research stage's optional `site-analysis` output. Absent is normal (no URL, analysis off or
 * failed); a file that does not match its contract is reported once and then ignored, so a bad
 * analysis never stops the stages that only use it as guidance. A pinned file that is missing on
 * disk is not caught: that is a run-folder fault, not an analysis problem.
 */
export async function readSiteAnalysisInput(context: StageExecutionContext): Promise<SiteAnalysisInput> {
  try {
    const artifact = await readOptionalStageInput(context, SITE_ANALYSIS_INPUT, SiteAnalysisArtifactSchema);
    return artifact === null ? { status: 'absent' } : { status: 'present', analysis: artifact.analysis };
  } catch (error) {
    if (!(error instanceof RunFileSchemaError || error instanceof RunFileInvalidJsonError || error instanceof UnsupportedRunFormatError)) throw error;
    context.report({ kind: 'text', text: stageTexts.siteAnalysisInvalid });
    return { status: 'invalid' };
  }
}

/** The packet source field: the analysis when present, nothing otherwise. */
export function siteAnalysisField(input: SiteAnalysisInput): { siteAnalysis?: SiteAnalysis } {
  return input.status === 'present' ? { siteAnalysis: input.analysis } : {};
}

/** Summary suffix the owner sees when the analysis was ignored. */
export function siteAnalysisCaveat(input: SiteAnalysisInput): string {
  return input.status === 'invalid' ? ` ${stageTexts.siteAnalysisInvalid}` : '';
}
