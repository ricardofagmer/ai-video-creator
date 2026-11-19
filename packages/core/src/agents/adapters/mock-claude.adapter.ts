import { setTimeout as delay } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { type ModelRoleName } from '@studio/shared/agents';
import { ProviderModeService, classifyProviderFailure, mockFaultSignal } from '../../providers';
import { ProviderCallError } from '../agents.errors';
import { type ClaudeAdapter, type ModelCall } from './claude-adapter';
import { mockResponders } from './mock-outputs';

/** Enough latency that a `stop` can land mid-call, short enough for an offline run. */
const MOCK_CALL_LATENCY_MS = 5;

/** What the mock reports as one call's step: no tokens, so the ledger records $0. */
const MOCK_STEP = { usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } };

/**
 * The default Claude adapter (ADR 0002 "Mock by default"): no key, no network, zero cost. It
 * honours the SPEC 0002 A12 fault scenario of the `claude` provider; faults are inert in live
 * mode because this adapter is never chosen there.
 *
 * - `authentication-error`: a 401 classified like a live one (never retried; run to `waiting`).
 * - `step-failure`: a transient server error (retried by the engine's attempts).
 * - `missing-output`: the call "succeeds" with no structured answer, which exercises the
 *   schema-feedback retry and then the typed invalid-output failure (criterion 11).
 */
@Injectable()
export class MockClaudeAdapter implements ClaudeAdapter {
  constructor(private readonly modes: ProviderModeService) {}

  async generate<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown> {
    const state = this.modes.modeOf('claude');
    const fault = state.mode === 'mock' ? state.fault : 'none';

    await call.hooks.beforeModelCall({ characters: call.prompt.body.length, fileParts: 0, fileBytes: 0 });
    await delay(MOCK_CALL_LATENCY_MS, undefined, { signal: call.signal });

    const signal = mockFaultSignal('claude', fault);
    if (signal !== null) throw new ProviderCallError(classifyProviderFailure(signal, new Date()));
    if (fault === 'step-failure') throw new ProviderCallError({ class: 'transient', provider: 'claude', reason: 'server-error' });

    call.hooks.afterModelCall(MOCK_STEP);
    if (fault === 'missing-output') return undefined;
    return mockResponders[call.role](call.packet);
  }
}
