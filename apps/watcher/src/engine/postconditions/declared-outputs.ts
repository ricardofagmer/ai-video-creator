import { type DeclaredOutput } from '@studio/shared/run-format';
import { probeRunPath, type RunFileProbe } from '../run-folder-files';

export interface MissingOutput {
  name: string;
  path: string;
  problem: 'absent' | 'empty' | 'not-a-file';
}

/** Absent or `false` means required (SPEC 0002 rev 4, section 13.6, A30). */
export function isOptionalOutput(output: DeclaredOutput): boolean {
  return output.optional === true;
}

/**
 * The verdict on one declared output: `null` when it meets A30, otherwise its problem. A required
 * output must exist as a non-empty regular file. An optional output may be absent; when present it
 * is held to the same rule as a required one.
 */
function outputProblem(output: DeclaredOutput, probe: RunFileProbe): MissingOutput['problem'] | null {
  if (probe.status === 'absent') return isOptionalOutput(output) ? null : 'absent';
  if (probe.status === 'not-a-file') return 'not-a-file';
  return probe.sizeBytes === 0 ? 'empty' : null;
}

/**
 * The `execute` postcondition (PRD 7.2 step 4, A30): every required output the stage brief declared
 * exists inside the run folder as a non-empty regular file, and every optional output that exists
 * is one too. It reads the brief written at step `brief`, never the executor's own report, so an
 * executor that claims success without its files fails here (criterion 11), and an executor cannot
 * mark an output optional at run time.
 */
export async function findMissingDeclaredOutputs(
  runDir: string,
  declaredOutputs: readonly DeclaredOutput[],
): Promise<MissingOutput[]> {
  const missing: MissingOutput[] = [];
  for (const output of declaredOutputs) {
    const problem = outputProblem(output, await probeRunPath(runDir, output.path));
    if (problem !== null) missing.push({ name: output.name, path: output.path, problem });
  }
  return missing;
}

/** True for an optional output that `execute` left absent; such an output is neither checked nor hashed. */
export async function isAbsentOptionalOutput(runDir: string, output: DeclaredOutput): Promise<boolean> {
  if (!isOptionalOutput(output)) return false;
  return (await probeRunPath(runDir, output.path)).status === 'absent';
}
