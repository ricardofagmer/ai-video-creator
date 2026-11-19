import type { CredentialStatus, ProviderModePort, ProviderModeState } from '@studio/shared/ports';
import { providerFault, type MockFaultPlan } from './mock-fault';

/** Every provider in mock mode carrying the selected fault; mocks need no credential. */
export class MockProviderMode implements ProviderModePort {
  constructor(private readonly plan: MockFaultPlan) {}

  modeOf(): ProviderModeState {
    return { mode: 'mock', fault: providerFault(this.plan) };
  }

  async credentialStatus(): Promise<CredentialStatus> {
    return { status: 'not-required' };
  }
}
