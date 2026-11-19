import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ContentPillarSchema, RunIdSchema, TemplateIdSchema, type RunFile } from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError, isErrnoException } from '../errors';
import { nextStepFor } from '../run/next-steps';
import { writeRun } from '../run/run-store';

const InitOptionsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
  slot: z.coerce.number().int().min(1).max(4),
  topic: z.string().trim().min(3).max(300),
  pillar: z.string().transform((value) => value.toUpperCase()).pipe(ContentPillarSchema),
  template: z.string().transform((value) => value.toUpperCase()).pipe(TemplateIdSchema),
  channel: z.string().trim().min(1).max(64).optional(),
});

function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function parseOptions(options: unknown): z.infer<typeof InitOptionsSchema> {
  const parsed = InitOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `--${issue.path.join('.')}: ${issue.message}`);
    throw new InputError(`invalid init options: ${issues.join('; ')}`, 'run ace init --help');
  }
  return parsed.data;
}

/** Creates runs/<date>-s<slot>-<slug>/run.json in RESEARCH; the folder name is the idempotency key. */
export async function initCommand(context: CommandContext, options: unknown): Promise<CommandOutcome> {
  const input = parseOptions(options);
  const runIdResult = RunIdSchema.safeParse(`${input.date}-s${input.slot}-${slugify(input.topic)}`);
  if (!runIdResult.success) throw new InputError(`cannot build a runId from topic "${input.topic}"`, 'use a topic with letters or digits');
  const runId = runIdResult.data;
  const runDir = join(context.env.runsDir, runId);
  await mkdir(context.env.runsDir, { recursive: true });
  try {
    await mkdir(runDir);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'EEXIST') {
      throw new InputError(`run ${runId} already exists at ${runDir}`, `run ace status ${runId} to continue it, or use another slot`);
    }
    throw error;
  }
  const now = new Date().toISOString();
  const run: RunFile = {
    schemaVersion: 1,
    runId,
    channelId: input.channel ?? context.env.defaultChannelId,
    productionDate: input.date,
    slot: input.slot,
    topicSeed: input.topic,
    pillar: input.pillar,
    template: input.template,
    state: 'RESEARCH',
    failedStage: null,
    stateReason: null,
    manifestHashes: {},
    transitions: [{ from: null, to: 'RESEARCH', stage: null, actor: 'toolbox', reason: 'run created', inputHash: null, at: now }],
    costs: [],
    approval: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeRun(runDir, run);
  context.log(`created ${runDir}`);
  return { runId, state: run.state, next: nextStepFor(run) };
}
