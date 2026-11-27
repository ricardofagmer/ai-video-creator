import { type RunStatus } from '@studio/shared/run-format';

/**
 * Run statuses whose outputs are final: the run reached the review gate, so no stage rewrites them
 * any more. Saving an output (promote-from-run, save-video) or a learning needs one of these.
 */
export const REVIEWABLE_RUN_STATUSES: readonly RunStatus[] = ['review', 'approved', 'rejected'];
