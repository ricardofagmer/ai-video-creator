import { type HyperframesProcessPort, type HyperframesProcessRequest } from './process-port';

/**
 * In-memory process port for tests (SPEC 0008 K11): records every request and answers with the
 * scripted exit codes in order (0 once the script runs out). It never starts a process.
 */
export class FakeHyperframesProcessPort implements HyperframesProcessPort {
  readonly requests: HyperframesProcessRequest[] = [];
  private readonly exitCodes: number[];

  constructor(exitCodes: readonly number[] = []) {
    this.exitCodes = [...exitCodes];
  }

  run(request: HyperframesProcessRequest): Promise<{ exitCode: number }> {
    this.requests.push({ ...request, args: [...request.args], env: { ...request.env } });
    return Promise.resolve({ exitCode: this.exitCodes.shift() ?? 0 });
  }
}
