import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { resolveInsideRunReal, writeFileAtomic } from '@studio/shared/run-files';
import {
  runFileNames,
  stageArchivePath,
  stageBriefPath,
  stageFolderName,
  stageInputManifestPath,
  type StepName,
} from '@studio/shared/run-format';
import { ownerTexts } from '../owner-texts';
import { isRunDirectory, listRunDirectory } from '../run-folder-files';
import { type StageWorkspace } from '../stage-workspace';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

interface ArchiveCopy {
  from: string;
  to: string;
}

/**
 * Step 6: copy the brief, the input manifest and the stage's check evidence into
 * `archive/<NN>-<stageId>/`; postcondition "the archive folder exists". The originals stay: C5
 * has no move or delete helper for stage files, and a later resume still reads the brief.
 */
@Injectable()
export class ArchiveStep implements StepHandler {
  readonly step: StepName = 'archive';

  async run({ workspace }: StepContext): Promise<StepOutcome> {
    const copies = await this.plannedCopies(workspace);
    for (const copy of copies) {
      const bytes = await readFile(await resolveInsideRunReal(workspace.runDir, copy.from));
      await writeFileAtomic(await resolveInsideRunReal(workspace.runDir, copy.to), bytes);
    }
    if (!(await isRunDirectory(workspace.runDir, stageArchivePath(workspace.location)))) {
      return postconditionFailed(this.step, stageArchivePath(workspace.location));
    }
    return { kind: 'passed', detail: ownerTexts.archived(copies.length) };
  }

  private async plannedCopies(workspace: StageWorkspace): Promise<ArchiveCopy[]> {
    const location = workspace.location;
    const archive = stageArchivePath(location);
    const checksFolder = `${runFileNames.checksDir}/${stageFolderName(location)}`;
    const checkFiles = await listRunDirectory(workspace.runDir, checksFolder);
    return [
      { from: stageBriefPath(location), to: `${archive}/brief.json` },
      { from: stageInputManifestPath(location), to: `${archive}/input-manifest.json` },
      ...checkFiles.map((file) => ({ from: `${checksFolder}/${file}`, to: `${archive}/${runFileNames.checksDir}/${file}` })),
    ];
  }
}
