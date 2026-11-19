import { Injectable } from '@nestjs/common';
import { readControlRequest, removeControlRequest } from '@studio/shared/run-files';
import { type ControlRequest } from '@studio/shared/run-format';
import { ownerTexts } from '../owner-texts';
import { type ControlDirective, type ControlRequestKind, type ControlState, type RunControlChannel } from '../seams';

const noRequest: ControlState = { directive: { kind: 'continue' }, resume: false, requests: [] };

/** `stop` wins over `pause`; `pause: false` written before the watcher acts cancels a pause (RUN-FORMAT 12). */
function directiveOf(request: ControlRequest): ControlDirective {
  if (request.stop) return { kind: 'stop', reason: ownerTexts.stopRequested };
  if (request.pause) return { kind: 'pause' };
  return { kind: 'continue' };
}

function requestsOf(request: ControlRequest): ControlRequestKind[] {
  const requests: ControlRequestKind[] = [];
  if (request.pause) requests.push('pause');
  if (request.stop) requests.push('stop');
  if (request.resume === true) requests.push('resume');
  return requests;
}

/**
 * Default `RUN_CONTROL`: `control.json`, written by the api or CLI and read through C5 (ADR 0003,
 * SPEC 0002 A6). The engine reads it between steps and while a step runs, and deletes it once an
 * execution owns the run.
 */
@Injectable()
export class ControlFileChannel implements RunControlChannel {
  async read(runDir: string): Promise<ControlState> {
    const request = await readControlRequest(runDir);
    if (request.status === 'absent') return noRequest;
    return { directive: directiveOf(request.value), resume: request.value.resume === true, requests: requestsOf(request.value) };
  }

  async clear(runDir: string): Promise<void> {
    await removeControlRequest(runDir);
  }
}
