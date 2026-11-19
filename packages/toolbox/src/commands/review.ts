import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ApprovalSchema, publishChecklistItems, runFiles, type Approval, type PublishChecklistItem } from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { ExternalToolError, InputError } from '../errors';
import { encodePreview } from '../media/ffmpeg';
import { nextStepFor } from '../run/next-steps';
import { assertUpstreamUnchanged } from '../run/preconditions';
import { fileExists } from '../run/run-store';
import { applyEvent } from '../run/state';

const PREVIEW_MAX_BYTES = 12 * 1024 * 1024;
const previewableStates = new Set(['REVIEW', 'APPROVED', 'REJECTED']);

/** 720x1280 review copy under 12 MB for the artifact page. Never changes run state. */
export async function previewCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  if (!previewableStates.has(run.state)) throw new InputError(`preview needs a run in REVIEW (run is ${run.state})`, nextStepFor(run));
  const videoPath = join(runDir, runFiles.video);
  if (!(await fileExists(videoPath))) throw new InputError(`${runFiles.video} is missing in ${runDir}`, nextStepFor(run));
  const previewPath = join(runDir, runFiles.preview);
  context.log('encoding 720x1280 preview');
  await encodePreview(context.env.ffmpegPath, videoPath, previewPath);
  const { size } = await stat(previewPath);
  const sizeMb = (size / (1024 * 1024)).toFixed(2);
  if (size >= PREVIEW_MAX_BYTES) throw new ExternalToolError(`preview.mp4 is ${sizeMb} MB, over the 12 MB budget`, context.env.ffmpegPath);
  process.stdout.write(`preview: ${previewPath} (${sizeMb} MB)\n`);
  return { runId: run.runId, state: run.state, next: nextStepFor(run) };
}

function parseFlag(value: string, key: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
  if (['false', 'no', '0', 'n'].includes(normalized)) return false;
  throw new InputError(`checklist item ${key} must be true or false, got "${value}"`);
}

function isChecklistItem(key: string): key is PublishChecklistItem {
  return publishChecklistItems.some((item) => item === key);
}

/** "claimsVerified=true,toolFactsCurrent=true,..." -> all 8 items, absent ones false. */
function parseChecklist(text: string): Partial<Record<PublishChecklistItem, boolean>> {
  const checklist: Partial<Record<PublishChecklistItem, boolean>> = {};
  for (const item of publishChecklistItems) checklist[item] = false;
  for (const pair of text.split(',').map((part) => part.trim()).filter((part) => part.length > 0)) {
    const [key = '', value = ''] = pair.split('=').map((part) => part.trim());
    if (!isChecklistItem(key)) throw new InputError(`unknown checklist item "${key}"; expected ${publishChecklistItems.join(', ')}`);
    checklist[key] = parseFlag(value, key);
  }
  return checklist;
}

const ApproveOptionsSchema = z.object({
  decision: z.string().min(1),
  reviewer: z.string().trim().min(1).max(100),
  reason: z.string().max(1000).optional(),
  checklist: z.string().max(2000),
});

function parseApproveOptions(options: unknown): z.infer<typeof ApproveOptionsSchema> {
  const parsed = ApproveOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `--${issue.path.join('.')}: ${issue.message}`);
    throw new InputError(`invalid approve options: ${issues.join('; ')}`, 'run ace approve --help');
  }
  return parsed.data;
}

/** Records the human review decision (only from REVIEW). Never posts anything to TikTok. */
export async function approveCommand(context: CommandContext, runArgument: string, rawOptions: unknown): Promise<CommandOutcome> {
  const options = parseApproveOptions(rawOptions);
  const { runDir, run } = await context.openRun(runArgument);
  if (run.state !== 'REVIEW') throw new InputError(`approve needs a run in REVIEW (run is ${run.state})`, nextStepFor(run));
  await assertUpstreamUnchanged(runDir, run, 'all');
  const parsed = ApprovalSchema.safeParse({
    decision: options.decision.trim().toUpperCase(),
    reviewer: options.reviewer.trim(),
    reason: options.reason?.trim() || null,
    checklist: parseChecklist(options.checklist),
    decidedAt: new Date().toISOString(),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new InputError(`approval rejected: ${issues}`, `confirm every checklist item with the reviewer, then re-run ace approve ${run.runId}`);
  }
  const approval: Approval = parsed.data;
  const decided = applyEvent(
    { ...run, approval },
    { event: { type: 'REVIEW_DECIDED', decision: approval.decision }, actor: `reviewer:${approval.reviewer}`, reason: approval.reason },
  );
  const saved = await context.commit(runDir, decided);
  context.log(`${approval.decision} by ${approval.reviewer}. Nothing was posted to TikTok; publishing is manual in TikTok Studio.`);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
