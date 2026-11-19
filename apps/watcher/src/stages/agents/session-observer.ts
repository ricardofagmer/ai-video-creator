import { readdir } from 'node:fs/promises';
import type { StageExecutionContext } from '@studio/shared/ports';
import { readCostFile, readSessionLines, resolveInsideRun } from '@studio/shared/run-files';
import { runFileNames, type ModelUse, type SessionLine } from '@studio/shared/run-format';

const SESSION_FILE = /^([0-9A-HJKMNP-TV-Z]{26})\.jsonl$/;

type StartLine = Extract<SessionLine, { type: 'start' }>;
type EndLine = Extract<SessionLine, { type: 'end' }>;

/** Session ids present in `sessions/` now; an absent folder is an empty list. */
export async function listSessionIds(runDir: string): Promise<ReadonlySet<string>> {
  try {
    const names = await readdir(resolveInsideRun(runDir, runFileNames.sessionsDir));
    return new Set(names.flatMap((name) => SESSION_FILE.exec(name)?.[1] ?? []));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new Set();
    throw error;
  }
}

/**
 * Reports the sessions one agent call wrote. Core `AgentsService` (R1-12) writes
 * `sessions/<id>.jsonl` and records each billed call in cost.json, but its C7 return carries only
 * the output; this reads the new streams back (start: role and model, end: outcome) and the
 * session's cost.json entries, emits `session.started` / `session.ended` through the C6 sink and
 * collects the `ModelUse` the stage result names. Nothing is recorded a second time.
 */
export async function reportNewSessions(context: StageExecutionContext, before: ReadonlySet<string>, models: ModelUse[]): Promise<void> {
  const after = await listSessionIds(context.runDir);
  const fresh = [...after].filter((sessionId) => !before.has(sessionId)).sort();
  if (fresh.length === 0) return;
  const cost = await readCostFile(context.runDir);
  for (const sessionId of fresh) {
    const { entries } = await readSessionLines(context.runDir, sessionId);
    const start = entries.find((line): line is StartLine => line.type === 'start');
    if (start === undefined) continue;
    const end = entries.find((line): line is EndLine => line.type === 'end');
    const costUsd =
      cost.status === 'present'
        ? cost.value.sessions.filter((session) => session.sessionId === sessionId).reduce((total, session) => total + session.usd, 0)
        : 0;
    const identity = { sessionId, role: start.role, modelId: start.modelId };
    await context.events.emit({ type: 'session.started', level: 'agent', text: `Sessão iniciada: ${start.role}.`, ...identity });
    await context.events.emit({
      type: 'session.ended',
      level: 'agent',
      text: `Sessão encerrada: ${start.role} (${end?.outcome ?? 'failed'}).`,
      ...identity,
      outcome: end?.outcome ?? 'failed',
      costUsd: Math.max(0, costUsd),
    });
    models.push({ role: start.role, modelId: start.modelId });
  }
}
