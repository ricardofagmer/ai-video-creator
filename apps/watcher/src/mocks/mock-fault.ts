import type { MockFaultScenario, ProviderModeState } from '@studio/shared/ports';
import { StageIdSchema, type StageId } from '@studio/shared/run-format';
import { z } from 'zod';

/** Token of the selected fault plan; bound only by the mock providers (`mock-providers.ts`). */
export const MOCK_FAULT_PLAN = Symbol('MOCK_FAULT_PLAN');

/**
 * Faults the mock executors reproduce: the C6 provider faults plus `verify-check-failure` (one
 * executor check fails on the first `verify` attempt, then passes on the repeat). The extra one is
 * executor-side only, so it never travels through `ProviderModePort`, whose C6 vocabulary is frozen.
 */
export type WatcherFaultScenario = MockFaultScenario | 'verify-check-failure';

const WatcherFaultScenarioSchema = z.enum([
  'none',
  'step-failure',
  'authentication-error',
  'missing-output',
  'verify-check-failure',
]) satisfies z.ZodType<WatcherFaultScenario>;

/**
 * SPEC 0002 A12: one named fault, reproduced by the mock executor of one stage. The fault reaches
 * the executor through `ProviderModePort`, so a live provider mode makes it inert.
 */
export interface MockFaultPlan {
  scenario: WatcherFaultScenario;
  stageId: StageId;
}

/** The script stage carries a model call, a declared output and an executor check, so every scenario applies there. */
const DEFAULT_FAULT_STAGE: StageId = 'script';

export const noMockFault: MockFaultPlan = { scenario: 'none', stageId: DEFAULT_FAULT_STAGE };

export class InvalidMockFaultError extends Error {
  constructor(readonly value: string) {
    super(`Invalid mock fault "${value}": expected <scenario>[@<stageId>] with scenario ${WatcherFaultScenarioSchema.options.join(', ')}`);
    this.name = 'InvalidMockFaultError';
  }
}

/** Parses `<scenario>` or `<scenario>@<stageId>`, e.g. `missing-output@script`. */
export function parseMockFault(value: string): MockFaultPlan {
  const [scenarioText, stageText, ...rest] = value.split('@');
  const scenario = WatcherFaultScenarioSchema.safeParse(scenarioText);
  const stage = StageIdSchema.safeParse(stageText ?? DEFAULT_FAULT_STAGE);
  if (!scenario.success || !stage.success || rest.length > 0) throw new InvalidMockFaultError(value);
  return { scenario: scenario.data, stageId: stage.data };
}

/** The provider-facing part of a plan: an executor-only scenario leaves every provider fault-free. */
export function providerFault(plan: MockFaultPlan): MockFaultScenario {
  return plan.scenario === 'verify-check-failure' ? 'none' : plan.scenario;
}

/** The scenario to reproduce for one stage; `none` in live mode or for any other stage. */
export function activeFault(plan: MockFaultPlan, stageId: StageId, mode: ProviderModeState): WatcherFaultScenario {
  if (mode.mode !== 'mock' || plan.stageId !== stageId) return 'none';
  return plan.scenario === 'verify-check-failure' ? plan.scenario : mode.fault;
}
