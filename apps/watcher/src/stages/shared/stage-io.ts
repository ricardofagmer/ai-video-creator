import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { StageExecutionContext } from '@studio/shared/ports';
import { readJsonFile, readOptionalJsonFile, resolveInsideRun, writeFileAtomic, writeJsonAtomic } from '@studio/shared/run-files';
import { stageWorkPath, type DeclaredOutput, type StageInput, type StageLocation } from '@studio/shared/run-format';
import { type z } from 'zod';
import { MissingStageInputError, UndeclaredStageOutputError } from './stage-errors';

/** A declared output in the stage's own work folder. */
export function stageOutput(location: StageLocation, name: string, file: string, mimeType: string): DeclaredOutput {
  return { name, path: stageWorkPath(location, file), mimeType };
}

export function findStageInput(context: StageExecutionContext, name: string): StageInput | undefined {
  return context.stageBrief.inputs.find((candidate) => candidate.name === name);
}

/** An earlier stage's recorded output, pinned in this stage's brief and validated by its schema. */
async function readStageInput<T>(
  context: StageExecutionContext,
  name: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  const input = findStageInput(context, name);
  if (input === undefined) throw new MissingStageInputError(context.stage.stageId, name);
  return readJsonFile(resolveInsideRun(context.runDir, input.path), schema);
}

export async function readOptionalStageInput<T>(
  context: StageExecutionContext,
  name: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T | null> {
  return findStageInput(context, name) === undefined ? null : readStageInput(context, name, schema);
}

/** This stage's own declared output, read back at `verify`; null when `execute` left it absent. */
export async function readOwnOutput<T>(
  context: StageExecutionContext,
  name: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T | null> {
  const declared = context.stageBrief.declaredOutputs.find((candidate) => candidate.name === name);
  if (declared === undefined) throw new UndeclaredStageOutputError(context.stage.stageId, name);
  const result = await readOptionalJsonFile(resolveInsideRun(context.runDir, declared.path), schema);
  return result.status === 'present' ? result.value : null;
}

export async function sha256OfFile(absolutePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Writes the stage's declared outputs through the C5 helpers only, resolving each name against
 * the stage brief. `omit` is the A12 `missing-output` mock fault: that output is skipped while the
 * stage still reports success, so the engine's postcondition must catch it (criterion 11).
 */
export class StageOutputSink {
  constructor(
    private readonly context: StageExecutionContext,
    private readonly omit: string | null,
  ) {}

  pathOf(name: string): string {
    return this.declared(name).path;
  }

  absolutePathOf(name: string): string {
    return resolveInsideRun(this.context.runDir, this.pathOf(name));
  }

  async writeJson<T>(name: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: T): Promise<void> {
    const target = this.absolutePathOf(name);
    if (name === this.omit) return;
    await writeJsonAtomic(target, schema, value);
  }

  async writeBytes(name: string, content: string | Uint8Array): Promise<void> {
    const target = this.absolutePathOf(name);
    if (name === this.omit) return;
    await writeFileAtomic(target, content);
  }

  /** A declared output with its own C5 writer (`writeRunManifest`, `writeCostFile`, ...). */
  async writeWith(name: string, write: () => Promise<void>): Promise<void> {
    this.declared(name);
    if (name === this.omit) return;
    await write();
  }

  /** Media produced in a scratch folder enters the run through the C5 atomic write. */
  async adoptFile(name: string, scratchPath: string): Promise<void> {
    await this.writeBytes(name, await readFile(scratchPath));
  }

  private declared(name: string): DeclaredOutput {
    const declared = this.context.stageBrief.declaredOutputs.find((candidate) => candidate.name === name);
    if (declared === undefined) throw new UndeclaredStageOutputError(this.context.stage.stageId, name);
    return declared;
  }
}
