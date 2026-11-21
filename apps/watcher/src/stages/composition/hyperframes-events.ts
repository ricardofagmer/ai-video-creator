import { Logger } from '@nestjs/common';
import { HYPERFRAMES_PIN, type HyperframesRefusalReason } from '@studio/shared/hyperframes';

/*
 * The two watcher events of SPEC 0008 section 7. They carry ids, a reason id, counts and a
 * duration only: never a variable value, a path or child stderr (K12, AC 81).
 */

const logger = new Logger('HyperframesRender');

export interface HyperframesEventSubject {
  runId: string;
  stepKey: string;
  templateRef: string;
}

export function recordRenderRefused(subject: HyperframesEventSubject, reasonId: HyperframesRefusalReason): void {
  logger.warn({ event: 'hyperframes.render-refused', runId: subject.runId, stepKey: subject.stepKey, templateRef: subject.templateRef, reasonId });
}

export function recordRenderFinished(subject: HyperframesEventSubject, outcome: { ok: boolean; renderSeconds: number | null; variableCount: number }): void {
  logger.log({
    event: 'hyperframes.render-finished',
    runId: subject.runId,
    stepKey: subject.stepKey,
    templateRef: subject.templateRef,
    pin: HYPERFRAMES_PIN,
    ok: outcome.ok,
    renderSeconds: outcome.renderSeconds,
    variableCount: outcome.variableCount,
  });
}
