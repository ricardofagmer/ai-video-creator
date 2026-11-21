import { Injectable } from '@nestjs/common';
import { RunFileError, runDirectory } from '@studio/shared/run-files';
import { DataHome } from '../paths/data-home';
import { hasUploadStartedLine, isFileSystemError } from '../platforms/publish/attempt-upload-log';

/**
 * Whether an attempt sent nothing (SPEC 0007 section 5.10, finding C8). The watcher appends
 * `upload-started` to the run's `publications.jsonl` before the first byte leaves (section 5.5,
 * AC 48), so an attempt with no such line sent no byte. A file that cannot be read proves nothing:
 * the answer is then `false`, so the section 14 count errs towards counting the attempt.
 */
@Injectable()
export class AttemptUploadEvidence {
  constructor(private readonly dataHome: DataHome) {}

  async sentNoByte(attempt: { runId: string; attemptId: string }): Promise<boolean> {
    try {
      return !(await hasUploadStartedLine(runDirectory(this.dataHome.runs, attempt.runId), attempt.attemptId));
    } catch (error) {
      if (error instanceof RunFileError || isFileSystemError(error)) return false;
      throw error;
    }
  }
}
