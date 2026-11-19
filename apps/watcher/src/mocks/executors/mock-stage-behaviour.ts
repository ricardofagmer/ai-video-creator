import type { AgentsPort } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { writeFileAtomic, writeJsonAtomic } from '@studio/shared/run-files';
import {
  stageWorkPath,
  type CheckId,
  type DeclaredOutput,
  type ProviderName,
  type StageEstimate,
  type StageId,
  type StageLocation,
} from '@studio/shared/run-format';
import { type z } from 'zod';
import { type Clock } from '../../engine/clock';
import { type MockCostLedger } from '../mock-cost-ledger';

/** What a mock stage may use besides its execution context. */
export interface MockStageTools {
  agents: AgentsPort;
  ledger: MockCostLedger;
  clock: Clock;
}

/** One declared output and how to write it; the executor resolves the path inside the run. */
export interface MockOutputWrite {
  name: string;
  write(absolutePath: string): Promise<void>;
}

/**
 * The stage-specific part of a mock executor. `produce` returns the writes in declared order;
 * typed run files with their own C5 writer (manifest.json, cost.json, report.md) are written
 * inside `produce`. The `missing-output` fault omits the first returned write.
 */
export interface MockStageBehaviour {
  stageId: StageId;
  /** Provider whose mode carries the fault for this stage. */
  provider: ProviderName;
  estimate: StageEstimate;
  outputs(location: StageLocation): readonly DeclaredOutput[];
  produce(context: StageExecutionContext, tools: MockStageTools): Promise<readonly MockOutputWrite[]>;
  summary: string;
  /** `measured` text per check the executor reports; any other check reports "simulado". */
  evidence?: Partial<Record<CheckId, string>>;
}

export const zeroEstimate: StageEstimate = { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 };

/** A declared output inside the stage's own work folder. */
export function stageOutput(location: StageLocation, name: string, file: string, mimeType: string): DeclaredOutput {
  return { name, path: stageWorkPath(location, file), mimeType };
}

/** JSON written through C5 with its schema, so a mock never leaves an invalid artifact behind. */
export function jsonWrite<T>(name: string, schema: z.ZodType<T, unknown>, value: T): MockOutputWrite {
  return { name, write: async (absolutePath) => writeJsonAtomic(absolutePath, schema, value) };
}

export function bytesWrite(name: string, content: string | Uint8Array): MockOutputWrite {
  return { name, write: async (absolutePath) => writeFileAtomic(absolutePath, content) };
}

/** Placeholder media bytes: non-empty and clearly marked, never playable media. */
export function mockMediaBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`studio-mock-media:${label}\n`);
}
