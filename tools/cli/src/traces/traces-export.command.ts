import type { CommandDependencies } from '../commands/command-dependencies.js';
import { ExitCode } from '../errors/exit-codes.js';
import { TraceExportError } from './trace-errors.js';
import { traceExportReportLines } from './trace-export-text.js';
import { checkTraceOutput, writeTraceOutput } from './trace-output-file.js';
import { type TraceSource } from './trace-source.js';

export interface TracesExportOptions {
  /** A run id or a curation id (both ULIDs). */
  targetId: string;
  /** The `--out` file; never echoed nor logged. */
  out: string;
  /** Replace an existing regular file (ADR 0006 decision 2). */
  force: boolean;
}

export interface TracesExportContext {
  source: TraceSource;
  /** `--out` must lie outside it: the data home's files belong to their writers (RUN-FORMAT section 4). */
  dataHomeRoot: string;
}

/**
 * `studio traces export <runId|curationId> --out <file> [--force]` (SPEC 0006 R3-09, ADR 0006
 * option 2): maps the run's or curation's events.jsonl and session end lines to one OTLP JSON
 * trace and writes it to `--out`, the only file the command writes. An existing file is refused
 * without `--force`. No network: the owner loads the file into a viewer of their choice.
 */
export async function tracesExportCommand(
  options: TracesExportOptions,
  context: TracesExportContext,
  dependencies: Pick<CommandDependencies, 'printer' | 'signal'>,
): Promise<number> {
  const output = await checkTraceOutput({ path: options.out, force: options.force, dataHomeRoot: context.dataHomeRoot, targetId: options.targetId });
  const exported = await context.source.load(options.targetId, dependencies.signal);
  if (exported.summary.mappedLines === 0) throw new TraceExportError('source-empty', options.targetId);
  dependencies.signal.throwIfAborted();
  await writeTraceOutput(output, `${JSON.stringify(exported.document, null, 2)}\n`);
  for (const line of traceExportReportLines(exported.summary)) dependencies.printer.line(line);
  return ExitCode.ok;
}
