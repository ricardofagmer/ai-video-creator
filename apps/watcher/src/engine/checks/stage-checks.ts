import { type CheckId, type CheckResult, type StageBrief } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { ownerTexts } from '../owner-texts';
import { validateArtifact } from '../postconditions/artifact-schemas';
import { findMissingDeclaredOutputs, isAbsentOptionalOutput, isOptionalOutput } from '../postconditions/declared-outputs';
import { clip } from '../text';

/** Checks the engine computes itself; every other check id is the executor's evidence (R1-14). */
const engineOwnedChecks: ReadonlySet<CheckId> = new Set<CheckId>(['outputs-present', 'output-schema']);

export interface StageCheckInput {
  runDir: string;
  brief: StageBrief;
  attempt: number;
  clock: Clock;
  executorResults: readonly CheckResult[];
}

type CheckVerdict = Pick<CheckResult, 'outcome' | 'expected' | 'measured' | 'detail'>;

/** The `execute` postcondition again at `verify` (A30): optional outputs may be absent, never empty. */
async function outputsPresent(input: StageCheckInput): Promise<CheckVerdict> {
  const declared = input.brief.declaredOutputs;
  const missing = await findMissingDeclaredOutputs(input.runDir, declared);
  const optionalCount = declared.filter(isOptionalOutput).length;
  let absentOptionalCount = 0;
  for (const output of declared) {
    if (await isAbsentOptionalOutput(input.runDir, output)) absentOptionalCount += 1;
  }
  return {
    outcome: missing.length === 0 ? 'passed' : 'failed',
    expected: ownerTexts.outputsPresentExpected(declared.length - optionalCount, optionalCount),
    measured: ownerTexts.outputsPresentMeasured(declared.length - missing.length, absentOptionalCount),
    detail: missing.map((output) => `${output.name}: ${output.problem}`).join('; '),
  };
}

async function outputSchema(input: StageCheckInput): Promise<CheckVerdict> {
  const problems: string[] = [];
  let validated = 0;
  for (const output of input.brief.declaredOutputs) {
    // An absent optional output has no content to parse; a present one is validated like any other.
    if (await isAbsentOptionalOutput(input.runDir, output)) continue;
    const validation = await validateArtifact(input.runDir, output);
    if (validation.status === 'invalid') problems.push(validation.problem);
    if (validation.status !== 'no-schema') validated += 1;
  }
  if (validated === 0) {
    return { outcome: 'skipped', expected: 'saídas com esquema congelado', measured: 'nenhuma', detail: '' };
  }
  return {
    outcome: problems.length === 0 ? 'passed' : 'failed',
    expected: `${validated} saída(s) validam contra o esquema`,
    measured: `${validated - problems.length} válida(s)`,
    detail: problems.join('; '),
  };
}

async function engineVerdict(checkId: CheckId, input: StageCheckInput): Promise<CheckVerdict> {
  return checkId === 'outputs-present' ? outputsPresent(input) : outputSchema(input);
}

function executorVerdict(checkId: CheckId, input: StageCheckInput): CheckVerdict {
  const reported = input.executorResults.find((result) => result.checkId === checkId);
  if (reported === undefined) {
    return { outcome: 'failed', expected: 'resultado do executor', measured: 'nenhum', detail: 'o executor não informou esta verificação' };
  }
  return { outcome: reported.outcome, expected: reported.expected, measured: reported.measured, detail: reported.detail };
}

/**
 * One result per check the stage brief lists, in brief order. Executor results are evidence the
 * engine re-stamps with its own stage, attempt and timing; a missing result fails the check.
 */
export async function collectCheckResults(input: StageCheckInput): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const checkId of input.brief.checks) {
    const startedAtMs = input.clock.now().getTime();
    const verdict = engineOwnedChecks.has(checkId) ? await engineVerdict(checkId, input) : executorVerdict(checkId, input);
    const reported = input.executorResults.find((result) => result.checkId === checkId);
    results.push({
      checkId,
      stageNumber: input.brief.stageNumber,
      stageId: input.brief.stageId,
      attempt: input.attempt,
      outcome: verdict.outcome,
      expected: clip(verdict.expected, 500),
      measured: clip(verdict.measured, 500),
      detail: clip(verdict.detail, 2000),
      startedAtMs,
      durationMs: Math.max(0, input.clock.now().getTime() - startedAtMs),
      rawOutputPath: engineOwnedChecks.has(checkId) ? null : (reported?.rawOutputPath ?? null),
    });
  }
  return results;
}
