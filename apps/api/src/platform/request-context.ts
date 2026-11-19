import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { type CorrelationId } from '@studio/shared/run-format';

/** The single user of the studio (D8); `decidedBy` of every decision the api records. */
export const OWNER_SUBJECT = 'owner';

export interface Principal {
  subject: typeof OWNER_SUBJECT;
  sessionId: string;
  /** ISO instant the session ends. */
  expiresAt: string;
}

export interface RequestContextState {
  correlationId: CorrelationId;
  principal: Principal | null;
}

/**
 * One store per request, opened by `CorrelationMiddleware` around the rest of the pipeline.
 * Module-level so the `@CurrentPrincipal()` decorator, which cannot be injected, reads the same store.
 */
const requestStorage = new AsyncLocalStorage<RequestContextState>();

export function currentRequestState(): RequestContextState | undefined {
  return requestStorage.getStore();
}

@Injectable()
export class RequestContext {
  run(state: RequestContextState, callback: () => void): void {
    requestStorage.run(state, callback);
  }

  correlationId(): CorrelationId | null {
    return requestStorage.getStore()?.correlationId ?? null;
  }

  setPrincipal(principal: Principal): void {
    const state = requestStorage.getStore();
    if (state !== undefined) state.principal = principal;
  }
}
