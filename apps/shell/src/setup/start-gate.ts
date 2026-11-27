import { type SetupProgress } from './setup-types';

/*
 * Whether the packaged menu's Start may run `studio start`. Services must not come up against a
 * data home setup has not finished preparing (a pending migration, no watcher agent), so Start is
 * answered by setup until the last setup run of this launch completed; setup's own step 8 then
 * starts the services. The answer is derived from this launch's progress only: setup runs at every
 * launch and no "setup done" flag is ever stored (`setup-record.ts`).
 */

/** `not-run`: no setup progress has been reported in this launch yet. */
export type IncompleteSetup = 'not-run' | Exclude<SetupProgress['phase'], 'complete'>;

export type StartGate = { readonly kind: 'start' } | { readonly kind: 'setup-first'; readonly setup: IncompleteSetup };

export function startGate(lastProgress: SetupProgress | null): StartGate {
  if (lastProgress === null) return { kind: 'setup-first', setup: 'not-run' };
  if (lastProgress.phase === 'complete') return { kind: 'start' };
  return { kind: 'setup-first', setup: lastProgress.phase };
}
