import { Injectable, Logger } from '@nestjs/common';
import { type CurationEvent } from '@studio/shared/curation';
import { appendCurationEvent, type CurationLocation } from '@studio/shared/curation/files';
import { errorName } from '../platform/error-name';

/**
 * Writes the six watcher events of SPEC 0005 section 7 to `curations/<id>/events.jsonl` and copies
 * each to the daemon log (`logs/watcher.log`). Events are built from ids, reason ids, counts and
 * amounts only (K7, C5-AC-15), and the shared schema refuses any other field. A trace write that
 * fails never changes how the curation ends: it is logged by error name and the step goes on, so
 * a full disk cannot turn a recorded spend into an unrecorded outcome.
 */
@Injectable()
export class CurationEventRecorder {
  private readonly logger = new Logger(CurationEventRecorder.name);

  async record(location: CurationLocation, event: CurationEvent): Promise<void> {
    const { type, ...fields } = event;
    this.logger.log({ event: type, ...fields });
    try {
      await appendCurationEvent(location, event);
    } catch (error) {
      this.logger.warn({ event: 'curation.event-unwritten', curationId: event.curationId, type, error: errorName(error) });
    }
  }
}
